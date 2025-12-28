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
import type { FieldNode, GraphQLSchema } from "graphql";
import type { InfiniteQueryPaginationInfo } from "@/adapters/types";
import type {
  InfiniteQueryOverrideConfig,
  QueryOverridesConfig,
} from "@/core/config";
import type { ParsedDocuments, ParsedOperation } from "@/core/documents";

export interface OperationsGeneratorOptions {
  documents: ParsedDocuments;
  typesImportPath: string;
  /** Relative import path to the functions file */
  functionsImportPath: string;
  /** The source name to include in query/mutation keys */
  sourceName: string;
  /** GraphQL schema for analyzing field arguments and return types */
  schema: GraphQLSchema;
  /** Query overrides from config */
  queryOverrides?: QueryOverridesConfig;
}

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
 * Get the first queried field from an operation's selection set
 */
function getFirstQueriedField(
  operation: ParsedOperation,
): FieldNode | undefined {
  const selections = operation.node.selectionSet.selections;
  for (const sel of selections) {
    if (sel.kind === Kind.FIELD) {
      return sel;
    }
  }
  return undefined;
}

/**
 * Map a schema argument name to the document variable name used for it.
 *
 * For example, if the schema field has an `after` argument and the document
 * calls it with `posts(after: $cursor)`, this returns "cursor".
 */
function mapSchemaArgToVariable(
  fieldNode: FieldNode,
  schemaArgName: string,
): string | undefined {
  const arg = fieldNode.arguments?.find((a) => a.name.value === schemaArgName);
  if (!arg) return undefined;

  // The argument value should reference a variable
  if (arg.value.kind !== Kind.VARIABLE) return undefined;

  return arg.value.name.value;
}

/**
 * Analyze queries for pagination capabilities using schema-first detection.
 *
 * This analyzes the schema field's arguments and return type rather than
 * the document's variable definitions. This allows variable names to differ
 * from schema argument names (e.g., $pageSize instead of $first).
 */
function analyzePaginatedQueries(
  queries: ParsedOperation[],
  schema: GraphQLSchema,
  queryOverrides: QueryOverridesConfig | undefined,
  _warnings: string[],
): PaginatedQueryInfo[] {
  const queryType = schema.getQueryType();
  if (!queryType) {
    return queries.map((op) => ({ operation: op, paginationInfo: null }));
  }

  return queries.map((operation) => {
    const override = queryOverrides?.operations?.[operation.name];

    // If disabled, skip
    if (override?.disabled) {
      return { operation, paginationInfo: null };
    }

    // Get the first queried field from the operation
    const fieldNode = getFirstQueriedField(operation);
    if (!fieldNode) {
      return { operation, paginationInfo: null };
    }

    // Look up the field in the schema (use actual field name, not alias)
    const schemaField = queryType.getFields()[fieldNode.name.value];
    if (!schemaField) {
      return { operation, paginationInfo: null };
    }

    // Analyze field arguments for pagination (schema-driven)
    const paginationParams = analyzePaginationCapabilities(schemaField.args);
    if (paginationParams.style === "none") {
      return { operation, paginationInfo: null };
    }

    // Determine the schema's page param arg name (e.g., "after" for relay)
    const schemaPageParamName = getGraphQLPageParamName(
      paginationParams,
      schemaField.args,
    );
    if (!schemaPageParamName) {
      return { operation, paginationInfo: null };
    }

    // Map schema arg name to document variable name
    const pageParamName = mapSchemaArgToVariable(
      fieldNode,
      schemaPageParamName,
    );
    if (!pageParamName) {
      // The document doesn't pass this pagination argument, skip
      return { operation, paginationInfo: null };
    }

    // Analyze return type for Relay connection pattern
    let responseInfo = analyzeRelayConnection(schemaField.type);

    // If Relay connection detected, prepend the response key to the paths
    // Use alias if present, otherwise field name
    if (responseInfo.style === "relay") {
      const responseKey = fieldNode.alias?.value ?? fieldNode.name.value;
      responseInfo = {
        ...responseInfo,
        hasMorePath: responseInfo.hasMorePath
          ? [responseKey, ...responseInfo.hasMorePath]
          : undefined,
        nextCursorPath: responseInfo.nextCursorPath
          ? [responseKey, ...responseInfo.nextCursorPath]
          : undefined,
      };
    }

    // If user provided getNextPageParamPath override, use cursor style
    if (override?.getNextPageParamPath) {
      responseInfo = { style: "cursor" };
    }

    // If we can't determine response structure and no override, skip
    if (responseInfo.style === "none" && !override?.getNextPageParamPath) {
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
  const {
    documents,
    typesImportPath,
    functionsImportPath,
    sourceName,
    schema,
    queryOverrides,
  } = options;
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
    writeImport(writer, functionsImportPath, functionImports);
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
