/**
 * OpenAPI schema loading and parsing
 */

import SwaggerParser from "@apidevtools/swagger-parser";
import micromatch from "micromatch";

import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import type { OpenAPISourceConfig } from "@/core/config";
import type { OpenAPIAdapterSchema } from "../types";

export type OpenAPIDocument = OpenAPIV3.Document | OpenAPIV3_1.Document;

/**
 * Check if a spec path is a URL
 */
function isUrl(spec: string): boolean {
  return spec.startsWith("http://") || spec.startsWith("https://");
}

/**
 * Load and parse an OpenAPI specification
 */
export async function loadOpenAPISpec(
  config: OpenAPISourceConfig,
): Promise<OpenAPIAdapterSchema> {
  const { spec, headers, include, exclude } = config;

  // SwaggerParser handles both URLs and file paths
  // For URLs, we can pass custom headers via the resolve option
  const parserOptions: SwaggerParser.Options = {};

  if (isUrl(spec) && headers) {
    parserOptions.resolve = {
      http: {
        headers,
      },
    };
  }

  // Parse and dereference the spec (resolves all $refs)
  const document = (await SwaggerParser.dereference(
    spec,
    parserOptions,
  )) as OpenAPIDocument;

  // Extract base URL from servers
  const baseUrl = extractBaseUrl(document);

  // Filter paths if include/exclude patterns are specified
  if (include || exclude) {
    filterPaths(document, include, exclude);
  }

  return {
    document,
    baseUrl,
  };
}

/**
 * Extract the base URL from the OpenAPI document's servers array
 */
function extractBaseUrl(document: OpenAPIDocument): string {
  const servers = document.servers;
  if (servers && servers.length > 0) {
    const server = servers[0];
    if (!server) return "";

    let url = server.url;

    // Handle server variables
    if (server.variables) {
      for (const [name, variable] of Object.entries(server.variables)) {
        const value =
          variable.default || (variable.enum ? variable.enum[0] : "");
        url = url.replace(`{${name}}`, value ?? "");
      }
    }

    return url;
  }

  // Default to empty string if no servers defined
  return "";
}

/**
 * Filter paths based on include/exclude glob patterns
 */
function filterPaths(
  document: OpenAPIDocument,
  include?: string[],
  exclude?: string[],
): void {
  if (!document.paths) return;

  const paths = Object.keys(document.paths);

  for (const path of paths) {
    let shouldInclude = true;

    // Check include patterns (if specified, path must match at least one)
    if (include && include.length > 0) {
      shouldInclude = micromatch.isMatch(path, include);
    }

    // Check exclude patterns (if matches any, exclude it)
    if (shouldInclude && exclude && exclude.length > 0) {
      if (micromatch.isMatch(path, exclude)) {
        shouldInclude = false;
      }
    }

    if (!shouldInclude) {
      delete document.paths[path];
    }
  }
}

/**
 * Get all operations from an OpenAPI document
 */
export interface ParsedOperation {
  /** The URL path (e.g., "/users/{id}") */
  path: string;
  /** HTTP method */
  method: "get" | "post" | "put" | "patch" | "delete";
  /** Operation ID from the spec (or auto-generated) */
  operationId: string;
  /** The operation definition */
  operation: OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject;
  /** Path parameters */
  pathParams: (OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject)[];
  /** Query parameters */
  queryParams: (OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject)[];
  /** Request body schema (if any) */
  requestBody?: OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject;
  /** Response schema (for success response) */
  responseSchema?: OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject;
}

const httpMethods = ["get", "post", "put", "patch", "delete"] as const;

/**
 * Extract all operations from an OpenAPI document
 */
export function extractOperations(
  document: OpenAPIDocument,
): ParsedOperation[] {
  const operations: ParsedOperation[] = [];

  if (!document.paths) return operations;

  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!pathItem) continue;

    for (const method of httpMethods) {
      const operation = pathItem[method] as
        | OpenAPIV3.OperationObject
        | OpenAPIV3_1.OperationObject
        | undefined;

      if (!operation) continue;

      // Generate operation ID if not provided
      const operationId =
        operation.operationId || generateOperationId(method, path);

      // Extract parameters
      const allParams = [
        ...(pathItem.parameters || []),
        ...(operation.parameters || []),
      ] as (OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject)[];

      const pathParams = allParams.filter((p) => p.in === "path");
      const queryParams = allParams.filter((p) => p.in === "query");

      // Extract request body schema
      let requestBody:
        | OpenAPIV3.SchemaObject
        | OpenAPIV3_1.SchemaObject
        | undefined;
      if (operation.requestBody) {
        const body = operation.requestBody as
          | OpenAPIV3.RequestBodyObject
          | OpenAPIV3_1.RequestBodyObject;
        const content = body.content?.["application/json"];
        if (content?.schema) {
          requestBody = content.schema as
            | OpenAPIV3.SchemaObject
            | OpenAPIV3_1.SchemaObject;
        }
      }

      // Extract response schema (from 200/201/default)
      let responseSchema:
        | OpenAPIV3.SchemaObject
        | OpenAPIV3_1.SchemaObject
        | undefined;
      if (operation.responses) {
        const successResponse =
          operation.responses["200"] ||
          operation.responses["201"] ||
          operation.responses.default;

        if (successResponse) {
          const response = successResponse as
            | OpenAPIV3.ResponseObject
            | OpenAPIV3_1.ResponseObject;
          const content = response.content?.["application/json"];
          if (content?.schema) {
            responseSchema = content.schema as
              | OpenAPIV3.SchemaObject
              | OpenAPIV3_1.SchemaObject;
          }
        }
      }

      operations.push({
        path,
        method,
        operationId,
        operation,
        pathParams,
        queryParams,
        requestBody,
        responseSchema,
      });
    }
  }

  return operations;
}

/**
 * Generate an operation ID from method and path
 * e.g., GET /users/{id} -> getUsersById
 */
function generateOperationId(method: string, path: string): string {
  // Remove leading slash and split by /
  const parts = path.replace(/^\//, "").split("/");

  // Convert each part to camelCase, handling path parameters
  const nameParts = parts.map((part, index) => {
    // Handle path parameters like {id}
    if (part.startsWith("{") && part.endsWith("}")) {
      const paramName = part.slice(1, -1);
      return `By${capitalize(paramName)}`;
    }

    // Convert to camelCase (first part lowercase, rest capitalized)
    return index === 0 ? part.toLowerCase() : capitalize(part);
  });

  // Combine method with path parts
  return method.toLowerCase() + nameParts.map(capitalize).join("");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
