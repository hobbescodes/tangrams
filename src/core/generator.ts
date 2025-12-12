import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import consola from "consola";

import { getAdapter } from "@/adapters";

import type {
  GraphQLSourceConfig,
  QueryConfig,
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

  // Process query config if present
  if (config.query) {
    const { sources, files } = config.query;

    // Process each source
    for (const source of sources) {
      await generateForSource({
        source,
        queryConfig: config.query,
        outputDir: config.output,
        files,
        force,
        cachedSchema: cachedSchemas?.get(source.name),
        generatedSchemas,
      });
    }

    // Final success message
    const sourceNames = sources.map((s) => s.name).join(", ");
    consola.box({
      title: "Generation Complete",
      message: `Generated code for sources: ${sourceNames}\nOutput directory: ${config.output}/query`,
    });
  }

  return { schemas: generatedSchemas };
}

interface GenerateForSourceOptions {
  source: SourceConfig;
  queryConfig: QueryConfig;
  outputDir: string;
  files: QueryConfig["files"];
  force: boolean;
  cachedSchema?: unknown;
  generatedSchemas: Map<string, unknown>;
}

/**
 * Generate code for a single source
 */
async function generateForSource(
  options: GenerateForSourceOptions,
): Promise<void> {
  const {
    source,
    queryConfig,
    outputDir,
    files,
    force,
    cachedSchema,
    generatedSchemas,
  } = options;

  consola.info(`\nProcessing source: ${source.name} (${source.type})`);

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
  generatedSchemas.set(source.name, schema);

  // Create generation context
  const context = {
    queryConfig,
    outputDir: sourceOutputDir,
  };

  // Step 2: Generate client (only if it doesn't exist or force is true)
  const clientPath = join(sourceOutputDir, files.client);
  const clientExists = await fileExists(clientPath);

  if (clientExists && !force) {
    consola.info(
      `Skipping ${files.client} (already exists, use --force to regenerate)`,
    );
  } else {
    consola.info("Generating client...");
    const clientResult = adapter.generateClient(schema, source, context);
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
  consola.success(`Source "${source.name}" complete`);
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
