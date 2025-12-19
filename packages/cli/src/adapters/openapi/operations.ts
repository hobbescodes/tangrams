/**
 * OpenAPI operations generation
 *
 * Generates queryOptions and mutationOptions that import standalone
 * fetch functions from functions.ts.
 */

import { toCamelCase, toPascalCase } from "@/utils/naming";
import {
  createWriter,
  writeHeader,
  writeImport,
  writeSectionComment,
} from "@/utils/writer";

import type CodeBlockWriter from "code-block-writer";
import type { OpenAPISourceConfig } from "@/core/config";
import type {
  GeneratedFile,
  OpenAPIAdapterSchema,
  OperationGenOptions,
} from "../types";
import type { ParsedOperation } from "./schema";

/** Hardcoded import path for functions (always ../functions from query/) */
const FUNCTIONS_IMPORT_PATH = "../functions";

/**
 * Generate TanStack Query operation helpers from OpenAPI spec
 */
export function generateOpenAPIOperations(
  _schema: OpenAPIAdapterSchema,
  _config: OpenAPISourceConfig,
  operations: ParsedOperation[],
  options: OperationGenOptions,
): GeneratedFile {
  const writer = createWriter();

  writeHeader(writer);

  // Separate operations by type
  const queries = operations.filter((op) => ["get"].includes(op.method));
  const mutations = operations.filter((op) =>
    ["post", "put", "patch", "delete"].includes(op.method),
  );

  // External imports (sorted alphabetically)
  const tanstackImports: string[] = [];
  if (mutations.length > 0) tanstackImports.push("mutationOptions");
  if (queries.length > 0) tanstackImports.push("queryOptions");

  if (tanstackImports.length > 0) {
    writeImport(writer, "@tanstack/react-query", tanstackImports);
  }

  // Internal imports (sorted alphabetically)
  const functionImports = getFunctionImports(operations);
  if (functionImports.length > 0) {
    writer.blankLine();
    writeImport(writer, FUNCTIONS_IMPORT_PATH, functionImports);
  }

  // Type imports (sorted alphabetically, always last with blank line)
  const typeImports = generateTypeImports(operations);
  if (typeImports.length > 0) {
    writer.blankLine();
    writeImport(writer, options.typesImportPath, typeImports, true);
  }

  writer.blankLine();

  // Always include source name in query keys for consistency
  const queryKeyPrefix = `"${options.sourceName}", `;

  // Generate query options for GET operations
  if (queries.length > 0) {
    writeSectionComment(writer, "Query Options (GET operations)");
    writer.blankLine();
    for (const op of queries) {
      writeQueryOption(writer, op, queryKeyPrefix);
      writer.blankLine();
    }
  }

  // Generate mutation options for POST/PUT/PATCH/DELETE operations
  if (mutations.length > 0) {
    writeSectionComment(
      writer,
      "Mutation Options (POST/PUT/PATCH/DELETE operations)",
    );
    writer.blankLine();
    for (const op of mutations) {
      writeMutationOption(writer, op, queryKeyPrefix);
      writer.blankLine();
    }
  }

  return {
    filename: "options.ts",
    content: writer.toString(),
  };
}

/**
 * Get function import names for all operations
 */
function getFunctionImports(operations: ParsedOperation[]): string[] {
  return operations.map((op) => toCamelCase(op.operationId));
}

/**
 * Generate imports for types (sorted alphabetically)
 */
function generateTypeImports(operations: ParsedOperation[]): string[] {
  const typeImportsSet = new Set<string>();

  for (const op of operations) {
    const baseName = toPascalCase(op.operationId);
    const isQuery = op.method === "get";
    const hasParams = op.pathParams.length > 0 || op.queryParams.length > 0;

    // Request body type (only for mutations)
    if (op.requestBody) {
      typeImportsSet.add(`${baseName}Request`);
    }

    // Params type (only for queries - mutations inline their types)
    if (hasParams && isQuery) {
      typeImportsSet.add(`${baseName}Params`);
    }
  }

  return [...typeImportsSet].sort();
}

/**
 * Write queryOptions for a GET operation
 */
function writeQueryOption(
  writer: CodeBlockWriter,
  op: ParsedOperation,
  keyPrefix: string,
): void {
  const baseName = toPascalCase(op.operationId);
  const optionsFnName = `${toCamelCase(op.operationId)}QueryOptions`;
  const fetchFnName = toCamelCase(op.operationId);
  const hasPathParams = op.pathParams.length > 0;
  const hasQueryParams = op.queryParams.length > 0;
  const hasParams = hasPathParams || hasQueryParams;

  const paramsType = hasParams ? `${baseName}Params` : null;

  // Build query key
  const queryKey = hasParams
    ? `[${keyPrefix}"${op.operationId}", params]`
    : `[${keyPrefix}"${op.operationId}"]`;

  if (!hasParams) {
    writer.write(`export const ${optionsFnName} = () =>`).newLine();
    writer
      .indent()
      .write("queryOptions(")
      .inlineBlock(() => {
        writer.writeLine(`queryKey: ${queryKey},`);
        writer.writeLine(`queryFn: () => ${fetchFnName}(),`);
      })
      .write(")");
    return;
  }

  // Query params are optional, path params are required
  const paramModifier = hasPathParams ? "" : "?";

  writer
    .write(
      `export const ${optionsFnName} = (params${paramModifier}: ${paramsType}) =>`,
    )
    .newLine();
  writer
    .indent()
    .write("queryOptions(")
    .inlineBlock(() => {
      writer.writeLine(`queryKey: ${queryKey},`);
      writer.writeLine(`queryFn: () => ${fetchFnName}(params),`);
    })
    .write(")");
}

/**
 * Write mutationOptions for POST/PUT/PATCH/DELETE operations
 */
function writeMutationOption(
  writer: CodeBlockWriter,
  op: ParsedOperation,
  keyPrefix: string,
): void {
  const baseName = toPascalCase(op.operationId);
  const optionsFnName = `${toCamelCase(op.operationId)}MutationOptions`;
  const fetchFnName = toCamelCase(op.operationId);
  const hasPathParams = op.pathParams.length > 0;
  const hasBody = !!op.requestBody;

  const requestType = hasBody ? `${baseName}Request` : null;

  // Build mutation key
  const mutationKey = `[${keyPrefix}"${op.operationId}"]`;

  // Determine mutationFn variables type
  let variablesType: string;
  if (hasPathParams && hasBody) {
    // Extract path param names for the type
    const pathParamTypes = op.pathParams
      .map((p) => `${p.name}: string`)
      .join("; ");
    variablesType = `{ ${pathParamTypes}; body: ${requestType} }`;
  } else if (hasPathParams) {
    const pathParamTypes = op.pathParams
      .map((p) => `${p.name}: string`)
      .join("; ");
    variablesType = `{ ${pathParamTypes} }`;
  } else if (hasBody && requestType) {
    variablesType = `{ body: ${requestType} }`;
  } else {
    variablesType = "void";
  }

  writer.write(`export const ${optionsFnName} = () =>`).newLine();
  writer
    .indent()
    .write("mutationOptions(")
    .inlineBlock(() => {
      writer.writeLine(`mutationKey: ${mutationKey},`);
      if (variablesType === "void") {
        writer.writeLine(`mutationFn: () => ${fetchFnName}(),`);
      } else {
        writer.writeLine(
          `mutationFn: (variables: ${variablesType}) => ${fetchFnName}(variables),`,
        );
      }
    })
    .write(")");
}
