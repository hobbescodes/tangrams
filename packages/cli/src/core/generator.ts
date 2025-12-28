import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import consola from "consola";

import { getAdapter } from "@/adapters";
import { getRelativeImportPath } from "@/utils/paths";
import {
  getDbCollectionOverrides,
  getFormOverrides,
  getQueryOverrides,
  getScalarsFromSource,
  normalizeGenerates,
} from "./config";

import type { SourceConfig, TangramsConfig, ValidatorLibrary } from "./config";

// =============================================================================
// Hardcoded File Names
// =============================================================================

/**
 * All generated file names are hardcoded for simplicity
 */
const FILES = {
  client: "client.ts",
  schema: "schema.ts",
  functions: "functions.ts",
  query: {
    types: "types.ts",
    options: "options.ts",
  },
  form: {
    options: "options.ts",
  },
  db: {
    collections: "collections.ts",
  },
} as const;

export interface GenerateOptions {
  config: TangramsConfig;
  force?: boolean;
  /**
   * Cached schemas by source name.
   * Used by watch mode for faster rebuilds when only documents change.
   */
  cachedSchemas?: Map<string, unknown>;
}

/**
 * Information about generated files for a single source
 */
export interface GeneratedSourceInfo {
  /** Source type */
  type: "graphql" | "openapi";
  /** Relative file paths from source directory */
  files: string[];
}

export interface GenerateResult {
  /**
   * Generated schemas by source name.
   * These can be cached and passed back for incremental rebuilds.
   */
  schemas: Map<string, unknown>;
  /**
   * Information about generated files per source.
   * Used for manifest updates.
   */
  generatedSources: Map<string, GeneratedSourceInfo>;
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
 * Output structure:
 *   <output>/tangrams/<source-name>/
 *     ├── client.ts          # shared client (always)
 *     ├── schema.ts          # zod schemas + inferred types (when query/form/db enabled)
 *     ├── functions.ts       # standalone fetch functions (when query/db enabled)
 *     ├── query/
 *     │   └── options.ts     # TanStack Query options
 *     ├── form/
 *     │   └── options.ts     # TanStack Form options
 *     └── db/
 *         └── collections.ts # TanStack DB collections
 */
export async function generate(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { config, force = false, cachedSchemas } = options;
  const generatedSchemas = new Map<string, unknown>();
  const generatedSources = new Map<string, GeneratedSourceInfo>();
  const generatedOutputs: string[] = [];

  // Track what was generated per source
  const querySourceNames: string[] = [];
  const formSourceNames: string[] = [];
  const dbSourceNames: string[] = [];

  // Compute the tangrams output directory
  const tangramsOutputDir = join(config.output, "tangrams");
  const baseOutputDir = join(process.cwd(), tangramsOutputDir);

  // Ensure tangrams output directory exists
  await mkdir(baseOutputDir, { recursive: true });

  // Generate .gitignore to exclude manifest from version control
  await generateGitignore(baseOutputDir);

  // Process each source
  for (const source of config.sources) {
    // Track files generated for this source (for manifest)
    const sourceFiles: string[] = [];
    const generates = normalizeGenerates(source.generates);
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
    // - GraphQL: Always when query/form/db is enabled (schema.ts contains all types)
    const needsZodSchemas =
      source.type === "openapi" ||
      (source.type === "graphql" &&
        (generates.query || generates.form || generates.db));

    // Track paths for import resolution
    let schemaPath: string | undefined;
    let functionsPath: string | undefined;
    const clientPath = join(sourceOutputDir, FILES.client);

    // Step 1: Generate client (always, at source root)
    // client.ts is always tracked in manifest even if skipped (already exists)
    sourceFiles.push(FILES.client);
    await generateClientFile({
      source,
      sourceOutputDir,
      schema,
      force,
    });

    // Step 2: Generate validation schemas if needed (at source root)
    if (needsZodSchemas) {
      schemaPath = await generateSchemaFile({
        source,
        sourceOutputDir,
        schema,
        config,
      });
      sourceFiles.push(FILES.schema);
    }

    // Step 3: Generate functions if query or db is enabled (at source root)
    // Functions are always generated when query is enabled (and query is auto-enabled for db)
    if (generates.query) {
      functionsPath = await generateFunctionsFile({
        source,
        sourceOutputDir,
        schema,
        clientPath,
        schemaPath,
      });
      sourceFiles.push(FILES.functions);
    }

    // Step 4: Generate query files if enabled
    if (generates.query && functionsPath) {
      await generateQueryFiles({
        source,
        sourceOutputDir,
        schema,
        schemaPath,
        functionsPath,
      });
      sourceFiles.push(`query/${FILES.query.options}`);
      querySourceNames.push(source.name);
    }

    // Step 5: Generate form files if enabled
    if (generates.form && schemaPath) {
      await generateFormFiles({
        source,
        sourceOutputDir,
        schema,
        schemaPath,
        validatorLibrary: config.validator,
      });
      sourceFiles.push(`form/${FILES.form.options}`);
      formSourceNames.push(source.name);
    }

    // Step 6: Generate db files if enabled
    if (generates.db && functionsPath && schemaPath) {
      await generateDbFiles({
        source,
        sourceOutputDir,
        schema,
        typesPath: schemaPath,
        functionsPath,
      });
      sourceFiles.push(`db/${FILES.db.collections}`);
      dbSourceNames.push(source.name);
    }

    // Track generated files for this source
    generatedSources.set(source.name, {
      type: source.type,
      files: sourceFiles,
    });
  }

  // Build output summary
  if (querySourceNames.length > 0) {
    generatedOutputs.push(`query (${querySourceNames.join(", ")})`);
  }
  if (formSourceNames.length > 0) {
    generatedOutputs.push(`form (${formSourceNames.join(", ")})`);
  }
  if (dbSourceNames.length > 0) {
    generatedOutputs.push(`db (${dbSourceNames.join(", ")})`);
  }

  // Final success message
  if (generatedOutputs.length > 0) {
    consola.box({
      title: "Generation Complete",
      message: `Generated: ${generatedOutputs.join(", ")}\nOutput directory: ${tangramsOutputDir}`,
    });
  }

  return { schemas: generatedSchemas, generatedSources };
}

// =============================================================================
// Client Generation
// =============================================================================

interface GenerateClientFileOptions {
  source: SourceConfig;
  sourceOutputDir: string;
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
  const { source, sourceOutputDir, schema, force } = options;

