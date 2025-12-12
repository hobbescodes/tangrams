import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

import consola from "consola";

import { getAdapter } from "@/adapters";
import { normalizeGenerates } from "./config";

const require = createRequire(import.meta.url);

/**
 * Validate that TanStack Start dependencies are installed when serverFunctions is enabled
 */
function validateServerFunctionsRequirements(
  sourceName: string,
  serverFunctions: boolean,
): void {
  if (!serverFunctions) return;

  // Check for @tanstack/react-start
  try {
    require.resolve("@tanstack/react-start");
  } catch {
    throw new Error(
      `Source "${sourceName}" has serverFunctions enabled but @tanstack/react-start is not installed.\n` +
        `TanStack Start requires both @tanstack/react-router and @tanstack/react-start.\n` +
        `Install them with: bun add @tanstack/react-router @tanstack/react-start`,
    );
  }
}

import type { GraphQLAdapter, GraphQLAdapterSchema } from "@/adapters/types";
import type {
  FormFilesConfig,
  GraphQLSourceConfig,
  QueryFilesConfig,
  SourceConfig,
  TangramsConfig,
  ZodFilesConfig,
} from "./config";

export interface GenerateOptions {
  config: TangramsConfig;
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
  const zodSourceNames: string[] = [];
  const querySourceNames: string[] = [];
  const formSourceNames: string[] = [];

  // Process each source
  for (const source of config.sources) {
    const generates = normalizeGenerates(source.generates);
    const baseOutputDir = join(process.cwd(), config.output);

    // Load schema once per source
    const adapter = getAdapter(source.type);
    let schema: unknown;
    const cacheKey = `source:${source.name}`;

    if (cachedSchemas?.has(cacheKey)) {
      consola.info(`\nUsing cached schema for: ${source.name}`);
      schema = cachedSchemas.get(cacheKey);
    } else {
      consola.info(`\nLoading schema for: ${source.name} (${source.type})`);
      schema = await adapter.loadSchema(source);
      consola.success("Schema loaded");
    }

    // Cache the schema
    generatedSchemas.set(cacheKey, schema);

    // Determine if we need to generate Zod schemas
    // - OpenAPI: Always (Zod is the primary type system)
    // - GraphQL: Only when form generation is enabled
    const needsZodSchemas =
      source.type === "openapi" ||
      (source.type === "graphql" && generates.form);

    // Track paths for import resolution
    let zodSchemaPath: string | undefined;

    // Step 1: Generate Zod schemas if needed
    if (needsZodSchemas) {
      zodSchemaPath = await generateZodSchemas({
        source,
        baseOutputDir,
        files: generates.zod.files,
        schema,
      });
      zodSourceNames.push(source.name);
    }

    // Step 2: Generate query files if enabled
    if (generates.query) {
      await generateQueryFiles({
        source,
        baseOutputDir,
        files: generates.query.files,
        schema,
        force,
        zodSchemaPath,
        serverFunctions: generates.query.serverFunctions,
      });
      querySourceNames.push(source.name);
    }

    // Step 3: Generate form files if enabled
    if (generates.form && zodSchemaPath) {
      await generateFormFiles({
        source,
        baseOutputDir,
        files: generates.form.files,
        schema,
        zodSchemaPath,
      });
      formSourceNames.push(source.name);
    }
  }

