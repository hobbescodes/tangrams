/**
 * GraphQL schema analysis for TanStack DB predicate push-down
 *
 * Analyzes GraphQL query arguments to detect:
 * - Filtering capabilities (Hasura-style, Prisma-style, etc.)
 * - Sorting capabilities
 * - Pagination capabilities (offset, relay-style cursor)
 */

import {
  getNamedType,
  getNullableType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isObjectType,
} from "graphql";

import type {
  GraphQLArgument,
  GraphQLField,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLOutputType,
} from "graphql";
import type { PredicateMappingPreset } from "@/core/config";
import type {
  FilterCapabilities,
  PaginationCapabilities,
  PaginationResponseInfo,
  QueryCapabilities,
  SortCapabilities,
} from "../types";

// =============================================================================
// Pattern Detection Constants
// =============================================================================

/** Hasura-style filter input type name patterns */
const hasuraFilterPatterns = [/_bool_exp$/, /_where$/];

/** Hasura-style filter field patterns (inside bool_exp types) */
const hasuraFilterFields = [
  "_eq",
  "_neq",
  "_lt",
  "_lte",
  "_gt",
  "_gte",
  "_in",
  "_nin",
  "_and",
  "_or",
  "_not",
];

/** Prisma-style filter input type name patterns */
const prismaFilterPatterns = [/WhereInput$/, /WhereUniqueInput$/];

/** Prisma-style filter field patterns */
const prismaFilterFields = [
  "equals",
  "not",
  "in",
  "notIn",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "startsWith",
  "endsWith",
];

/** Hasura-style order_by input type patterns */
const hasuraOrderByPatterns = [/_order_by$/];

/** Prisma-style orderBy input type patterns */
const prismaOrderByPatterns = [/OrderByInput$/, /OrderByWithRelationInput$/];

/** Common argument names for filtering */
const filterArgNames = ["where", "filter", "filters"];

/** Common argument names for sorting */
const sortArgNames = ["order_by", "orderBy", "sort", "sortBy"];

/** Offset pagination argument names */
const limitArgNames = ["limit", "first", "take"];
const offsetArgNames = ["offset", "skip"];

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Analyze a GraphQL query field to detect filtering, sorting, and pagination capabilities
 */
export function analyzeGraphQLQueryCapabilities(
  field: GraphQLField<unknown, unknown>,
): QueryCapabilities {
  const args = field.args;

  const filter = analyzeFilterCapabilities(args);
  const sort = analyzeSortCapabilities(args);
  const pagination = analyzePaginationCapabilities(args);

  return { filter, sort, pagination };
}

// =============================================================================
// Filter Analysis
// =============================================================================

/**
 * Analyze query arguments to detect filtering capabilities
 */
export function analyzeFilterCapabilities(
  args: readonly GraphQLArgument[],
): FilterCapabilities {
  // Look for a filter/where argument
  for (const argName of filterArgNames) {
    const filterArg = args.find(
      (a) => a.name.toLowerCase() === argName.toLowerCase(),
    );
    if (filterArg) {
      const inputType = unwrapType(filterArg.type);
      if (isInputObjectType(inputType)) {
        const style = detectFilterStyle(inputType);
        return {
          hasFiltering: true,
          filterStyle: style,
          filterInputType: inputType.name,
        };
      }
    }
  }

  return {
    hasFiltering: false,
  };
}

/**
 * Detect the filter style from a GraphQL input object type
 */
export function detectFilterStyle(
  inputType: GraphQLInputObjectType,
): PredicateMappingPreset | "custom" {
  const typeName = inputType.name;
  const fieldNames = Object.keys(inputType.getFields());

  // Check for Hasura-style by type name pattern
  if (hasuraFilterPatterns.some((pattern) => pattern.test(typeName))) {
    return "hasura";
  }

  // Check for Hasura-style by field patterns
  if (hasuraFilterFields.some((field) => fieldNames.includes(field))) {
    return "hasura";
  }

  // Check for Prisma-style by type name pattern
  if (prismaFilterPatterns.some((pattern) => pattern.test(typeName))) {
    return "prisma";
  }

  // Check for Prisma-style by field patterns
  if (prismaFilterFields.some((field) => fieldNames.includes(field))) {
    return "prisma";
  }

  // Could not determine style - return custom
  return "custom";
}

