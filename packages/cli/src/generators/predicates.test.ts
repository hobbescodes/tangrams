import { describe, expect, it } from "vitest";

import {
  generatePredicateTranslator,
  needsPredicateTranslation,
} from "./predicates";

import type { CollectionEntity } from "@/adapters/types";

// =============================================================================
// Test Helpers
// =============================================================================

function createMockEntity(
  overrides: Partial<CollectionEntity> = {},
): CollectionEntity {
  return {
    name: "Product",
    typeName: "Product",
    keyField: "id",
    keyFieldType: "string",
    listQuery: {
      operationName: "listProducts",
      queryKey: ["products"],
    },
    mutations: [],
    ...overrides,
  };
}

// =============================================================================
// needsPredicateTranslation Tests
// =============================================================================

describe("needsPredicateTranslation", () => {
  it("returns true when syncMode is on-demand", () => {
    const entity = createMockEntity({ syncMode: "on-demand" });
    expect(needsPredicateTranslation(entity)).toBe(true);
  });

  it("returns false when syncMode is full", () => {
    const entity = createMockEntity({ syncMode: "full" });
    expect(needsPredicateTranslation(entity)).toBe(false);
  });

  it("returns false when syncMode is undefined", () => {
    const entity = createMockEntity({ syncMode: undefined });
    expect(needsPredicateTranslation(entity)).toBe(false);
  });
});

// =============================================================================
// OpenAPI Translator Tests
// =============================================================================