  const clientPath = join(sourceOutputDir, FILES.client);
  const clientExists = await fileExists(clientPath);

  if (clientExists && !force) {
    consola.info(
      `Skipping ${FILES.client} (already exists, use --force to regenerate)`,
    );
    return;
  }

  const adapter = getAdapter(source.type);
  const clientResult = adapter.generateClient(schema, source);
  await writeFile(clientPath, clientResult.content, "utf-8");
  consola.success(`Generated ${source.name}/${FILES.client}`);
}

// =============================================================================
// Schema Generation
// =============================================================================

interface GenerateSchemaFileOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  schema: unknown;
  config: TangramsConfig;
}

/**
 * Generate validation schema file for a source
 * Outputs to: <source-name>/schema.ts
 * Returns the absolute path to the generated schema file
 */
async function generateSchemaFile(
  options: GenerateSchemaFileOptions,
): Promise<string> {
  const { source, sourceOutputDir, schema, config } = options;

  consola.info(`Generating ${config.validator} schemas for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const schemaGenOptions = {
    scalars: getScalarsFromSource(source),
    validator: config.validator,
  };
  const result = adapter.generateSchemas(schema, source, schemaGenOptions);

  // Log any warnings (deduplicated)
  if (result.warnings) {
    for (const warning of [...new Set(result.warnings)]) {
      consola.warn(warning);
    }
  }

  const schemaPath = join(sourceOutputDir, FILES.schema);
  await writeFile(schemaPath, result.content, "utf-8");
  consola.success(`Generated ${source.name}/${FILES.schema}`);

  return schemaPath;
}

// =============================================================================
// Functions Generation
// =============================================================================

interface GenerateFunctionsFileOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  schema: unknown;
  clientPath: string;
  schemaPath?: string;
}

/**
 * Generate standalone functions file for a source
 * Outputs to: <source-name>/functions.ts
 * Returns the absolute path to the generated functions file
 */
async function generateFunctionsFile(
  options: GenerateFunctionsFileOptions,
): Promise<string> {
  const { source, sourceOutputDir, schema, clientPath, schemaPath } = options;

  consola.info(`Generating functions for: ${source.name}`);

  const adapter = getAdapter(source.type);

  // Calculate relative import paths
  const functionsPath = join(sourceOutputDir, FILES.functions);
  const functionsDir = dirname(functionsPath);
  const clientImportPath = getRelativeImportPath(functionsDir, clientPath);

  // Both GraphQL and OpenAPI now use schema.ts for types
  if (!schemaPath) {
    throw new Error(
      `Source "${source.name}" requires schema file for functions generation`,
    );
  }
  const typesImportPath = getRelativeImportPath(functionsDir, schemaPath);

  const functionsResult = adapter.generateFunctions(schema, source, {
    clientImportPath,
    typesImportPath,
  });

  await writeFile(functionsPath, functionsResult.content, "utf-8");
  consola.success(`Generated ${source.name}/${FILES.functions}`);

  return functionsPath;
}

// =============================================================================
// Query Generation
// =============================================================================

interface GenerateQueryFilesOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  schema: unknown;
  /** Path to schema file (for OpenAPI - types come from here) */
  schemaPath?: string;
  /** Path to functions file */
  functionsPath: string;
}

/**
 * Generate query files for a source
 * Outputs to: <source-name>/query/options.ts
 * Types now come from schema.ts at source root for all source types
 */
async function generateQueryFiles(
  options: GenerateQueryFilesOptions,
): Promise<void> {
  const { source, sourceOutputDir, schema, schemaPath, functionsPath } =
    options;

  consola.info(`Generating query files for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const queryOutputDir = join(sourceOutputDir, "query");

  // Ensure output directory exists
  await mkdir(queryOutputDir, { recursive: true });

  // Types now come from schema.ts for all source types
  if (!schemaPath) {
    throw new Error(
      `Source "${source.name}" requires schema file but none was generated`,
    );
  }

  // Generate operations
  const optionsPath = join(queryOutputDir, FILES.query.options);

  // Calculate relative import paths (from query/ to schema.ts and functions.ts at source root)
  const optionsDir = dirname(optionsPath);
  const typesImportPath = getRelativeImportPath(optionsDir, schemaPath);
  const functionsImportPath = getRelativeImportPath(optionsDir, functionsPath);

  const optionsResult = adapter.generateOperations(schema, source, {
    typesImportPath,
    functionsImportPath,
    sourceName: source.name,
    queryOverrides: getQueryOverrides(source),
  });
  await writeFile(optionsPath, optionsResult.content, "utf-8");
  consola.success(`Generated ${source.name}/query/${FILES.query.options}`);
}

// =============================================================================
// Form Generation
// =============================================================================

interface GenerateFormFilesOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  schema: unknown;
  schemaPath: string;
  validatorLibrary: ValidatorLibrary;
}