/**
 * Detect filter style from a type name alone (without field inspection)
 */
export function detectFilterStyleFromTypeName(
  typeName: string,
): PredicateMappingPreset | undefined {
  if (hasuraFilterPatterns.some((pattern) => pattern.test(typeName))) {
    return "hasura";
  }
  if (prismaFilterPatterns.some((pattern) => pattern.test(typeName))) {
    return "prisma";
  }
  return undefined;
}

// =============================================================================
// Sort Analysis
// =============================================================================

/**
 * Analyze query arguments to detect sorting capabilities
 */
export function analyzeSortCapabilities(
  args: readonly GraphQLArgument[],
): SortCapabilities {
  for (const argName of sortArgNames) {
    const sortArg = args.find(
      (a) => a.name.toLowerCase() === argName.toLowerCase(),
    );
    if (sortArg) {
      const inputType = unwrapType(sortArg.type);
      const inputTypeName = isInputObjectType(inputType)
        ? inputType.name
        : undefined;

      return {
        hasSorting: true,
        sortParam: sortArg.name,
        orderByInputType: inputTypeName,
      };
    }
  }

  return {
    hasSorting: false,
  };
}

/**
 * Detect the order_by style from a type name
 */
export function detectOrderByStyle(
  typeName: string,
): PredicateMappingPreset | undefined {
  if (hasuraOrderByPatterns.some((pattern) => pattern.test(typeName))) {
    return "hasura";
  }
  if (prismaOrderByPatterns.some((pattern) => pattern.test(typeName))) {
    return "prisma";
  }
  return undefined;
}

// =============================================================================
// Pagination Analysis
// =============================================================================

/**
 * Analyze query arguments to detect pagination capabilities
 */