describe("generatePredicateTranslator - OpenAPI", () => {
  describe("rest-simple preset", () => {
    it("generates rest-simple translator with default params", () => {
      const entity = createMockEntity({
        syncMode: "on-demand",
        predicateMapping: "rest-simple",
      });

      const result = generatePredicateTranslator(
        entity,
        "ListProductsParams",
        "openapi",
      );

      expect(result).toContain("function translateProductPredicates");
      expect(result).toContain("options?: LoadSubsetOptions");
      expect(result).toContain("Partial<ListProductsParams>");
      expect(result).toContain("parseLoadSubsetOptions(options)");

      // Check filter operators
      expect(result).toContain('case "eq":');
      expect(result).toContain("params[fieldName] = filter.value");
      expect(result).toContain('case "lt":');
      expect(result).toContain("fieldName}_lt");
      expect(result).toContain('case "lte":');
      expect(result).toContain("fieldName}_lte");
      expect(result).toContain('case "gt":');
      expect(result).toContain("fieldName}_gt");
      expect(result).toContain('case "gte":');
      expect(result).toContain("fieldName}_gte");
      expect(result).toContain('case "in":');
      expect(result).toContain("fieldName}_in");

      // Check sorting (default "sort" param)
      expect(result).toContain('params["sort"]');
      expect(result).toContain('s.direction === "desc" ? "-" : ""');

      // Check pagination (default "limit"/"offset" params)
      expect(result).toContain('params["limit"]');
      expect(result).toContain('params["offset"]');
    });

    it("uses custom sort/pagination params from capabilities", () => {
      const entity = createMockEntity({
        syncMode: "on-demand",
        predicateMapping: "rest-simple",
        sortCapabilities: {
          hasSorting: true,
          sortParam: "order_by",
        },
        paginationCapabilities: {
          style: "offset",
          limitParam: "per_page",
          offsetParam: "start",
        },
      });

      const result = generatePredicateTranslator(
        entity,
        "ListProductsParams",
        "openapi",
      );

      expect(result).toContain('params["order_by"]');
      expect(result).toContain('params["per_page"]');
      expect(result).toContain('params["start"]');
    });

    it("handles missing paramsTypeName with Record type", () => {
      const entity = createMockEntity({
        syncMode: "on-demand",
        predicateMapping: "rest-simple",
      });

      const result = generatePredicateTranslator(entity, undefined, "openapi");

      expect(result).toContain("Record<string, unknown>");
      expect(result).not.toContain("Partial<");
    });
  });

  describe("jsonapi preset", () => {
    it("generates JSON:API translator", () => {
      const entity = createMockEntity({
        syncMode: "on-demand",
        predicateMapping: "jsonapi",
      });

      const result = generatePredicateTranslator(
        entity,
        "ListProductsParams",
        "openapi",
      );

      expect(result).toContain("function translateProductPredicates");
      expect(result).toContain("JSON:API query parameters");

      // Check filter operators with JSON:API format
      expect(result).toContain('case "eq":');
      expect(result).toContain("filter[");
      expect(result).toContain("fieldName}]");
      expect(result).toContain('case "lt":');
      expect(result).toContain("fieldName}][lt]");
      expect(result).toContain('case "lte":');
      expect(result).toContain("fieldName}][lte]");
      expect(result).toContain('case "gt":');
      expect(result).toContain("fieldName}][gt]");
      expect(result).toContain('case "gte":');
      expect(result).toContain("fieldName}][gte]");
      expect(result).toContain('case "in":');
      expect(result).toContain("fieldName}][in]");

      // Check sorting (JSON:API style)
      expect(result).toContain('params["sort"]');

      // Check pagination (JSON:API style page[limit]/page[offset])
      expect(result).toContain('params["page[limit]"]');
      expect(result).toContain('params["page[offset]"]');
    });

    it("uses custom pagination params when provided", () => {
      const entity = createMockEntity({
        syncMode: "on-demand",
        predicateMapping: "jsonapi",
        paginationCapabilities: {
          style: "offset",
          limitParam: "page[size]",
          offsetParam: "page[number]",
        },
      });

      const result = generatePredicateTranslator(entity, undefined, "openapi");

      expect(result).toContain('params["page[size]"]');
      expect(result).toContain('params["page[number]"]');
    });
  });

  describe("auto-detection from capabilities", () => {
    it("uses filterStyle from capabilities when predicateMapping not set", () => {
      const entity = createMockEntity({
        syncMode: "on-demand",
        filterCapabilities: {
          hasFiltering: true,
          filterStyle: "jsonapi",
          filterParams: ["filter[id]", "filter[name]"],
        },
      });

      const result = generatePredicateTranslator(entity, undefined, "openapi");

      // Should use JSON:API style based on filterCapabilities.filterStyle
      expect(result).toContain("filter[");
    });

    it("falls back to rest-simple when filterStyle is custom", () => {
      const entity = createMockEntity({
        syncMode: "on-demand",
        filterCapabilities: {
          hasFiltering: true,
          filterStyle: "custom",
          filterParams: ["id"],
        },
      });

      const result = generatePredicateTranslator(entity, undefined, "openapi");

      // Should use rest-simple (default) for custom filterStyle
      expect(result).toContain("params[fieldName] = filter.value");
      expect(result).not.toContain("`filter[");
    });
  });
});

// =============================================================================
// GraphQL Translator Tests
// =============================================================================

