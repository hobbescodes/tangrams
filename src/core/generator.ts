import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import consola from "consola";

import { getAdapter } from "@/adapters";
import { normalizeGenerates } from "./config";

import type {
  FormFilesConfig,
  GraphQLSourceConfig,
  QueryFilesConfig,
  SourceConfig,
  TangenConfig,
} from "./config";

export interface GenerateOptions {
  config: TangenConfig;
  force?: boolean;
  /**
   * Cached schemas by source name.
   * Used by watch mode for faster rebuilds when only documents change.
   */
  cachedSchemas?: Map<string, unknown>;
}

export interface GenerateResult {
  /**
   * Generated schemas by source name.
   * These can be cached and passed back for incremental rebuilds.
   */
  schemas: Map<string, unknown>;
}

/**
 * Check if a file exists (Node.js compatible)
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main generation orchestrator
 * Processes all configured sources and generates code for each
 */
export async function generate(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { config, force = false, cachedSchemas } = options;
  const generatedSchemas = new Map<string, unknown>();
  const generatedOutputs: string[] = [];

  // Track what was generated
  const querySourceNames: string[] = [];
  const formSourceNames: string[] = [];

  // Process each source
  for (const source of config.sources) {
    const generates = normalizeGenerates(source.generates);

    // Generate query code if enabled
    if (generates.query) {
      await generateQueryForSource({
        source,
        outputDir: config.output,
        files: generates.query.files,
        force,
        cachedSchema: cachedSchemas?.get(`query:${source.name}`),
        generatedSchemas,
        cacheKeyPrefix: "query:",
      });
      querySourceNames.push(source.name);
    }

    // Generate form code if enabled
    if (generates.form) {
      await generateFormForSource({
        source,
        outputDir: config.output,
        files: generates.form.files,
        cachedSchema: cachedSchemas?.get(`form:${source.name}`),
        generatedSchemas,
        cacheKeyPrefix: "form:",
      });
      formSourceNames.push(source.name);
    }
  }

  // Build output summary
  if (querySourceNames.length > 0) {
    generatedOutputs.push(`query (${querySourceNames.join(", ")})`);
  }
  if (formSourceNames.length > 0) {
    generatedOutputs.push(`form (${formSourceNames.join(", ")})`);
  }

  // Final success message
  if (generatedOutputs.length > 0) {
    consola.box({
      title: "Generation Complete",
      message: `Generated: ${generatedOutputs.join(", ")}\nOutput directory: ${config.output}`,
    });
  }

  return { schemas: generatedSchemas };
}

interface GenerateQueryForSourceOptions {
  source: SourceConfig;
  outputDir: string;
  files: QueryFilesConfig;
  force: boolean;
  cachedSchema?: unknown;
  generatedSchemas: Map<string, unknown>;
  cacheKeyPrefix: string;
}

/**
 * Generate query code for a single source
 */
async function generateQueryForSource(
  options: GenerateQueryForSourceOptions,
): Promise<void> {
  const {
    source,
    outputDir,
    files,
    force,
    cachedSchema,
    generatedSchemas,
    cacheKeyPrefix,
  } = options;

  consola.info(`\nProcessing query source: ${source.name} (${source.type})`);

  // Get the adapter for this source type
  const adapter = getAdapter(source.type);

  // Always output to query/<source-name>/ for consistency
  const baseOutputDir = join(process.cwd(), outputDir);
  const sourceOutputDir = join(baseOutputDir, "query", source.name);

  // Ensure output directory exists
  await mkdir(sourceOutputDir, { recursive: true });

  // Step 1: Load schema (or use cached)
  let schema: unknown;
  if (cachedSchema) {
    consola.info("Using cached schema...");
    schema = cachedSchema;
  } else {
    consola.info("Loading schema...");
    schema = await adapter.loadSchema(source);
    consola.success("Schema loaded");
  }

  // Store schema for caching
  generatedSchemas.set(`${cacheKeyPrefix}${source.name}`, schema);

  // Step 2: Generate client (only if it doesn't exist or force is true)
  const clientPath = join(sourceOutputDir, files.client);
  const clientExists = await fileExists(clientPath);

  if (clientExists && !force) {
    consola.info(
      `Skipping ${files.client} (already exists, use --force to regenerate)`,
    );
  } else {
    consola.info("Generating client...");
    const clientResult = adapter.generateClient(schema, source);
    await writeFile(clientPath, clientResult.content, "utf-8");
    consola.success(`Generated ${files.client}`);
  }

  // Step 3: Generate types
  consola.info("Generating types...");
  const typeGenOptions = {
    scalars: getScalarsFromSource(source),
  };
  const typesResult = adapter.generateTypes(schema, source, typeGenOptions);

  // Log any warnings
  if (typesResult.warnings) {
    for (const warning of typesResult.warnings) {
      consola.warn(warning);
    }
  }

  const typesPath = join(sourceOutputDir, files.types);
  await writeFile(typesPath, typesResult.content, "utf-8");
  consola.success(`Generated ${files.types}`);

  // Step 4: Generate operations
  consola.info("Generating operations...");
  const operationsPath = join(sourceOutputDir, files.operations);

  // Calculate relative import paths
  const operationsDir = dirname(operationsPath);
  const clientImportPath = `./${relative(operationsDir, clientPath).replace(/\.ts$/, "")}`;
  const typesImportPath = `./${relative(operationsDir, typesPath).replace(/\.ts$/, "")}`;

  const operationsResult = adapter.generateOperations(schema, source, {
    clientImportPath,
    typesImportPath,
    sourceName: source.name,
  });
  await writeFile(operationsPath, operationsResult.content, "utf-8");
  consola.success(`Generated ${files.operations}`);

  // Log source generation complete
  consola.success(`Query source "${source.name}" complete`);
}