export function analyzePaginationCapabilities(
  args: readonly GraphQLArgument[],
): PaginationCapabilities {
  const argNames = args.map((a) => a.name.toLowerCase());

  // Check for Relay-style cursor pagination (first/last + after/before)
  const hasFirst = argNames.includes("first");
  const hasLast = argNames.includes("last");
  const hasAfter = argNames.includes("after");
  const hasBefore = argNames.includes("before");

  if ((hasFirst || hasLast) && (hasAfter || hasBefore)) {
    return {
      style: "relay",
      limitParam: hasFirst
        ? findArgName(args, "first")
        : findArgName(args, "last"),
    };
  }

  // Check for Prisma-style (take/skip)
  const hasTake = argNames.includes("take");
  const hasSkip = argNames.includes("skip");
  if (hasTake || hasSkip) {
    return {
      style: "offset",
      limitParam: findArgName(args, "take"),
      offsetParam: findArgName(args, "skip"),
    };
  }

  // Check for standard offset pagination (limit/offset)
  const hasLimit = limitArgNames.some((name) =>
    argNames.includes(name.toLowerCase()),
  );
  const hasOffset = offsetArgNames.some((name) =>
    argNames.includes(name.toLowerCase()),
  );

  if (hasLimit || hasOffset) {
    return {
      style: "offset",
      limitParam: findArgNameFromList(args, limitArgNames),
      offsetParam: findArgNameFromList(args, offsetArgNames),
    };
  }

  return {
    style: "none",
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Unwrap NonNull and List wrappers to get the underlying type
 */
export function unwrapType(type: GraphQLInputType): GraphQLInputType {
  if (isNonNullType(type)) {
    return unwrapType(type.ofType);
  }
  if (isListType(type)) {
    return unwrapType(type.ofType);
  }
  return type;
}

/**
 * Find the original argument name (preserving case)
 */
function findArgName(
  args: readonly GraphQLArgument[],
  name: string,
): string | undefined {
  return args.find((a) => a.name.toLowerCase() === name.toLowerCase())?.name;
}

/**
 * Find an argument name from a list of possible names
 */
function findArgNameFromList(
  args: readonly GraphQLArgument[],
  possibleNames: string[],
): string | undefined {
  const argNames = args.map((a) => a.name.toLowerCase());
  for (const name of possibleNames) {
    const lowerName = name.toLowerCase();
    if (argNames.includes(lowerName)) {
      return args.find((a) => a.name.toLowerCase() === lowerName)?.name;
    }
  }
  return undefined;
}

/**
 * Check if the query has any filtering/sorting/pagination capabilities
 */
export function hasQueryCapabilities(capabilities: QueryCapabilities): boolean {
  return (
    capabilities.filter.hasFiltering ||
    capabilities.sort.hasSorting ||
    capabilities.pagination.style !== "none"
  );
}

/**
 * Infer the predicate mapping preset from detected capabilities
 */
export function inferPredicateMappingPreset(
  capabilities: QueryCapabilities,
): PredicateMappingPreset | undefined {
  // Check filter style
  if (
    capabilities.filter.hasFiltering &&
    capabilities.filter.filterStyle &&
    capabilities.filter.filterStyle !== "custom"
  ) {
    return capabilities.filter.filterStyle;
  }

  // Check if order_by type name suggests a style
  if (capabilities.sort.orderByInputType) {
    const style = detectOrderByStyle(capabilities.sort.orderByInputType);
    if (style) return style;
  }

  return undefined;
}

// =============================================================================
// Relay Connection Analysis (for infinite query generation)
// =============================================================================

/**
 * Analyze a GraphQL return type to detect Relay connection pattern
 *
 * Detects patterns like:
 * ```graphql
 * type PostConnection {
 *   edges: [PostEdge!]!
 *   pageInfo: PageInfo!
 * }
 * type PostEdge {
 *   node: Post!
 *   cursor: String!
 * }
 * type PageInfo {
 *   hasNextPage: Boolean!
 *   endCursor: String
 * }
 * ```
 */
export function analyzeRelayConnection(
  returnType: GraphQLOutputType,
): PaginationResponseInfo {
  const namedType = getNamedType(returnType);

  if (!isObjectType(namedType)) {
    return { style: "none" };
  }

  const fields = namedType.getFields();

  // Check for edges field (required for Relay connection)
  const edgesField = fields.edges;
  if (!edgesField) {
    return { style: "none" };
  }

  // Verify edges is a list type
  const edgesType = getNullableType(edgesField.type);
  if (!isListType(edgesType)) {
    return { style: "none" };
  }

  // Check for pageInfo field (required for Relay connection)
  const pageInfoField = fields.pageInfo;
  if (!pageInfoField) {
    return { style: "none" };
  }

  // Get pageInfo type and check for hasNextPage/endCursor
  const pageInfoType = getNamedType(pageInfoField.type);
  if (!isObjectType(pageInfoType)) {
    return { style: "none" };
  }

  const pageInfoFields = pageInfoType.getFields();

  // Build the result based on what pageInfo fields exist
  const result: PaginationResponseInfo = {
    style: "relay",
  };

  if (pageInfoFields.hasNextPage) {
    result.hasMorePath = ["pageInfo", "hasNextPage"];
  }

  if (pageInfoFields.endCursor) {
    result.nextCursorPath = ["pageInfo", "endCursor"];
  }

  return result;
}

/**
 * Determine the page parameter name from GraphQL pagination capabilities
 */
export function getGraphQLPageParamName(
  pagination: PaginationCapabilities,
  args: readonly GraphQLArgument[],
): string | undefined {
  const argNames = args.map((a) => a.name.toLowerCase());

  switch (pagination.style) {
    case "relay": {
      // Prefer "after" for forward pagination
      if (argNames.includes("after")) {
        return args.find((a) => a.name.toLowerCase() === "after")?.name;
      }
      if (argNames.includes("before")) {
        return args.find((a) => a.name.toLowerCase() === "before")?.name;
      }
      return undefined;
    }
    case "offset": {
      // For offset pagination, use skip/offset
      if (pagination.offsetParam) {
        return pagination.offsetParam;
      }
      const offsetArg = args.find((a) =>
        offsetArgNames.some((o) => a.name.toLowerCase() === o.toLowerCase()),
      );
      return offsetArg?.name;
    }
    default:
      return undefined;
  }
}