describe("generatePredicateTranslator - GraphQL", () => {
  describe("hasura preset", () => {
    it("generates Hasura-style translator", () => {
      const entity = createMockEntity({
        name: "User",
        typeName: "User",
        syncMode: "on-demand",
        predicateMapping: "hasura",
      });

      const result = generatePredicateTranslator(
        entity,
        "GetUsersQueryVariables",
        "graphql",
      );

      expect(result).toContain("function translateUserPredicates");
      expect(result).toContain("Hasura GraphQL variables");
      expect(result).toContain("Partial<GetUsersQueryVariables>");

      // Check Hasura-style operators
      expect(result).toContain('case "eq":');
      expect(result).toContain("{ _eq: filter.value }");
      expect(result).toContain('case "lt":');
      expect(result).toContain("{ _lt: filter.value }");
      expect(result).toContain('case "lte":');
      expect(result).toContain("{ _lte: filter.value }");
      expect(result).toContain('case "gt":');
      expect(result).toContain("{ _gt: filter.value }");
      expect(result).toContain('case "gte":');
      expect(result).toContain("{ _gte: filter.value }");
      expect(result).toContain('case "in":');
      expect(result).toContain("{ _in: filter.value }");

      // Check where clause building
      expect(result).toContain("variables.where = whereConditions[0]");
      expect(result).toContain("variables.where = { _and: whereConditions }");

      // Check order_by
      expect(result).toContain("variables.order_by");

      // Check buildNestedObject helper
      expect(result).toContain("function buildNestedObject");
      expect(result).toContain("path: string[]");

      // Check pagination (default "limit"/"offset" for Hasura)
      expect(result).toContain('variables["limit"]');
      expect(result).toContain('variables["offset"]');
    });

    it("uses custom pagination params when provided", () => {
      const entity = createMockEntity({
        name: "User",
        typeName: "User",
        syncMode: "on-demand",
        predicateMapping: "hasura",
        paginationCapabilities: {
          style: "offset",
          limitParam: "first",
          offsetParam: "skip",
        },
      });

      const result = generatePredicateTranslator(entity, undefined, "graphql");

      expect(result).toContain('variables["first"]');
      expect(result).toContain('variables["skip"]');
    });
  });

  describe("prisma preset", () => {
    it("generates Prisma-style translator", () => {
      const entity = createMockEntity({
        name: "Post",
        typeName: "Post",
        syncMode: "on-demand",
        predicateMapping: "prisma",
      });

      const result = generatePredicateTranslator(
        entity,
        "FindManyPostQueryVariables",
        "graphql",
      );

      expect(result).toContain("function translatePostPredicates");
      expect(result).toContain("Prisma GraphQL variables");
      expect(result).toContain("Partial<FindManyPostQueryVariables>");

      // Check Prisma-style operators
      expect(result).toContain('case "eq":');
      expect(result).toContain("{ equals: filter.value }");
      expect(result).toContain('case "lt":');
      expect(result).toContain("{ lt: filter.value }");
      expect(result).toContain('case "lte":');
      expect(result).toContain("{ lte: filter.value }");
      expect(result).toContain('case "gt":');
      expect(result).toContain("{ gt: filter.value }");
      expect(result).toContain('case "gte":');
      expect(result).toContain("{ gte: filter.value }");
      expect(result).toContain('case "in":');
      expect(result).toContain("{ in: filter.value }");

      // Check where clause building
      expect(result).toContain("variables.where = whereConditions[0]");
      expect(result).toContain("variables.where = { AND: whereConditions }");

      // Check orderBy (Prisma style)
      expect(result).toContain("variables.orderBy");

      // Check pagination (default "take"/"skip" for Prisma)
      expect(result).toContain('variables["take"]');
      expect(result).toContain('variables["skip"]');
    });

    it("uses custom pagination params when provided", () => {
      const entity = createMockEntity({
        name: "Post",
        typeName: "Post",
        syncMode: "on-demand",
        predicateMapping: "prisma",
        paginationCapabilities: {
          style: "offset",
          limitParam: "limit",
          offsetParam: "offset",
        },
      });

      const result = generatePredicateTranslator(entity, undefined, "graphql");

      expect(result).toContain('variables["limit"]');
      expect(result).toContain('variables["offset"]');
    });
  });

  describe("auto-detection from capabilities", () => {
    it("uses filterStyle from capabilities when predicateMapping not set", () => {
      const entity = createMockEntity({
        name: "User",
        typeName: "User",
        syncMode: "on-demand",
        filterCapabilities: {
          hasFiltering: true,
          filterStyle: "prisma",
          filterInputType: "UserWhereInput",
        },
      });

      const result = generatePredicateTranslator(entity, undefined, "graphql");

      // Should use Prisma style based on filterCapabilities.filterStyle
      expect(result).toContain("{ equals: filter.value }");
      expect(result).toContain("{ AND: whereConditions }");
    });

    it("falls back to hasura when filterStyle is rest-simple", () => {
      // GraphQL with OpenAPI preset should fall back to hasura
      const entity = createMockEntity({
        name: "User",
        typeName: "User",
        syncMode: "on-demand",
        predicateMapping: "rest-simple",
      });

      const result = generatePredicateTranslator(entity, undefined, "graphql");

      // Should use Hasura style (GraphQL default)
      expect(result).toContain("{ _eq: filter.value }");
    });
  });
});