  // Build output summary
  if (zodSourceNames.length > 0) {
    generatedOutputs.push(`zod (${zodSourceNames.join(", ")})`);
  }
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

// =============================================================================
// Zod Schema Generation
// =============================================================================

interface GenerateZodSchemasOptions {
  source: SourceConfig;
  baseOutputDir: string;
  files: ZodFilesConfig;
  schema: unknown;
}

/**
 * Generate Zod schemas for a source
 * Outputs to: zod/<source-name>/schema.ts
 * Returns the absolute path to the generated schema file
 */
async function generateZodSchemas(
  options: GenerateZodSchemasOptions,
): Promise<string> {
  const { source, baseOutputDir, files, schema } = options;

  consola.info(`Generating Zod schemas for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const zodOutputDir = join(baseOutputDir, "zod", source.name);

  // Ensure output directory exists
  await mkdir(zodOutputDir, { recursive: true });

  // Generate Zod schemas
  const schemaGenOptions = {
    scalars: getScalarsFromSource(source),
  };
  const result = adapter.generateSchemas(schema, source, schemaGenOptions);

  // Log any warnings
  if (result.warnings) {
    for (const warning of result.warnings) {
      consola.warn(warning);
    }
  }

  const schemaPath = join(zodOutputDir, files.schema);
  await writeFile(schemaPath, result.content, "utf-8");
  consola.success(`Generated zod/${source.name}/${files.schema}`);

  return schemaPath;
}

// =============================================================================
// Query Generation
// =============================================================================

interface GenerateQueryFilesOptions {
  source: SourceConfig;
  baseOutputDir: string;
  files: QueryFilesConfig;
  schema: unknown;
  force: boolean;
  /** Path to Zod schema file (for OpenAPI - types come from here) */
  zodSchemaPath?: string;
  /** Enable TanStack Start server functions wrapping */
  serverFunctions?: boolean;
}

/**
 * Generate query files for a source
 * Outputs to: query/<source-name>/
 *   - client.ts
 *   - types.ts (GraphQL only - OpenAPI uses zod schemas)
 *   - operations.ts
 */
async function generateQueryFiles(
  options: GenerateQueryFilesOptions,
): Promise<void> {
  const {
    source,
    baseOutputDir,
    files,
    schema,
    force,
    zodSchemaPath,
    serverFunctions = false,
  } = options;

  // Validate TanStack Start dependencies if serverFunctions is enabled
  validateServerFunctionsRequirements(source.name, serverFunctions);

  consola.info(`Generating query files for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const queryOutputDir = join(baseOutputDir, "query", source.name);

  // Ensure output directory exists
  await mkdir(queryOutputDir, { recursive: true });

  // Step 1: Generate client (only if it doesn't exist or force is true)
  const clientPath = join(queryOutputDir, files.client);
  const clientExists = await fileExists(clientPath);

  if (clientExists && !force) {
    consola.info(
      `Skipping ${files.client} (already exists, use --force to regenerate)`,
    );
  } else {
    const clientResult = adapter.generateClient(schema, source);
    await writeFile(clientPath, clientResult.content, "utf-8");
    consola.success(`Generated query/${source.name}/${files.client}`);
  }

  // Step 2: Determine types path
  // - GraphQL: Generate types.ts in query/<source>/
  // - OpenAPI: Use zod/<source>/schema.ts
  let typesPath: string;

  if (source.type === "graphql") {
    // GraphQL generates TypeScript types
    const graphqlAdapter = adapter as GraphQLAdapter;
    const typeGenOptions = {
      scalars: getScalarsFromSource(source),
    };
    const typesResult = graphqlAdapter.generateTypes(
      schema as GraphQLAdapterSchema,
      source,
      typeGenOptions,
    );

    // Log any warnings
    if (typesResult.warnings) {
      for (const warning of typesResult.warnings) {
        consola.warn(warning);
      }
    }

    typesPath = join(queryOutputDir, files.types);
    await writeFile(typesPath, typesResult.content, "utf-8");
    consola.success(`Generated query/${source.name}/${files.types}`);
  } else {
    // OpenAPI uses Zod schemas from zod/<source>/schema.ts
    if (!zodSchemaPath) {
      throw new Error(
        `OpenAPI source "${source.name}" requires Zod schemas but none were generated`,
      );
    }
    typesPath = zodSchemaPath;
  }

  // Step 3: Generate operations
  const operationsPath = join(queryOutputDir, files.operations);

  // Calculate relative import paths
  const operationsDir = dirname(operationsPath);
  const clientImportPath = `./${relative(operationsDir, clientPath).replace(/\.ts$/, "")}`;
  const typesImportPath = `./${relative(operationsDir, typesPath).replace(/\.ts$/, "")}`;

  const operationsResult = adapter.generateOperations(schema, source, {
    clientImportPath,
    typesImportPath,
    sourceName: source.name,
    serverFunctions,
  });
  await writeFile(operationsPath, operationsResult.content, "utf-8");
  consola.success(`Generated query/${source.name}/${files.operations}`);
}

// =============================================================================
// Form Generation
// =============================================================================

interface GenerateFormFilesOptions {
  source: SourceConfig;
  baseOutputDir: string;
  files: FormFilesConfig;
  schema: unknown;
  zodSchemaPath: string;
}

/**
 * Generate form files for a source
 * Outputs to: form/<source-name>/forms.ts
 */
async function generateFormFiles(
  options: GenerateFormFilesOptions,
): Promise<void> {
  const { source, baseOutputDir, files, schema, zodSchemaPath } = options;

  consola.info(`Generating form files for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const formOutputDir = join(baseOutputDir, "form", source.name);

  // Ensure output directory exists
  await mkdir(formOutputDir, { recursive: true });

  // Generate form options
  const formsPath = join(formOutputDir, files.forms);

  // Calculate relative import path from forms to zod schema
  const formsDir = dirname(formsPath);
  const schemaImportPath = `./${relative(formsDir, zodSchemaPath).replace(/\.ts$/, "")}`;

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
  consola.success(`Generated form/${source.name}/${files.forms}`);
}

// =============================================================================
// Utilities
// =============================================================================

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
