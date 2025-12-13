import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import consola from "consola";

import { getAdapter } from "@/adapters";
import {
  getDbCollectionOverrides,
  getScalarsFromSource,
  normalizeGenerates,
} from "./config";

import type { GraphQLAdapter, GraphQLAdapterSchema } from "@/adapters/types";
import type {
  GraphQLSourceConfig,
  SourceConfig,
  TangramsConfig,
} from "./config";

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
    operations: "operations.ts",
  },
  form: {
    forms: "forms.ts",
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
 * Output structure:
 *   <output>/<source-name>/
 *     ├── client.ts          # shared client (always)
 *     ├── schema.ts          # zod schemas (when needed)
 *     ├── functions.ts       # standalone fetch functions (when query/db enabled)
 *     ├── query/
 *     │   ├── types.ts       # GraphQL only
 *     │   └── operations.ts  # TanStack Query options
 *     ├── form/
 *     │   └── forms.ts
 *     └── db/
 *         └── collections.ts # TanStack DB collections
 */
export async function generate(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { config, force = false, cachedSchemas } = options;
  const generatedSchemas = new Map<string, unknown>();
  const generatedOutputs: string[] = [];

  // Track what was generated per source
  const querySourceNames: string[] = [];
  const formSourceNames: string[] = [];
  const dbSourceNames: string[] = [];

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
    // - GraphQL: When form or db generation is enabled
    const needsZodSchemas =
      source.type === "openapi" ||
      (source.type === "graphql" && (generates.form || generates.db));

    // Track paths for import resolution
    let schemaPath: string | undefined;
    let functionsPath: string | undefined;
    const clientPath = join(sourceOutputDir, FILES.client);

    // Step 1: Generate client (always, at source root)
    await generateClientFile({
      source,
      sourceOutputDir,
      schema,
      force,
    });

    // Step 2: Generate Zod schemas if needed (at source root)
    if (needsZodSchemas) {
      schemaPath = await generateSchemaFile({
        source,
        sourceOutputDir,
        schema,
      });
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
    }

    // Step 4: Generate query files if enabled
    if (generates.query) {
      await generateQueryFiles({
        source,
        sourceOutputDir,
        schema,
        schemaPath,
      });
      querySourceNames.push(source.name);
    }

    // Step 5: Generate form files if enabled
    if (generates.form && schemaPath) {
      await generateFormFiles({
        source,
        sourceOutputDir,
        schema,
        schemaPath,
      });
      formSourceNames.push(source.name);
    }

    // Step 6: Generate db files if enabled
    if (generates.db && functionsPath) {
      // Determine types path
      const typesPath =
        source.type === "graphql"
          ? join(sourceOutputDir, "query", FILES.query.types)
          : schemaPath;

      if (typesPath) {
        await generateDbFiles({
          source,
          sourceOutputDir,
          schema,
          typesPath,
        });
        dbSourceNames.push(source.name);
      }
    }
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
}

/**
 * Generate Zod schema file for a source
 * Outputs to: <source-name>/schema.ts
 * Returns the absolute path to the generated schema file
 */
async function generateSchemaFile(
  options: GenerateSchemaFileOptions,
): Promise<string> {
  const { source, sourceOutputDir, schema } = options;

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
  const clientImportPath = `./${relative(functionsDir, clientPath).replace(/\.ts$/, "")}`;

  // For types, GraphQL uses query/types.ts, OpenAPI uses schema.ts
  let typesImportPath: string;
  if (source.type === "graphql") {
    // GraphQL types will be at ./query/types (subdirectory)
    const typesPath = join(sourceOutputDir, "query", FILES.query.types);
    typesImportPath = `./${relative(functionsDir, typesPath).replace(/\.ts$/, "")}`;
  } else {
    // OpenAPI uses schema.ts at source root
    if (!schemaPath) {
      throw new Error(
        `OpenAPI source "${source.name}" requires schema file for functions generation`,
      );
    }
    typesImportPath = `./${relative(functionsDir, schemaPath).replace(/\.ts$/, "")}`;
  }

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
  const { source, sourceOutputDir, schema, schemaPath } = options;

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

    typesPath = join(queryOutputDir, FILES.query.types);
    await writeFile(typesPath, typesResult.content, "utf-8");
    consola.success(`Generated ${source.name}/query/${FILES.query.types}`);
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
  const operationsPath = join(queryOutputDir, FILES.query.operations);

  // Calculate relative import paths
  const operationsDir = dirname(operationsPath);
  const typesImportPath = `./${relative(operationsDir, typesPath).replace(/\.ts$/, "")}`;

  const operationsResult = adapter.generateOperations(schema, source, {
    typesImportPath,
    sourceName: source.name,
  });
  await writeFile(operationsPath, operationsResult.content, "utf-8");
  consola.success(`Generated ${source.name}/query/${FILES.query.operations}`);
}

// =============================================================================
// Form Generation
// =============================================================================

interface GenerateFormFilesOptions {
  source: SourceConfig;
  sourceOutputDir: string;
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
  const { source, sourceOutputDir, schema, schemaPath } = options;

  consola.info(`Generating form files for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const formOutputDir = join(sourceOutputDir, "form");

  // Ensure output directory exists
  await mkdir(formOutputDir, { recursive: true });

  // Generate form options
  const formsPath = join(formOutputDir, FILES.form.forms);

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
  consola.success(`Generated ${source.name}/form/${FILES.form.forms}`);
}

// =============================================================================
// DB (TanStack DB Collections) Generation
// =============================================================================

interface GenerateDbFilesOptions {
  source: SourceConfig;
  sourceOutputDir: string;
  schema: unknown;
  /** Path to types file (query/types.ts for GraphQL, schema.ts for OpenAPI) */
  typesPath: string;
}

/**
 * Generate db files for a source
 * Outputs to: <source-name>/db/collections.ts
 */
async function generateDbFiles(options: GenerateDbFilesOptions): Promise<void> {
  const { source, sourceOutputDir, schema, typesPath } = options;

  consola.info(`Generating db files for: ${source.name}`);

  const adapter = getAdapter(source.type);
  const dbOutputDir = join(sourceOutputDir, "db");

  // Ensure output directory exists
  await mkdir(dbOutputDir, { recursive: true });

  // Generate collections
  const collectionsPath = join(dbOutputDir, FILES.db.collections);

  // Calculate relative import paths
  const collectionsDir = dirname(collectionsPath);
  const typesImportPath = `./${relative(collectionsDir, typesPath).replace(/\.ts$/, "")}`;

  const dbResult = adapter.generateCollections(schema, source, {
    typesImportPath,
    sourceName: source.name,
    collectionOverrides: getDbCollectionOverrides(source),
  });

  // Log any warnings
  if (dbResult.warnings) {
    for (const warning of dbResult.warnings) {
      consola.warn(warning);
    }
  }

  await writeFile(collectionsPath, dbResult.content, "utf-8");
  consola.success(`Generated ${source.name}/db/${FILES.db.collections}`);
}