// =============================================================================
// Edge Cases and Special Scenarios
// =============================================================================

describe("generatePredicateTranslator - edge cases", () => {
  it("handles entity names that need camelCase conversion", () => {
    const entity = createMockEntity({
      name: "ProductCategory",
      typeName: "ProductCategory",
      syncMode: "on-demand",
      predicateMapping: "rest-simple",
    });

    const result = generatePredicateTranslator(entity, undefined, "openapi");

    expect(result).toContain("function translateProductCategoryPredicates");
    expect(result).toContain("ProductCategory query parameters");
  });

  it("generates valid TypeScript with proper escaping", () => {
    const entity = createMockEntity({
      syncMode: "on-demand",
      predicateMapping: "rest-simple",
    });

    const result = generatePredicateTranslator(entity, "Params", "openapi");

    // Check template literal escaping - the generated code should have escaped backticks
    expect(result).toContain("fieldName}_lt");
  });

  it("handles empty options gracefully", () => {
    const entity = createMockEntity({
      syncMode: "on-demand",
      predicateMapping: "rest-simple",
    });

    const result = generatePredicateTranslator(entity, undefined, "openapi");

    expect(result).toContain("if (!options) return {}");
  });

  it("silently ignores unsupported operators", () => {
    const entity = createMockEntity({
      syncMode: "on-demand",
      predicateMapping: "rest-simple",
    });

    const result = generatePredicateTranslator(entity, undefined, "openapi");

    // Should have comment about ignoring unsupported operators
    expect(result).toContain("Silently ignore unsupported operators");
  });
});

// =============================================================================
// Generated Code Structure Tests
// =============================================================================

describe("generatePredicateTranslator - code structure", () => {
  it("generates well-documented code with JSDoc comments", () => {
    const entity = createMockEntity({
      syncMode: "on-demand",
      predicateMapping: "rest-simple",
    });

    const result = generatePredicateTranslator(entity, undefined, "openapi");

    expect(result).toContain("/**");
    expect(result).toContain("* Translate TanStack DB predicates");
    expect(result).toContain("*/");
  });

  it("uses tabs for indentation", () => {
    const entity = createMockEntity({
      syncMode: "on-demand",
      predicateMapping: "rest-simple",
    });

    const result = generatePredicateTranslator(entity, undefined, "openapi");

    // Should use 2-space indentation (code-block-writer standard)
    expect(result).toContain("  if (!options) return {}");
    expect(result).toContain(
      "  const parsed = parseLoadSubsetOptions(options)",
    );
  });

  it("includes buildNestedObject helper for GraphQL presets", () => {
    const entity = createMockEntity({
      name: "User",
      typeName: "User",
      syncMode: "on-demand",
      predicateMapping: "hasura",
    });

    const result = generatePredicateTranslator(entity, undefined, "graphql");

    expect(result).toContain("function buildNestedObject");
    expect(result).toContain("path: string[]");
    expect(result).toContain("value: unknown");
    expect(result).toContain("Record<string, unknown>");
  });

  it("does not include buildNestedObject for OpenAPI presets", () => {
    const entity = createMockEntity({
      syncMode: "on-demand",
      predicateMapping: "rest-simple",
    });

    const result = generatePredicateTranslator(entity, undefined, "openapi");

    expect(result).not.toContain("function buildNestedObject");
  });
});
