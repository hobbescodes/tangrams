/**
 * GraphQL operations generation
 *
 * Generates queryOptions, infiniteQueryOptions, and mutationOptions that import
 * standalone fetch functions from functions.ts.
 */

import { Kind } from "graphql";

import {
  analyzePaginationCapabilities,
  analyzeRelayConnection,
  getGraphQLPageParamName,
} from "@/adapters/graphql/analysis";
import {
  toCamelCase,
  toInfiniteQueryOptionsName,
  toMutationOptionsName,
  toMutationVariablesTypeName,
  toQueryOptionsName,
  toQueryVariablesTypeName,
} from "@/utils/naming";
import {
  createWriter,
  writeHeader,
  writeImport,
  writeSectionComment,
} from "@/utils/writer";

import type CodeBlockWriter from "code-block-writer";
import type { GraphQLSchema } from "graphql";
import type {
  InfiniteQueryPaginationInfo,
  PaginationResponseInfo,
} from "@/adapters/types";
import type {
  InfiniteQueryOverrideConfig,
  QueryOverridesConfig,
} from "@/core/config";
import type { ParsedDocuments, ParsedOperation } from "@/core/documents";

export interface OperationsGeneratorOptions {
  documents: ParsedDocuments;
  typesImportPath: string;
  /** The source name to include in query/mutation keys */
  sourceName: string;
  /** GraphQL schema for analyzing return types (for Relay connections) */
  schema?: GraphQLSchema;
  /** Query overrides from config */
  queryOverrides?: QueryOverridesConfig;
}

/** Hardcoded import path for functions (always ../functions from query/) */
const FUNCTIONS_IMPORT_PATH = "../functions";

/**
 * Result of generating GraphQL operations
 */
export interface GraphQLOperationsResult {
  content: string;
  warnings: string[];
}

// =============================================================================
// Pagination Analysis Helpers
// =============================================================================

interface PaginatedQueryInfo {
  operation: ParsedOperation;
  paginationInfo: InfiniteQueryPaginationInfo | null;
}

/**
 * Analyze queries for pagination capabilities
 */
function analyzePaginatedQueries(
  queries: ParsedOperation[],
  schema: GraphQLSchema | undefined,
  queryOverrides: QueryOverridesConfig | undefined,
  warnings: string[],
): PaginatedQueryInfo[] {
  return queries.map((operation) => {
    const override = queryOverrides?.operations?.[operation.name];

    // If disabled, skip
    if (override?.disabled) {
      return { operation, paginationInfo: null };
    }

    // If user provided getNextPageParamPath, we can generate
    if (override?.getNextPageParamPath) {
      // Still need to detect pagination params for the pageParamName
      const paginationParams = analyzePaginationFromVariables(operation);
      if (paginationParams.style !== "none") {
        const pageParamName = getPageParamNameFromVariables(
          operation,
          paginationParams,
        );
        if (pageParamName) {
          return {
            operation,
            paginationInfo: {
              params: paginationParams,
              response: { style: "cursor" }, // Assume cursor since they provided a path
              pageParamName,
            },
          };
        }
      }
    }

    // Analyze variable definitions for pagination params
    const paginationParams = analyzePaginationFromVariables(operation);
    if (paginationParams.style === "none") {
      return { operation, paginationInfo: null };
    }

    // Get the page param name
    const pageParamName = getPageParamNameFromVariables(
      operation,
      paginationParams,
    );
    if (!pageParamName) {
      return { operation, paginationInfo: null };
    }

    // Analyze return type for Relay connection pattern (if schema available)
    let responseInfo: PaginationResponseInfo = { style: "none" };
    if (schema && paginationParams.style === "relay") {
      responseInfo = analyzeQueryReturnType(operation, schema);
    }

    // If we can't determine response structure, warn and skip
    if (responseInfo.style === "none" && !override?.getNextPageParamPath) {
      warnings.push(
        `Query "${operation.name}" has pagination arguments (${pageParamName}) ` +
          `but return type could not be analyzed for getNextPageParam. ` +
          `Skipping infiniteQueryOptions generation. ` +
          `Configure 'overrides.query.operations.${operation.name}.getNextPageParamPath' to enable.`,
      );
      return { operation, paginationInfo: null };
    }

    return {
      operation,
      paginationInfo: {
        params: paginationParams,
        response: responseInfo,
        pageParamName,
      },
    };
  });
}

