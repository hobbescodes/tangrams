import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import consola from "consola";

import { getAdapter } from "@/adapters";
import { normalizeGenerates } from "./config";

import type { GraphQLAdapter, GraphQLAdapterSchema } from "@/adapters/types";
import type {
  FormFilesConfig,
  GraphQLSourceConfig,
  QueryFilesConfig,
  SourceConfig,
  StartFilesConfig,
  TangramsConfig,
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
 *
 * New output structure:
 *   <output>/<source-name>/
 *     ├── client.ts          # shared client (always)
 *     ├── schema.ts          # zod schemas (when needed)
 *     ├── query/
 *     │   ├── types.ts       # GraphQL only
 *     │   └── operations.ts
 *     ├── start/
 *     │   └── functions.ts   # server functions
 *     └── form/
 *         └── forms.ts
 */
export async function generate(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { config, force = false, cachedSchemas } = options;
  const generatedSchemas = new Map<string, unknown>();
  const generatedOutputs: string[] = [];

  // Track what was generated per source
  const querySourceNames: string[] = [];
  const startSourceNames: string[] = [];
  const formSourceNames: string[] = [];

  // Process each source
  for (const source of config.sources) {
    const generates = normalizeGenerates(source.generates);
    const baseOutputDir = join(process.cwd(), config.output);
    const sourceOutputDir = join(baseOutputDir, source.name);

    // Ensure source directory exists
    await mkdir(sourceOutputDir, { recursive: true });

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
    // - GraphQL: When form or start generation is enabled
    const needsZodSchemas =
      source.type === "openapi" ||
      (source.type === "graphql" &&
        (generates.form ||
          generates.start ||
          generates.query?.serverFunctions));

    // Track paths for import resolution
    let schemaPath: string | undefined;
    const clientPath = join(sourceOutputDir, generates.files.client);

    // Step 1: Generate client (always, at source root)
    await generateClientFile({
      source,
      sourceOutputDir,
      clientFilename: generates.files.client,
      schema,
      force,
    });

    // Step 2: Generate Zod schemas if needed (at source root)
    if (needsZodSchemas) {
      schemaPath = await generateSchemaFile({
        source,
        sourceOutputDir,
        schemaFilename: generates.files.schema,
        schema,
      });
    }

    // Step 3: Generate start files if enabled OR if query.serverFunctions is true
    // We need to generate start files BEFORE query files when serverFunctions is enabled
    // because query operations will import from start
    const shouldGenerateStart =
      generates.start || generates.query?.serverFunctions;
    let startFunctionsPath: string | undefined;

    if (shouldGenerateStart) {
      startFunctionsPath = await generateStartFiles({
        source,
        sourceOutputDir,
        files: generates.start?.files ?? { functions: "functions.ts" },
        schema,
        clientPath,
        schemaPath,
      });
      startSourceNames.push(source.name);
    }

    // Step 4: Generate query files if enabled
    if (generates.query) {
      await generateQueryFiles({
        source,
        sourceOutputDir,
        files: generates.query.files,
        schema,
        clientPath,
        schemaPath,
        serverFunctions: generates.query.serverFunctions,
        startFunctionsPath,
      });
      querySourceNames.push(source.name);
    }

    // Step 5: Generate form files if enabled
    if (generates.form && schemaPath) {
      await generateFormFiles({
        source,
        sourceOutputDir,
        files: generates.form.files,
        schema,
        schemaPath,
      });
      formSourceNames.push(source.name);
    }
  }

  // Build output summary
  if (querySourceNames.length > 0) {
    generatedOutputs.push(`query (${querySourceNames.join(", ")})`);
  }
  if (startSourceNames.length > 0) {
    generatedOutputs.push(`start (${startSourceNames.join(", ")})`);
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
// Client Generation
// =============================================================================

interface GenerateClientFileOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  clientFilename: string;
  schema: unknown;
  force: boolean;
}

/**
 * Generate client file for a source
 * Outputs to: <source-name>/client.ts
 */
async function generateClientFile(
  options: GenerateClientFileOptions,
): Promise<void> {
  const { source, sourceOutputDir, clientFilename, schema, force } = options;

  const clientPath = join(sourceOutputDir, clientFilename);
  const clientExists = await fileExists(clientPath);

  if (clientExists && !force) {
    consola.info(
      `Skipping ${clientFilename} (already exists, use --force to regenerate)`,
    );
    return;
  }

  const adapter = getAdapter(source.type);
  const clientResult = adapter.generateClient(schema, source);
  await writeFile(clientPath, clientResult.content, "utf-8");
  consola.success(`Generated ${source.name}/${clientFilename}`);
}

// =============================================================================
// Schema Generation
// =============================================================================

interface GenerateSchemaFileOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  schemaFilename: string;
  schema: unknown;
}

/**
 * Generate Zod schema file for a source
 * Outputs to: <source-name>/schema.ts
 * Returns the absolute path to the generated schema file
 */
async function generateSchemaFile(
  options: GenerateSchemaFileOptions,
): Promise<string> {
  const { source, sourceOutputDir, schemaFilename, schema } = options;

  consola.info(`Generating Zod schemas for: ${source.name}`);

  const adapter = getAdapter(source.type);
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

  const schemaPath = join(sourceOutputDir, schemaFilename);
  await writeFile(schemaPath, result.content, "utf-8");
  consola.success(`Generated ${source.name}/${schemaFilename}`);

  return schemaPath;
}

// =============================================================================
// Start (Server Functions) Generation
// =============================================================================

interface GenerateStartFilesOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  files: StartFilesConfig;
  schema: unknown;
  clientPath: string;
  schemaPath?: string;
}

