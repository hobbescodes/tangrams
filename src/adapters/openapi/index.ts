/**
 * OpenAPI Source Adapter
 *
 * Implements the SourceAdapter interface for OpenAPI sources.
 * Handles spec loading, Zod schema generation, and code generation.
 */

import {
  generateFormOptionsCode,
  getOpenAPIRequestSchemaName,
} from "@/generators/forms";
import { generateOpenAPIZodSchemas } from "@/generators/zod/openapi";
import { generateOpenAPIClient } from "./client";
import { generateOpenAPIOperations } from "./operations";
import { extractOperations, loadOpenAPISpec } from "./schema";
import { generateOpenAPITypes } from "./types";

import type { OpenAPISourceConfig } from "@/core/config";
import type {
  FormGenOptions,
  GeneratedFile,
  OpenAPIAdapter as IOpenAPIAdapter,
  OpenAPIAdapterSchema,
  OperationGenOptions,
  SchemaGenOptions,
  TypeGenOptions,
} from "../types";

/**
 * OpenAPI adapter implementation
 */
class OpenAPIAdapterImpl implements IOpenAPIAdapter {
  readonly type = "openapi" as const;

  /**
   * Load and parse the OpenAPI specification
   */
  async loadSchema(config: OpenAPISourceConfig): Promise<OpenAPIAdapterSchema> {
    return loadOpenAPISpec(config);
  }

  /**
   * Generate the better-fetch client file
   */
  generateClient(
    schema: OpenAPIAdapterSchema,
    config: OpenAPISourceConfig,
  ): GeneratedFile {
    return generateOpenAPIClient(schema, config);
  }

  /**
   * Generate Zod schemas and TypeScript types from the OpenAPI spec
   */
  generateTypes(
    schema: OpenAPIAdapterSchema,
    config: OpenAPISourceConfig,
    options: TypeGenOptions,
  ): GeneratedFile {
    return generateOpenAPITypes(schema, config, options);
  }

  /**
   * Generate TanStack Query operation helpers
   */
  generateOperations(
    schema: OpenAPIAdapterSchema,
    config: OpenAPISourceConfig,
    options: OperationGenOptions,
  ): GeneratedFile {
    return generateOpenAPIOperations(schema, config, options);
  }

  /**
   * Generate Zod schemas for validation
   */
  generateSchemas(
    schema: OpenAPIAdapterSchema,
    _config: OpenAPISourceConfig,
    options: SchemaGenOptions,
  ): GeneratedFile {
    const { document } = schema;
    const operations = extractOperations(document);

    const result = generateOpenAPIZodSchemas(document, operations, {
      requestBodiesOnly: options.mutationsOnly,
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
    schema: OpenAPIAdapterSchema,
    _config: OpenAPISourceConfig,
    options: FormGenOptions,
  ): GeneratedFile {
    const { document } = schema;
    const operations = extractOperations(document);

    // Filter to mutations (POST, PUT, PATCH) with request bodies
    const mutationMethods = new Set(["post", "put", "patch"]);
    const mutations = operations.filter(
      (op) => mutationMethods.has(op.method) && op.requestBody,
    );

    // Generate schemas to get the schema strings for default value generation
    const schemasResult = generateOpenAPIZodSchemas(document, mutations, {
      requestBodiesOnly: true,
    });

    // Build mutation info for form generation
    const mutationOps = mutations.map((op) => {
      const schemaName = getOpenAPIRequestSchemaName(op.operationId);
      // Find the schema code - look for the schema definition in the generated schemas
      const schemaMatch = schemasResult.content.match(
        new RegExp(`export const ${schemaName} = ([^;]+)`),
      );
      const schemaCode = schemaMatch
        ? schemaMatch[1] || "z.object({})"
        : "z.object({})";

      return {
        operationId: op.operationId,
        requestSchemaName: schemaName,
        requestSchemaCode: schemaCode,
      };
    });

    const result = generateFormOptionsCode(mutationOps, {
      schemaImportPath: options.schemaImportPath,
      allSchemas: schemasResult.content
        .split("\n")
        .filter((l) => l.startsWith("export const")),
    });

    return {
      filename: "forms.ts",
      content: result.content,
      warnings: result.warnings,
    };
  }
}

/**
 * Singleton instance of the OpenAPI adapter
 */
export const openapiAdapter = new OpenAPIAdapterImpl();

// Re-export types and utilities
export type { OpenAPIAdapterSchema };

export { extractOperations, loadOpenAPISpec } from "./schema";

export type { ParsedOperation } from "./schema";