/**
 * Analyze variable definitions for pagination patterns
 */
function analyzePaginationFromVariables(
  operation: ParsedOperation,
): ReturnType<typeof analyzePaginationCapabilities> {
  const variableDefs = operation.node.variableDefinitions ?? [];

  // Convert variable definitions to a format analyzePaginationCapabilities can use
  const mockArgs = variableDefs.map((v) => ({
    name: v.variable.name.value,
    type: v.type,
  }));

  // Use the existing analysis function
  return analyzePaginationCapabilities(mockArgs as never);
}

/**
 * Get the page param name from variable definitions
 */
function getPageParamNameFromVariables(
  operation: ParsedOperation,
  paginationParams: ReturnType<typeof analyzePaginationCapabilities>,
): string | undefined {
  const variableDefs = operation.node.variableDefinitions ?? [];
  const mockArgs = variableDefs.map((v) => ({
    name: v.variable.name.value,
  }));

  return getGraphQLPageParamName(paginationParams, mockArgs as never);
}

/**
 * Analyze the return type of a query for Relay connection pattern
 */
function analyzeQueryReturnType(
  operation: ParsedOperation,
  schema: GraphQLSchema,
): PaginationResponseInfo {
  // Get the query type from the schema
  const queryType = schema.getQueryType();
  if (!queryType) {
    return { style: "none" };
  }

  // Get the first selection from the operation (the actual query field)
  const selections = operation.node.selectionSet.selections;
  if (selections.length === 0) {
    return { style: "none" };
  }

  // Find the field being queried
  const firstSelection = selections[0];
  if (!firstSelection || firstSelection.kind !== Kind.FIELD) {
    return { style: "none" };
  }

  const fieldName = firstSelection.name.value;
  const field = queryType.getFields()[fieldName];
  if (!field) {
    return { style: "none" };
  }

  // Analyze the return type for Relay connection pattern
  const relayInfo = analyzeRelayConnection(field.type);

  // If Relay connection detected, add the field name to the paths
  if (relayInfo.style === "relay") {
    return {
      ...relayInfo,
      // Prepend the field name to the paths since the response is { fieldName: { pageInfo: ... } }
      hasMorePath: relayInfo.hasMorePath
        ? [fieldName, ...relayInfo.hasMorePath]
        : undefined,
      nextCursorPath: relayInfo.nextCursorPath
        ? [fieldName, ...relayInfo.nextCursorPath]
        : undefined,
    };
  }

  return relayInfo;
}

// =============================================================================
// Infinite Query Options Generation
// =============================================================================

/**
 * Write infiniteQueryOptions for a paginated query operation
 */
