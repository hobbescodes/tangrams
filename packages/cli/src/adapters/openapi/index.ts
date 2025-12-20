/**
 * OpenAPI Source Adapter
 *
 * Implements the SourceAdapter interface for OpenAPI sources.
 * Handles spec loading, schema generation, and code generation.
 */

import { getEmitter } from "@/generators/emitters";
import {
  generateFormOptionsCode,
  getOpenAPIRequestSchemaName,
} from "@/generators/form-options";
import { parseOpenAPIToIR } from "@/generators/ir";
import { generateOpenAPIClient } from "./client";
import {
  discoverOpenAPIEntities,
  generateOpenAPICollections,
} from "./collections";
import { generateOpenAPIFunctions } from "./functions";
import { generateOpenAPIOperations } from "./operations";
import { extractOperations, loadOpenAPISpec } from "./schema";

import type {
  CollectionOverrideConfig,
  OpenAPISourceConfig,
} from "@/core/config";
import type {
  CollectionDiscoveryResult,
  CollectionGenOptions,
  FormGenOptions,
  FunctionsGenOptions,
  GeneratedFile,
  OpenAPIAdapter as IOpenAPIAdapter,
  OpenAPIAdapterSchema,
  OperationGenOptions,
  SchemaGenOptions,
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
   * Generate standalone fetch functions
   */
  generateFunctions(
    schema: OpenAPIAdapterSchema,
    _config: OpenAPISourceConfig,
    options: FunctionsGenOptions,
  ): GeneratedFile {
    const operations = extractOperations(schema.document);
    return generateOpenAPIFunctions(operations, {
      clientImportPath: options.clientImportPath,
      schemaImportPath: options.typesImportPath,
      validatorLibrary: options.validatorLibrary,
    });
  }

  /**
   * Generate TanStack Query operation helpers
   */
  generateOperations(
    schema: OpenAPIAdapterSchema,
    config: OpenAPISourceConfig,
    options: OperationGenOptions,
  ): GeneratedFile {
    const operations = extractOperations(schema.document);
    const result = generateOpenAPIOperations(schema, config, operations, {
      ...options,
      queryOverrides: options.queryOverrides,
    });
    return {
      filename: result.filename,
      content: result.content,
      warnings: result.warnings.length > 0 ? result.warnings : undefined,
    };
  }

  /**
   * Generate validation schemas
   * This is the primary type generation for OpenAPI - outputs to <source>/schema.ts
   */
  generateSchemas(
    schema: OpenAPIAdapterSchema,
    _config: OpenAPISourceConfig,
    options: SchemaGenOptions,
  ): GeneratedFile {
    const { document } = schema;
    const operations = extractOperations(document);

    // Parse OpenAPI to IR
    const irResult = parseOpenAPIToIR(document, operations);

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

    // Build mutation info for form generation
    const mutationOps = mutations.map((op) => ({
      operationId: op.operationId,
      requestSchemaName: getOpenAPIRequestSchemaName(op.operationId),
    }));

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
   * Discover entities from the OpenAPI schema for TanStack DB collection generation
   */
  discoverCollectionEntities(
    schema: OpenAPIAdapterSchema,
    _config: OpenAPISourceConfig,
    overrides?: Record<string, CollectionOverrideConfig>,
  ): CollectionDiscoveryResult {
    const operations = extractOperations(schema.document);
    return discoverOpenAPIEntities(schema, operations, overrides);
  }

  /**
   * Generate TanStack DB collection options
   */
  generateCollections(
    schema: OpenAPIAdapterSchema,
    _config: OpenAPISourceConfig,
    options: CollectionGenOptions,
  ): GeneratedFile {
    const operations = extractOperations(schema.document);
    const { entities } = discoverOpenAPIEntities(
      schema,
      operations,
      options.collectionOverrides,
    );
    return generateOpenAPICollections(entities, options);
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