interface GenerateFormForSourceOptions {
  source: SourceConfig;
  outputDir: string;
  files: FormFilesConfig;
  cachedSchema?: unknown;
  generatedSchemas: Map<string, unknown>;
  cacheKeyPrefix: string;
}

/**
 * Generate form code for a single source
 */
async function generateFormForSource(
  options: GenerateFormForSourceOptions,
): Promise<void> {
  const {
    source,
    outputDir,
    files,
    cachedSchema,
    generatedSchemas,
    cacheKeyPrefix,
  } = options;

  consola.info(`\nProcessing form source: ${source.name} (${source.type})`);

  // Get the adapter for this source type
  const adapter = getAdapter(source.type);

  // Output structure:
  // - schema/<source-name>/types.ts (Zod schemas)
  // - form/<source-name>/forms.ts (form options)
  const baseOutputDir = join(process.cwd(), outputDir);
  const schemaOutputDir = join(baseOutputDir, "schema", source.name);
  const formOutputDir = join(baseOutputDir, "form", source.name);

  // Ensure output directories exist
  await mkdir(schemaOutputDir, { recursive: true });
  await mkdir(formOutputDir, { recursive: true });

  // Step 1: Load schema (or use cached)
  let schema: unknown;
  if (cachedSchema) {
    consola.info("Using cached schema...");
    schema = cachedSchema;
  } else {
    consola.info("Loading schema...");
    schema = await adapter.loadSchema(source);
    consola.success("Schema loaded");
  }

  // Store schema for caching
  generatedSchemas.set(`${cacheKeyPrefix}${source.name}`, schema);

  // Step 2: Generate Zod schemas (for mutations only)
  consola.info("Generating Zod schemas...");
  const schemaGenOptions = {
    scalars: getScalarsFromSource(source),
    mutationsOnly: true,
  };
  const schemasResult = adapter.generateSchemas(
    schema,
    source,
    schemaGenOptions,
  );

  // Log any warnings
  if (schemasResult.warnings) {
    for (const warning of schemasResult.warnings) {
      consola.warn(warning);
    }
  }

  const schemaPath = join(schemaOutputDir, "types.ts");
  await writeFile(schemaPath, schemasResult.content, "utf-8");
  consola.success("Generated schema/types.ts");

  // Step 3: Generate form options
  consola.info("Generating form options...");
  const formsPath = join(formOutputDir, files.forms);

  // Calculate relative import path from forms to schema
  const formsDir = dirname(formsPath);
  const schemaImportPath = `./${relative(formsDir, schemaPath).replace(/\.ts$/, "")}`;

  const formResult = adapter.generateFormOptions(schema, source, {
    schemaImportPath,
    sourceName: source.name,
  });

  // Log any warnings
  if (formResult.warnings) {
    for (const warning of formResult.warnings) {
      consola.warn(warning);
    }
  }

  await writeFile(formsPath, formResult.content, "utf-8");
  consola.success(`Generated form/${files.forms}`);

  // Log source generation complete
  consola.success(`Form source "${source.name}" complete`);
}

/**
 * Extract scalars configuration from a source (if applicable)
 */
function getScalarsFromSource(
  source: SourceConfig,
): Record<string, string> | undefined {
  if (source.type === "graphql") {
    return (source as GraphQLSourceConfig).scalars;
  }
  return undefined;
}
