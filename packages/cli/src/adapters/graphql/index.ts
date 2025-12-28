/**
 * GraphQL Source Adapter
 *
 * Implements the SourceAdapter interface for GraphQL sources.
 * Handles schema introspection, document parsing, and code generation.
 */

import { loadDocuments } from "@/core/documents";
import { getEmitter } from "@/generators/emitters";
import { generateFormOptionsCode } from "@/generators/form-options";
import { generateFunctions } from "@/generators/functions";
import { parseGraphQLToIR } from "@/generators/ir";
import { generateGraphQLOperations } from "@/generators/query-options";
import { toMutationVariablesSchemaName } from "@/utils/naming";
import { generateGraphQLClient } from "./client";
import {
  discoverGraphQLEntities,
  generateGraphQLCollections,
} from "./collections";
import {
  introspectSchema,
  isFileSchemaConfig,
  isUrlSchemaConfig,
  loadSchemaFromFiles,
} from "./schema";
import { generateGraphQLTypes } from "./types";

import type { GraphQLSchema } from "graphql";
import type {
  CollectionOverrideConfig,
  GraphQLSourceConfig,
} from "@/core/config";
import type {
  CollectionDiscoveryResult,
  CollectionGenOptions,
  FormGenOptions,
  FunctionsGenOptions,
  GeneratedFile,
  GraphQLAdapterSchema,
  GraphQLAdapter as IGraphQLAdapter,
  OperationGenOptions,
  SchemaGenOptions,
  TypeGenOptions,
} from "../types";

/**
 * GraphQL adapter implementation
 */
class GraphQLAdapterImpl implements IGraphQLAdapter {
  readonly type = "graphql" as const;

  /**
   * Load the GraphQL schema via introspection or from local files, and parse documents
   */
  async loadSchema(config: GraphQLSourceConfig): Promise<GraphQLAdapterSchema> {
    let schema: GraphQLSchema;

    if (isUrlSchemaConfig(config.schema)) {
      // Introspect the schema from the GraphQL endpoint
      schema = await introspectSchema({
        url: config.schema.url,
        headers: config.schema.headers,
      });
    } else if (isFileSchemaConfig(config.schema)) {
      // Load schema from local SDL file(s)
      schema = await loadSchemaFromFiles(config.schema.file);
    } else {
      // This should never happen due to Zod validation, but TypeScript needs this
      throw new Error(
        "Invalid schema configuration: must specify either 'url' or 'file'",
      );
    }

    // Load and parse the GraphQL documents
    const documents = await loadDocuments(config.documents);

    return {
      schema,
      documents,
    };
  }

  /**
   * Generate the GraphQL client file
   */
  generateClient(
    schema: GraphQLAdapterSchema,
    config: GraphQLSourceConfig,
  ): GeneratedFile {
    return generateGraphQLClient(schema, config);
  }

  /**
   * Generate TypeScript types from the schema and documents
   */
  generateTypes(
    schema: GraphQLAdapterSchema,
    config: GraphQLSourceConfig,
    options: TypeGenOptions,
  ): GeneratedFile {
    return generateGraphQLTypes(schema, config, options);
  }

  /**
   * Generate standalone fetch functions
   */
  generateFunctions(
    schema: GraphQLAdapterSchema,
    _config: GraphQLSourceConfig,
    options: FunctionsGenOptions,
  ): GeneratedFile {
    const content = generateFunctions({
      documents: schema.documents,
      clientImportPath: options.clientImportPath,
      typesImportPath: options.typesImportPath,
    });

    return {
      filename: "functions.ts",
      content,
    };
  }

  /**
   * Generate TanStack Query operation helpers
   */
  generateOperations(
    schema: GraphQLAdapterSchema,
    _config: GraphQLSourceConfig,
    options: OperationGenOptions,
  ): GeneratedFile {
    const result = generateGraphQLOperations({
      documents: schema.documents,
      typesImportPath: options.typesImportPath,
      functionsImportPath: options.functionsImportPath,
      sourceName: options.sourceName,
      schema: schema.schema,
      queryOverrides: options.queryOverrides,
    });

    return {
      filename: "options.ts",
      content: result.content,
      warnings: result.warnings.length > 0 ? result.warnings : undefined,
    };
  }

  /**
   * Generate validation schemas for all types (enums, inputs, fragments, variables, responses)
   * This outputs to schema.ts
   */
  generateSchemas(
    schema: GraphQLAdapterSchema,
    _config: GraphQLSourceConfig,
    options: SchemaGenOptions,
  ): GeneratedFile {
    // Parse GraphQL to IR
    const irResult = parseGraphQLToIR(schema.schema, schema.documents, {
      scalars: options.scalars,
      validator: options.validator,
    });

    // Get the appropriate emitter for the configured validator
    const emitter = getEmitter(options.validator);

    // Emit IR to validator-specific code
    const emitterResult = emitter.emit(irResult.schemas);

    // Combine warnings from both IR parsing and emission
    const warnings = [...irResult.warnings, ...emitterResult.warnings];

    return {
      filename: "schema.ts",
      content: emitterResult.content,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Generate TanStack Form options for mutations
   */
  generateFormOptions(
    schema: GraphQLAdapterSchema,
    _config: GraphQLSourceConfig,
    options: FormGenOptions,
  ): GeneratedFile {
    // Filter to mutations only
    const mutations = schema.documents.operations.filter(
      (op) => op.operation === "mutation",
    );

    // Build mutation info for form generation
    // For GraphQL, mutations use *MutationVariables schemas generated by the Zod generator
    const mutationOps = mutations
      .map((mutation) => {
        const variables = mutation.node.variableDefinitions ?? [];
        if (variables.length === 0) return null;

        // The schema name uses the MutationVariables naming convention
        const schemaName = toMutationVariablesSchemaName(mutation.name);

        return {
          operationId: mutation.name,
          requestSchemaName: schemaName,
        };
      })
      .filter((op): op is NonNullable<typeof op> => op !== null);

    const result = generateFormOptionsCode(mutationOps, {
      schemaImportPath: options.schemaImportPath,
      formOverrides: options.formOverrides,
      validatorLibrary: options.validatorLibrary,
    });

    return {
      filename: "options.ts",
      content: result.content,
      warnings: result.warnings,
    };
  }

  /**
   * Discover entities from the GraphQL schema for TanStack DB collection generation
   */
  discoverCollectionEntities(
    schema: GraphQLAdapterSchema,
    _config: GraphQLSourceConfig,
    overrides?: Record<string, CollectionOverrideConfig>,
  ): CollectionDiscoveryResult {
    return discoverGraphQLEntities(schema, overrides);
  }

  /**
   * Generate TanStack DB collection options
   */
  generateCollections(
    schema: GraphQLAdapterSchema,
    _config: GraphQLSourceConfig,
    options: CollectionGenOptions,
  ): GeneratedFile {
    const { entities } = discoverGraphQLEntities(
      schema,
      options.collectionOverrides,
    );
    return generateGraphQLCollections(entities, options);
  }
}
/**
 * Singleton instance of the GraphQL adapter
 */
export const graphqlAdapter = new GraphQLAdapterImpl();

// Re-export types and utilities
export type { GraphQLAdapterSchema };

export { loadDocuments } from "@/core/documents";
export {
  introspectSchema,
  isFileSchemaConfig,
  isUrlSchemaConfig,
  loadSchemaFromFiles,
} from "./schema";