/**
 * Generate form files for a source
 * Outputs to: <source-name>/form/options.ts
 */
async function generateFormFiles(
  options: GenerateFormFilesOptions,
): Promise<void> {
  const { source, sourceOutputDir, schema, schemaPath, validatorLibrary } =
    options;

  consola.info(`Generating form files for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const formOutputDir = join(sourceOutputDir, "form");

  // Ensure output directory exists
  await mkdir(formOutputDir, { recursive: true });

  // Generate form options
  const formOptionsPath = join(formOutputDir, FILES.form.options);

  // Calculate relative import path from form options to schema
  const formOptionsDir = dirname(formOptionsPath);
  const schemaImportPath = getRelativeImportPath(formOptionsDir, schemaPath);

  const formResult = adapter.generateFormOptions(schema, source, {
    schemaImportPath,
    sourceName: source.name,
    formOverrides: getFormOverrides(source),
    validatorLibrary,
  });

  // Log any warnings (deduplicated)
  if (formResult.warnings) {
    for (const warning of [...new Set(formResult.warnings)]) {
      consola.warn(warning);
    }
  }

  await writeFile(formOptionsPath, formResult.content, "utf-8");
  consola.success(`Generated ${source.name}/form/${FILES.form.options}`);
}

// =============================================================================
// DB (TanStack DB Collections) Generation
// =============================================================================

interface GenerateDbFilesOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  schema: unknown;
  /** Path to types file (schema.ts for all source types) */
  typesPath: string;
  /** Path to functions file */
  functionsPath: string;
}

/**
 * Generate db files for a source
 * Outputs to: <source-name>/db/collections.ts
 */
async function generateDbFiles(options: GenerateDbFilesOptions): Promise<void> {
  const { source, sourceOutputDir, schema, typesPath, functionsPath } = options;

  consola.info(`Generating db files for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const dbOutputDir = join(sourceOutputDir, "db");

  // Ensure output directory exists
  await mkdir(dbOutputDir, { recursive: true });

  // Generate collections
  const collectionsPath = join(dbOutputDir, FILES.db.collections);

  // Calculate relative import paths
  const collectionsDir = dirname(collectionsPath);
  const typesImportPath = getRelativeImportPath(collectionsDir, typesPath);
  const functionsImportPath = getRelativeImportPath(
    collectionsDir,
    functionsPath,
  );

  const dbResult = adapter.generateCollections(schema, source, {
    typesImportPath,
    functionsImportPath,
    sourceName: source.name,
    collectionOverrides: getDbCollectionOverrides(source),
  });

  // Log any warnings (deduplicated)
  if (dbResult.warnings) {
    for (const warning of [...new Set(dbResult.warnings)]) {
      consola.warn(warning);
    }
  }

  await writeFile(collectionsPath, dbResult.content, "utf-8");
  consola.success(`Generated ${source.name}/db/${FILES.db.collections}`);
}

// =============================================================================
// Gitignore Generation
// =============================================================================

/**
 * Generate .gitignore in the tangrams output directory
 * This ensures the manifest file is not committed to version control
 */
async function generateGitignore(tangramsOutputDir: string): Promise<void> {
  const gitignorePath = join(tangramsOutputDir, ".gitignore");
  const gitignoreContent = `# Tangrams manifest (generated cache - do not commit)
.tangrams-manifest.json
`;
  await writeFile(gitignorePath, gitignoreContent, "utf-8");
}
