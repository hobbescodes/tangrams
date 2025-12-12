/**
 * GraphQL Source Adapter
 *
 * Implements the SourceAdapter interface for GraphQL sources.
 * Handles schema introspection, document parsing, and code generation.
 */

import { loadDocuments } from "@/core/documents";
import { generateGraphQLClient } from "./client";
import { generateGraphQLOperations } from "./operations";
import {
  introspectSchema,
  isFileSchemaConfig,
  isUrlSchemaConfig,
  loadSchemaFromFiles,
} from "./schema";
import { generateGraphQLTypes } from "./types";

import type { GraphQLSchema } from "graphql";
import type { GraphQLSourceConfig } from "@/core/config";
import type {
  GeneratedFile,
  GenerationContext,
  GraphQLAdapterSchema,
  GraphQLAdapter as IGraphQLAdapter,
  OperationGenOptions,
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
    context: GenerationContext,
  ): GeneratedFile {
    return generateGraphQLClient(schema, config, context);
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
   * Generate TanStack Query operation helpers
   */
  generateOperations(
    schema: GraphQLAdapterSchema,
    config: GraphQLSourceConfig,
    options: OperationGenOptions,
  ): GeneratedFile {
    return generateGraphQLOperations(schema, config, options);
  }
}

/**
 * Singleton instance of the GraphQL adapter
 */
export const graphqlAdapter = new GraphQLAdapterImpl();

// Re-export types and utilities
export type { GraphQLAdapterSchema };

export { loadDocuments } from "./documents";
export {
  introspectSchema,
  isFileSchemaConfig,
  isUrlSchemaConfig,
  loadSchemaFromFiles,
} from "./schema";