function writeInfiniteQueryOptions(
  writer: CodeBlockWriter,
  operation: ParsedOperation,
  sourceName: string,
  paginationInfo: InfiniteQueryPaginationInfo,
  override?: InfiniteQueryOverrideConfig,
): void {
  const optionsFnName = toInfiniteQueryOptionsName(operation.name);
  const fetchFnName = toCamelCase(operation.name);
  const variablesType = toQueryVariablesTypeName(operation.name);
  const pageParamName = paginationInfo.pageParamName;

  const variableDefs = operation.node.variableDefinitions ?? [];
  const hasVariables = variableDefs.length > 0;

  // Check if there are other variables besides the page param
  const otherVariables = variableDefs.filter(
    (v) => v.variable.name.value !== pageParamName,
  );
  const hasOtherVariables = otherVariables.length > 0;

  // Check if all other variables are optional
  const allOtherOptional =
    hasOtherVariables &&
    otherVariables.every((v) => v.type.kind !== "NonNullType");

  // Determine the variables type (Omit the page param)
  let varsParam: string | null = null;
  if (hasOtherVariables) {
    const omitType = `Omit<${variablesType}, "${pageParamName}">`;
    varsParam = allOtherOptional
      ? `variables?: ${omitType}`
      : `variables: ${omitType}`;
  }

  // Build query key
  const queryKey = hasOtherVariables
    ? `["${sourceName}", "${operation.name}", "infinite", variables]`
    : `["${sourceName}", "${operation.name}", "infinite"]`;

  // Determine initialPageParam
  const initialPageParam =
    override?.initialPageParam ?? getDefaultInitialPageParam(paginationInfo);

  // Generate getNextPageParam expression
  const getNextPageParamExpr = override?.getNextPageParamPath
    ? generateAccessorFromPath(override.getNextPageParamPath)
    : generateGetNextPageParam(paginationInfo);

  // Write the function signature
  if (!varsParam) {
    writer.write(`export const ${optionsFnName} = () =>`).newLine();
  } else {
    writer.write(`export const ${optionsFnName} = (${varsParam}) =>`).newLine();
  }

  writer
    .indent()
    .write("infiniteQueryOptions(")
    .inlineBlock(() => {
      writer.writeLine(`queryKey: ${queryKey},`);

      // queryFn with pageParam
      if (hasVariables) {
        if (hasOtherVariables) {
          writer.writeLine(
            `queryFn: ({ pageParam }) => ${fetchFnName}({ ...variables, ${pageParamName}: pageParam }),`,
          );
        } else {
          writer.writeLine(
            `queryFn: ({ pageParam }) => ${fetchFnName}({ ${pageParamName}: pageParam }),`,
          );
        }
      } else {
        writer.writeLine(`queryFn: ({ pageParam }) => ${fetchFnName}(),`);
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

      // getNextPageParam
      writer.writeLine(
        `getNextPageParam: (lastPage) => ${getNextPageParamExpr},`,
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
  const { response } = paginationInfo;

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
      return `lastPage.${hasMoreField} ? lastPage.nextCursor : undefined`;
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

// =============================================================================
// Main Generation Function
// =============================================================================

/**
 * Generate the operations file with queryOptions, infiniteQueryOptions, and mutationOptions
 */
export function generateGraphQLOperations(
  options: OperationsGeneratorOptions,
): GraphQLOperationsResult {
  const { documents, typesImportPath, sourceName, schema, queryOverrides } =
    options;
  const { operations } = documents;
  const warnings: string[] = [];

  const writer = createWriter();

  writeHeader(writer);

  // Determine what imports we need
  const queries = operations.filter((op) => op.operation === "query");
  const mutations = operations.filter((op) => op.operation === "mutation");
  const hasQueries = queries.length > 0;
  const hasMutations = mutations.length > 0;

  // Analyze pagination for queries
  const paginatedQueries = analyzePaginatedQueries(
    queries,
    schema,
    queryOverrides,
    warnings,
  );
  const infiniteQueries = paginatedQueries.filter(
    (
      q,
    ): q is PaginatedQueryInfo & {
      paginationInfo: InfiniteQueryPaginationInfo;
    } => q.paginationInfo !== null,
  );

  // External imports (sorted alphabetically)
  const tanstackImports: string[] = [];
  if (infiniteQueries.length > 0) tanstackImports.push("infiniteQueryOptions");
  if (hasMutations) tanstackImports.push("mutationOptions");
  if (hasQueries) tanstackImports.push("queryOptions");

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
  const typeImports = generateVariableTypeImports(operations);
  if (typeImports.length > 0) {
    writer.blankLine();
    writeImport(writer, typesImportPath, typeImports, true);
  }

  writer.blankLine();

  // Generate query options
  if (hasQueries) {
    writeSectionComment(writer, "Query Options");
    for (const operation of queries) {
      writeQueryOptions(writer, operation, sourceName);
      writer.blankLine();
    }
  }

  // Generate infinite query options
  if (infiniteQueries.length > 0) {
    writeSectionComment(writer, "Infinite Query Options");
    for (const { operation, paginationInfo } of infiniteQueries) {
      const override = queryOverrides?.operations?.[operation.name];
      writeInfiniteQueryOptions(
        writer,
        operation,
        sourceName,
        paginationInfo,
        override,
      );
      writer.blankLine();
    }
  }

  // Generate mutation options
  if (hasMutations) {
    writeSectionComment(writer, "Mutation Options");
    for (const operation of mutations) {
      writeMutationOptions(writer, operation, sourceName);
      writer.blankLine();
    }
  }

  return {
    content: writer.toString(),
    warnings,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get function import names for all operations
 */
function getFunctionImports(operations: ParsedOperation[]): string[] {
  return operations.map((op) => toCamelCase(op.name));
}

/**
 * Generate type imports for variable types only (sorted alphabetically)
 */
function generateVariableTypeImports(operations: ParsedOperation[]): string[] {
  const imports: string[] = [];

  for (const op of operations) {
    const hasVariables =
      op.node.variableDefinitions && op.node.variableDefinitions.length > 0;

    if (hasVariables) {
      if (op.operation === "query") {
        imports.push(toQueryVariablesTypeName(op.name));
      } else if (op.operation === "mutation") {
        imports.push(toMutationVariablesTypeName(op.name));
      }
    }
  }

  return imports.sort();
}

/**
 * Write queryOptions for a query operation
 */
function writeQueryOptions(
  writer: CodeBlockWriter,
  operation: ParsedOperation,
  sourceName: string,
): void {
  const optionsFnName = toQueryOptionsName(operation.name);
  const fetchFnName = toCamelCase(operation.name);
  const variablesType = toQueryVariablesTypeName(operation.name);

  const hasVariables =
    operation.node.variableDefinitions &&
    operation.node.variableDefinitions.length > 0;

  // Check if all variables are optional
  const allOptional =
    hasVariables &&
    operation.node.variableDefinitions?.every(
      (v) => v.type.kind !== "NonNullType",
    );

  if (!hasVariables) {
    writer.write(`export const ${optionsFnName} = () =>`).newLine();
    writer
      .indent()
      .write("queryOptions(")
      .inlineBlock(() => {
        writer.writeLine(`queryKey: ["${sourceName}", "${operation.name}"],`);
        writer.writeLine(`queryFn: () => ${fetchFnName}(),`);
      })
      .write(")");
    return;
  }

  const variableParam = allOptional
    ? `variables?: ${variablesType}`
    : `variables: ${variablesType}`;

  writer
    .write(`export const ${optionsFnName} = (${variableParam}) =>`)
    .newLine();
  writer
    .indent()
    .write("queryOptions(")
    .inlineBlock(() => {
      writer.writeLine(
        `queryKey: ["${sourceName}", "${operation.name}", variables],`,
      );
      writer.writeLine(`queryFn: () => ${fetchFnName}(variables),`);
    })
    .write(")");
}

/**
 * Write mutationOptions for a mutation operation
 */
function writeMutationOptions(
  writer: CodeBlockWriter,
  operation: ParsedOperation,
  sourceName: string,
): void {
  const optionsFnName = toMutationOptionsName(operation.name);
  const fetchFnName = toCamelCase(operation.name);
  const variablesType = toMutationVariablesTypeName(operation.name);

  const hasVariables =
    operation.node.variableDefinitions &&
    operation.node.variableDefinitions.length > 0;

  writer.write(`export const ${optionsFnName} = () =>`).newLine();
  writer
    .indent()
    .write("mutationOptions(")
    .inlineBlock(() => {
      writer.writeLine(`mutationKey: ["${sourceName}", "${operation.name}"],`);
      if (!hasVariables) {
        writer.writeLine(`mutationFn: () => ${fetchFnName}(),`);
      } else {
        writer.writeLine(
          `mutationFn: (variables: ${variablesType}) => ${fetchFnName}(variables),`,
        );
      }
    })
    .write(")");
}
