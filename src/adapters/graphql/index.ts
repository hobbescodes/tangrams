/**
 * GraphQL Source Adapter
 *
 * Implements the SourceAdapter interface for GraphQL sources.
 * Handles schema introspection, document parsing, and code generation.
 */

import { loadDocuments } from "@/core/documents";
import { generateFormOptionsCode } from "@/generators/forms";
import { generateGraphQLZodSchemas } from "@/generators/zod/graphql";
import { toSchemaName } from "@/generators/zod/index";
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
  FormGenOptions,
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
   * Generate TanStack Query operation helpers
   */
  generateOperations(
    schema: GraphQLAdapterSchema,
    config: GraphQLSourceConfig,
    options: OperationGenOptions,
  ): GeneratedFile {
    return generateGraphQLOperations(schema, config, options);
  }

  /**
   * Generate Zod schemas for validation (input types from mutations)
   */
  generateSchemas(
    schema: GraphQLAdapterSchema,
    _config: GraphQLSourceConfig,
    options: SchemaGenOptions,
  ): GeneratedFile {
    const result = generateGraphQLZodSchemas(schema.schema, schema.documents, {
      scalars: options.scalars,
      mutationsOnly: options.mutationsOnly,
    });

    return {
      filename: "types.ts",
      content: result.content,
      warnings: result.warnings,
    };
  }

  /**
   * Generate TanStack Form options for mutations
   */
  generateFormOptions(
    schema: GraphQLAdapterSchema,
    config: GraphQLSourceConfig,
    options: FormGenOptions,
  ): GeneratedFile {
    // Filter to mutations only
    const mutations = schema.documents.operations.filter(
      (op) => op.operation === "mutation",
    );

    // Generate schemas to get the schema strings for default value generation
    const schemasResult = generateGraphQLZodSchemas(
      schema.schema,
      { ...schema.documents, operations: mutations },
      {
        scalars: config.scalars,
        mutationsOnly: true,
      },
    );

    // Build mutation info for form generation
    // For GraphQL, we need to find the input type for each mutation's variables
    const mutationOps = mutations
      .map((mutation) => {
        const variables = mutation.node.variableDefinitions ?? [];
        if (variables.length === 0) return null;

        // For simplicity, we'll create a composite schema for all variables
        // The schema name will be based on the mutation name
        const schemaName = toSchemaName(`${mutation.name}Variables`);

        // Generate inline schema for the variables
        const varFields = variables.map((v) => {
          const typeName = getTypeNameFromNode(v.type);
          const varSchemaName = toSchemaName(typeName);
          const isRequired = v.type.kind === "NonNullType";

          // Check if this type exists in the generated schemas
          const typeExists = schemasResult.content.includes(
            `export const ${varSchemaName}`,
          );

          if (typeExists) {
            return isRequired
              ? `  ${v.variable.name.value}: ${varSchemaName}`
              : `  ${v.variable.name.value}: ${varSchemaName}.optional()`;
          }

          // Fallback to basic types
          const basicZodType = getBasicZodType(typeName);
          return isRequired
            ? `  ${v.variable.name.value}: ${basicZodType}`
            : `  ${v.variable.name.value}: ${basicZodType}.optional()`;
        });

        const schemaCode = `z.object({\n${varFields.join(",\n")}\n})`;

        return {
          operationId: mutation.name,
          requestSchemaName: schemaName,
          requestSchemaCode: schemaCode,
        };
      })
      .filter((op): op is NonNullable<typeof op> => op !== null);

    // Add variable schemas to the generated schemas
    const allSchemas = schemasResult.content
      .split("\n")
      .filter((l) => l.startsWith("export const"));

    // Add the mutation variable schemas
    for (const op of mutationOps) {
      allSchemas.push(
        `export const ${op.requestSchemaName} = ${op.requestSchemaCode}`,
      );
    }

    const result = generateFormOptionsCode(mutationOps, {
      schemaImportPath: options.schemaImportPath,
      allSchemas,
    });

    return {
      filename: "forms.ts",
      content: result.content,
      warnings: result.warnings,
    };
  }
}

/**
 * Get the type name from a GraphQL type node (unwrapping NonNull and List)
 */
function getTypeNameFromNode(typeNode: {
  kind: string;
  type?: unknown;
  name?: { value: string };
}): string {
  if (typeNode.kind === "NonNullType" || typeNode.kind === "ListType") {
    return getTypeNameFromNode(
      typeNode.type as {
        kind: string;
        type?: unknown;
        name?: { value: string };
      },
    );
  }
  return typeNode.name?.value ?? "unknown";
}

/**
 * Get basic Zod type for GraphQL scalars
 */
function getBasicZodType(typeName: string): string {
  switch (typeName) {
    case "String":
    case "ID":
      return "z.string()";
    case "Int":
      return "z.number().int()";
    case "Float":
      return "z.number()";
    case "Boolean":
      return "z.boolean()";
    default:
      return "z.unknown()";
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
