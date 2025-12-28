/**
 * OpenAPI operations generation
 *
 * Generates queryOptions, infiniteQueryOptions, and mutationOptions that import
 * standalone fetch functions from functions.ts.
 */

import {
  toCamelCase,
  toInfiniteQueryOptionsName,
  toPascalCase,
} from "@/utils/naming";
import {
  createWriter,
  writeHeader,
  writeImport,
  writeSectionComment,
} from "@/utils/writer";

import type CodeBlockWriter from "code-block-writer";
import type {
  InfiniteQueryOverrideConfig,
  OpenAPISourceConfig,
  QueryOverridesConfig,
} from "@/core/config";
import type {
  GeneratedFile,
  InfiniteQueryPaginationInfo,
  OpenAPIAdapterSchema,
  OperationGenOptions,
} from "../types";
import type { ParsedOperation } from "./schema";

/**
 * Extended options for operation generation including query overrides
 */
export interface OpenAPIOperationGenOptions extends OperationGenOptions {
  /** Query overrides from config */
  queryOverrides?: QueryOverridesConfig;
}

/**
 * Result of generating operations, includes warnings
 */
export interface OpenAPIOperationsResult extends GeneratedFile {
  /** Warnings encountered during generation */
  warnings: string[];
}

/**
 * Generate TanStack Query operation helpers from OpenAPI spec
 */