/**
 * Generate start (server functions) files for a source
 * Outputs to: <source-name>/start/functions.ts
 * Returns the absolute path to the generated functions file
 */
async function generateStartFiles(
  options: GenerateStartFilesOptions,
): Promise<string> {
  const { source, sourceOutputDir, files, schema, clientPath, schemaPath } =
    options;

  consola.info(`Generating start files for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const startOutputDir = join(sourceOutputDir, "start");

  // Ensure output directory exists
  await mkdir(startOutputDir, { recursive: true });

  // Calculate relative import paths
  const functionsPath = join(startOutputDir, files.functions);
  const functionsDir = dirname(functionsPath);
  const clientImportPath = `./${relative(functionsDir, clientPath).replace(/\.ts$/, "")}`;

  // For types, GraphQL uses query/types.ts, OpenAPI uses schema.ts
  let typesImportPath: string;
  if (source.type === "graphql") {
    // GraphQL types will be at ../query/types (sibling directory)
    // But for start, we need to generate a types path that will exist
    // Since we generate start before query, we use a predictable path
    const typesPath = join(sourceOutputDir, "query", "types.ts");
    typesImportPath = `./${relative(functionsDir, typesPath).replace(/\.ts$/, "")}`;
  } else {
    // OpenAPI uses schema.ts at source root
    if (!schemaPath) {
      throw new Error(
        `OpenAPI source "${source.name}" requires schema file for start generation`,
      );
    }
    typesImportPath = `./${relative(functionsDir, schemaPath).replace(/\.ts$/, "")}`;
  }

  const startResult = adapter.generateStart(schema, source, {
    clientImportPath,
    typesImportPath,
    sourceName: source.name,
  });

  await writeFile(functionsPath, startResult.content, "utf-8");
  consola.success(`Generated ${source.name}/start/${files.functions}`);

  return functionsPath;
}

// =============================================================================
// Query Generation
// =============================================================================

interface GenerateQueryFilesOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  files: QueryFilesConfig;
  schema: unknown;
  clientPath: string;
  /** Path to schema file (for OpenAPI - types come from here) */
  schemaPath?: string;
  /** Enable TanStack Start server functions (imports from start/) */
  serverFunctions?: boolean;
  /** Path to start/functions.ts (required when serverFunctions is true) */
  startFunctionsPath?: string;
}

/**
 * Generate query files for a source
 * Outputs to: <source-name>/query/
 *   - types.ts (GraphQL only - OpenAPI uses schema.ts at source root)
 *   - operations.ts
 */
async function generateQueryFiles(
  options: GenerateQueryFilesOptions,
): Promise<void> {
  const {
    source,
    sourceOutputDir,
    files,
    schema,
    clientPath,
    schemaPath,
    serverFunctions = false,
    startFunctionsPath,
  } = options;

  // Validate that startFunctionsPath is provided when serverFunctions is enabled
  if (serverFunctions && !startFunctionsPath) {
    throw new Error(
      `Source "${source.name}" has serverFunctions enabled but start files were not generated`,
    );
  }

  consola.info(`Generating query files for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const queryOutputDir = join(sourceOutputDir, "query");

  // Ensure output directory exists
  await mkdir(queryOutputDir, { recursive: true });

  // Step 1: Determine types path
  // - GraphQL: Generate types.ts in query/
  // - OpenAPI: Use schema.ts at source root
  let typesPath: string;

  if (source.type === "graphql") {
    // GraphQL generates TypeScript types
    const graphqlAdapter = adapter as GraphQLAdapter;
    const typeGenOptions = {
      scalars: getScalarsFromSource(source),
    };
    const typesResult = graphqlAdapter.generateTypes(
      schema as GraphQLAdapterSchema,
      source as GraphQLSourceConfig,
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
    consola.success(`Generated ${source.name}/query/${files.types}`);
  } else {
    // OpenAPI uses schema.ts at source root
    if (!schemaPath) {
      throw new Error(
        `OpenAPI source "${source.name}" requires schema file but none was generated`,
      );
    }
    typesPath = schemaPath;
  }

  // Step 2: Generate operations
  const operationsPath = join(queryOutputDir, files.operations);

  // Calculate relative import paths
  const operationsDir = dirname(operationsPath);
  const clientImportPath = `./${relative(operationsDir, clientPath).replace(/\.ts$/, "")}`;
  const typesImportPath = `./${relative(operationsDir, typesPath).replace(/\.ts$/, "")}`;

  // Calculate start import path if needed
  let startImportPath: string | undefined;
  if (serverFunctions && startFunctionsPath) {
    startImportPath = `./${relative(operationsDir, startFunctionsPath).replace(/\.ts$/, "")}`;
  }

  const operationsResult = adapter.generateOperations(schema, source, {
    clientImportPath,
    typesImportPath,
    sourceName: source.name,
    serverFunctions,
    startImportPath,
  });
  await writeFile(operationsPath, operationsResult.content, "utf-8");
  consola.success(`Generated ${source.name}/query/${files.operations}`);
}

// =============================================================================
// Form Generation
// =============================================================================

interface GenerateFormFilesOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  files: FormFilesConfig;
  schema: unknown;
  schemaPath: string;
}

/**
 * Generate form files for a source
 * Outputs to: <source-name>/form/forms.ts
 */
async function generateFormFiles(
  options: GenerateFormFilesOptions,
): Promise<void> {
  const { source, sourceOutputDir, files, schema, schemaPath } = options;

  consola.info(`Generating form files for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const formOutputDir = join(sourceOutputDir, "form");

  // Ensure output directory exists
  await mkdir(formOutputDir, { recursive: true });

  // Generate form options
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
  consola.success(`Generated ${source.name}/form/${files.forms}`);
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