export function generateOpenAPIOperations(
  _schema: OpenAPIAdapterSchema,
  _config: OpenAPISourceConfig,
  operations: ParsedOperation[],
  options: OpenAPIOperationGenOptions,
): OpenAPIOperationsResult {
  const writer = createWriter();
  const warnings: string[] = [];

  writeHeader(writer);

  // Separate operations by type
  const queries = operations.filter((op) => ["get"].includes(op.method));
  const mutations = operations.filter((op) =>
    ["post", "put", "patch", "delete"].includes(op.method),
  );

  // Check which queries have infinite query options
  const infiniteQueries = queries.filter((op) => {
    const override = options.queryOverrides?.operations?.[op.operationId];
    if (override?.disabled) return false;
    return canGenerateInfiniteQuery(op, override, warnings);
  });

  // External imports (sorted alphabetically)
  const tanstackImports: string[] = [];
  if (infiniteQueries.length > 0) tanstackImports.push("infiniteQueryOptions");
  if (mutations.length > 0) tanstackImports.push("mutationOptions");
  if (queries.length > 0) tanstackImports.push("queryOptions");

  if (tanstackImports.length > 0) {
    writeImport(writer, "@tanstack/react-query", tanstackImports);
  }

  // Internal imports (sorted alphabetically)
  const functionImports = getFunctionImports(operations);
  if (functionImports.length > 0) {
    writer.blankLine();
    writeImport(writer, options.functionsImportPath, functionImports);
  }

  // Type imports (sorted alphabetically, always last with blank line)
  const typeImports = generateTypeImports(operations, infiniteQueries);
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

  // Generate infinite query options for paginated GET operations
  if (infiniteQueries.length > 0) {
    writeSectionComment(
      writer,
      "Infinite Query Options (paginated GET operations)",
    );
    writer.blankLine();
    for (const op of infiniteQueries) {
      const override = options.queryOverrides?.operations?.[op.operationId];
      writeInfiniteQueryOption(writer, op, queryKeyPrefix, override);
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
    warnings,
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
function generateTypeImports(
  operations: ParsedOperation[],
  _infiniteQueries: ParsedOperation[],
): string[] {
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
 * Check if we can generate infinite query options for an operation
 */
function canGenerateInfiniteQuery(
  op: ParsedOperation,
  override: InfiniteQueryOverrideConfig | undefined,
  warnings: string[],
): boolean {
  // If user provided a custom getNextPageParamPath, we can always generate
  if (override?.getNextPageParamPath) {
    return true;
  }

  // Check if pagination info exists
  const paginationInfo = op.paginationInfo;
  if (!paginationInfo) {
    return false;
  }

  // Check if we can infer getNextPageParam from response
  if (paginationInfo.response.style === "none") {
    warnings.push(
      `Operation "${op.operationId}" has pagination parameters (${paginationInfo.pageParamName}) ` +
        `but response structure could not be analyzed for getNextPageParam. ` +
        `Skipping infiniteQueryOptions generation. ` +
        `Configure 'overrides.query.operations.${op.operationId}.getNextPageParamPath' to enable.`,
    );
    return false;
  }

  return true;
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

// =============================================================================
// Infinite Query Options Generation
// =============================================================================

/**
 * Write infiniteQueryOptions for a paginated GET operation
 */
function writeInfiniteQueryOption(
  writer: CodeBlockWriter,
  op: ParsedOperation,
  keyPrefix: string,
  override?: InfiniteQueryOverrideConfig,
): void {
  const paginationInfo = op.paginationInfo;
  if (!paginationInfo) return;

  const baseName = toPascalCase(op.operationId);
  const optionsFnName = toInfiniteQueryOptionsName(op.operationId);
  const fetchFnName = toCamelCase(op.operationId);
  const pageParamName = paginationInfo.pageParamName;

  // Determine if we have other params besides the page param
  const hasPathParams = op.pathParams.length > 0;
  const otherQueryParams = op.queryParams.filter(
    (p) => p.name !== pageParamName,
  );
  const hasOtherParams = hasPathParams || otherQueryParams.length > 0;

  // Determine params type (Omit the page param if we have other params)
  let paramsType: string | null = null;
  if (hasOtherParams) {
    paramsType = `Omit<${baseName}Params, "${pageParamName}">`;
  }

  // Build query key (excludes page param, includes "infinite" segment)
  const queryKey = paramsType
    ? `[${keyPrefix}"${op.operationId}", "infinite", params]`
    : `[${keyPrefix}"${op.operationId}", "infinite"]`;

  // Determine initialPageParam
  const initialPageParam =
    override?.initialPageParam ?? getDefaultInitialPageParam(paginationInfo);

  // Generate getNextPageParam expression
  const getNextPageParamExpr = override?.getNextPageParamPath
    ? generateAccessorFromPath(override.getNextPageParamPath)
    : generateGetNextPageParam(paginationInfo);

  // Write the function
  if (!paramsType) {
    writer.write(`export const ${optionsFnName} = () =>`).newLine();
  } else {
    // Query params are optional, path params are required
    const paramModifier = hasPathParams ? "" : "?";
    writer
      .write(
        `export const ${optionsFnName} = (params${paramModifier}: ${paramsType}) =>`,
      )
      .newLine();
  }

  writer
    .indent()
    .write("infiniteQueryOptions(")
    .inlineBlock(() => {
      writer.writeLine(`queryKey: ${queryKey},`);

      // queryFn with pageParam
      if (paramsType) {
        writer.writeLine(
          `queryFn: ({ pageParam }) => ${fetchFnName}({ ...params, ${pageParamName}: pageParam }),`,
        );
      } else {
        writer.writeLine(
          `queryFn: ({ pageParam }) => ${fetchFnName}({ ${pageParamName}: pageParam }),`,
        );
      }

      // initialPageParam - add type annotation for cursor-based pagination
      if (initialPageParam === undefined) {
        // For cursor/relay pagination, we need to type the undefined
        // so TypeScript knows pageParam is string | undefined
        const isCursorBased =
          paginationInfo.params.style === "cursor" ||
          paginationInfo.params.style === "relay";
        if (isCursorBased) {
          writer.writeLine(
            "initialPageParam: undefined as string | undefined,",
          );
        } else {
          writer.writeLine("initialPageParam: undefined,");
        }
      } else if (typeof initialPageParam === "string") {
        writer.writeLine(`initialPageParam: "${initialPageParam}",`);
      } else {
        writer.writeLine(
          `initialPageParam: ${JSON.stringify(initialPageParam)},`,
        );
      }

      // getNextPageParam - include lastPageParam if the expression uses it
      const needsLastPageParam = getNextPageParamExpr.includes("lastPageParam");
      const getNextPageParamArgs = needsLastPageParam
        ? "(lastPage, _allPages, lastPageParam)"
        : "(lastPage)";
      writer.writeLine(
        `getNextPageParam: ${getNextPageParamArgs} => ${getNextPageParamExpr},`,
      );
    })
    .write(")");
}

/**
 * Get the default initial page param based on pagination style
 */
function getDefaultInitialPageParam(
  paginationInfo: InfiniteQueryPaginationInfo,
): unknown {
  switch (paginationInfo.params.style) {
    case "cursor":
    case "relay":
      return undefined;
    case "offset":
      return 0;
    case "page":
      return 1;
    default:
      return undefined;
  }
}

/**
 * Generate getNextPageParam expression from pagination info
 */
function generateGetNextPageParam(
  paginationInfo: InfiniteQueryPaginationInfo,
): string {
  const { response, params } = paginationInfo;

  switch (response.style) {
    case "cursor":
      return `lastPage.${response.nextCursorField}`;

    case "relay": {
      const hasMorePath =
        response.hasMorePath?.join("?.") ?? "pageInfo?.hasNextPage";
      const cursorPath =
        response.nextCursorPath?.join("?.") ?? "pageInfo?.endCursor";
      return `lastPage.${hasMorePath} ? lastPage.${cursorPath} : undefined`;
    }

    case "hasMore": {
      const hasMoreField = response.hasMoreField ?? "hasMore";
      // For hasMore with offset pagination
      if (params.style === "offset") {
        const limitParam = params.limitParam ?? "limit";
        return `lastPage.${hasMoreField} ? (lastPageParam ?? 0) + (params?.${limitParam} ?? 20) : undefined`;
      }
      // For hasMore with page pagination
      if (params.style === "page") {
        return `lastPage.${hasMoreField} ? (lastPageParam ?? 1) + 1 : undefined`;
      }
      // For hasMore with cursor - just check if there's more
      return `lastPage.${hasMoreField} ? lastPage.nextCursor : undefined`;
    }

    case "offset": {
      // Total-based offset calculation
      if (response.totalField) {
        const limitParam = params.limitParam ?? "limit";
        return (
          `(lastPageParam ?? 0) + (params?.${limitParam} ?? 20) < lastPage.${response.totalField} ` +
          `? (lastPageParam ?? 0) + (params?.${limitParam} ?? 20) : undefined`
        );
      }
      return "undefined";
    }

    default:
      return "undefined";
  }
}

/**
 * Generate accessor expression from a dot-notation path
 */
function generateAccessorFromPath(path: string): string {
  const parts = path.split(".");
  return `lastPage.${parts.join("?.")}`;
}
