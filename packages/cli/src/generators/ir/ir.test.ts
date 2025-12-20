/**
 * IR (Intermediate Representation) tests
 *
 * Tests for IR types, type guards, and utilities
 */

import { describe, expect, it } from "vitest";

import {
  getSafePropertyName,
  isValidIdentifier,
  toCamelCase,
  toFragmentSchemaName,
  toFragmentTypeName,
  toMutationResponseSchemaName,
  toMutationResponseTypeName,
  toMutationVariablesSchemaName,
  toMutationVariablesTypeName,
  toPascalCase,
  toQueryResponseSchemaName,
  toQueryResponseTypeName,
  toQueryVariablesSchemaName,
  toQueryVariablesTypeName,
  toSchemaName,
} from "@/utils/naming";
import {
  isArraySchema,
  isEnumSchema,
  isIntersectionSchema,
  isLiteralSchema,
  isNumberSchema,
  isObjectSchema,
  isRawSchema,
  isRecordSchema,
  isRefSchema,
  isStringSchema,
  isUnionSchema,
} from "./types";
import {
  createNamedSchema,
  extractDependencies,
  topologicalSortSchemas,
} from "./utils";

import type { NamedSchemaIR, SchemaIR } from "./types";

// ============================================================================
// Type Guards Tests
// ============================================================================

describe("IR Type Guards", () => {
  describe("isStringSchema", () => {
    it("returns true for string schema", () => {
      expect(isStringSchema({ kind: "string" })).toBe(true);
      expect(isStringSchema({ kind: "string", format: "email" })).toBe(true);
    });

    it("returns false for non-string schema", () => {
      expect(isStringSchema({ kind: "number" })).toBe(false);
      expect(isStringSchema({ kind: "boolean" })).toBe(false);
    });
  });

  describe("isNumberSchema", () => {
    it("returns true for number schema", () => {
      expect(isNumberSchema({ kind: "number" })).toBe(true);
      expect(isNumberSchema({ kind: "number", integer: true })).toBe(true);
    });

    it("returns false for non-number schema", () => {
      expect(isNumberSchema({ kind: "string" })).toBe(false);
    });
  });

  describe("isObjectSchema", () => {
    it("returns true for object schema", () => {
      expect(isObjectSchema({ kind: "object", properties: {} })).toBe(true);
    });

    it("returns false for non-object schema", () => {
      expect(isObjectSchema({ kind: "string" })).toBe(false);
    });
  });

  describe("isArraySchema", () => {
    it("returns true for array schema", () => {
      expect(isArraySchema({ kind: "array", items: { kind: "string" } })).toBe(
        true,
      );
    });

    it("returns false for non-array schema", () => {
      expect(isArraySchema({ kind: "string" })).toBe(false);
    });
  });

  describe("isEnumSchema", () => {
    it("returns true for enum schema", () => {
      expect(isEnumSchema({ kind: "enum", values: ["a", "b"] })).toBe(true);
    });

    it("returns false for non-enum schema", () => {
      expect(isEnumSchema({ kind: "string" })).toBe(false);
    });
  });

  describe("isUnionSchema", () => {
    it("returns true for union schema", () => {
      expect(
        isUnionSchema({
          kind: "union",
          members: [{ kind: "string" }, { kind: "number" }],
        }),
      ).toBe(true);
    });

    it("returns false for non-union schema", () => {
      expect(isUnionSchema({ kind: "string" })).toBe(false);
    });
  });

  describe("isRefSchema", () => {
    it("returns true for ref schema", () => {
      expect(isRefSchema({ kind: "ref", name: "Pet" })).toBe(true);
    });

    it("returns false for non-ref schema", () => {
      expect(isRefSchema({ kind: "string" })).toBe(false);
    });
  });

  describe("isRawSchema", () => {
    it("returns true for raw schema", () => {
      expect(isRawSchema({ kind: "raw", code: "z.custom()" })).toBe(true);
    });

    it("returns false for non-raw schema", () => {
      expect(isRawSchema({ kind: "string" })).toBe(false);
    });
  });

  describe("isLiteralSchema", () => {
    it("returns true for literal schema", () => {
      expect(isLiteralSchema({ kind: "literal", value: "active" })).toBe(true);
      expect(isLiteralSchema({ kind: "literal", value: 42 })).toBe(true);
      expect(isLiteralSchema({ kind: "literal", value: true })).toBe(true);
    });

    it("returns false for non-literal schema", () => {
      expect(isLiteralSchema({ kind: "string" })).toBe(false);
    });
  });

  describe("isRecordSchema", () => {
    it("returns true for record schema", () => {
      expect(
        isRecordSchema({
          kind: "record",
          keyType: { kind: "string" },
          valueType: { kind: "string" },
        }),
      ).toBe(true);
    });

    it("returns false for non-record schema", () => {
      expect(isRecordSchema({ kind: "string" })).toBe(false);
    });
  });

  describe("isIntersectionSchema", () => {
    it("returns true for intersection schema", () => {
      expect(
        isIntersectionSchema({
          kind: "intersection",
          members: [
            { kind: "object", properties: {} },
            { kind: "object", properties: {} },
          ],
        }),
      ).toBe(true);
    });

    it("returns false for non-intersection schema", () => {
      expect(isIntersectionSchema({ kind: "string" })).toBe(false);
    });
  });
});

// ============================================================================
// Utility Functions Tests
// ============================================================================

describe("IR Utilities", () => {
  describe("toPascalCase", () => {
    it("converts snake_case to PascalCase", () => {
      expect(toPascalCase("create_user")).toBe("CreateUser");
      expect(toPascalCase("get_all_pets")).toBe("GetAllPets");
    });

    it("converts kebab-case to PascalCase", () => {
      expect(toPascalCase("create-user")).toBe("CreateUser");
      expect(toPascalCase("get-all-pets")).toBe("GetAllPets");
    });

    it("handles already PascalCase", () => {
      expect(toPascalCase("CreateUser")).toBe("CreateUser");
    });

    it("handles camelCase", () => {
      expect(toPascalCase("createUser")).toBe("CreateUser");
    });
  });

  describe("toCamelCase", () => {
    it("converts PascalCase to camelCase", () => {
      expect(toCamelCase("CreateUser")).toBe("createUser");
      expect(toCamelCase("GetAllPets")).toBe("getAllPets");
    });

    it("converts snake_case to camelCase", () => {
      expect(toCamelCase("create_user")).toBe("createUser");
    });

    it("converts kebab-case to camelCase", () => {
      expect(toCamelCase("create-user")).toBe("createUser");
    });
  });

  describe("toSchemaName", () => {
    it("converts type name to schema variable name", () => {
      expect(toSchemaName("Pet")).toBe("petSchema");
      expect(toSchemaName("CreateUserRequest")).toBe("createUserRequestSchema");
    });
  });

  describe("isValidIdentifier", () => {
    it("returns true for valid identifiers", () => {
      expect(isValidIdentifier("name")).toBe(true);
      expect(isValidIdentifier("_private")).toBe(true);
      expect(isValidIdentifier("$var")).toBe(true);
      expect(isValidIdentifier("camelCase")).toBe(true);
    });

    it("returns false for invalid identifiers", () => {
      expect(isValidIdentifier("123start")).toBe(false);
      expect(isValidIdentifier("has-hyphen")).toBe(false);
      expect(isValidIdentifier("has space")).toBe(false);
      expect(isValidIdentifier("@special")).toBe(false);
    });
  });

  describe("getSafePropertyName", () => {
    it("returns unquoted name for valid identifiers", () => {
      expect(getSafePropertyName("name")).toBe("name");
      expect(getSafePropertyName("userId")).toBe("userId");
    });

    it("returns quoted name for invalid identifiers", () => {
      expect(getSafePropertyName("has-hyphen")).toBe('"has-hyphen"');
      expect(getSafePropertyName("123start")).toBe('"123start"');
      expect(getSafePropertyName("@type")).toBe('"@type"');
    });
  });

  describe("GraphQL naming utilities", () => {
    it("generates query variables schema names", () => {
      expect(toQueryVariablesSchemaName("GetPets")).toBe(
        "getPetsQueryVariablesSchema",
      );
    });

    it("generates mutation variables schema names", () => {
      expect(toMutationVariablesSchemaName("CreatePet")).toBe(
        "createPetMutationVariablesSchema",
      );
    });

    it("generates query response schema names", () => {
      expect(toQueryResponseSchemaName("GetPets")).toBe("getPetsQuerySchema");
    });

    it("generates mutation response schema names", () => {
      expect(toMutationResponseSchemaName("CreatePet")).toBe(
        "createPetMutationSchema",
      );
    });

    it("generates fragment schema names", () => {
      expect(toFragmentSchemaName("PetFields")).toBe("petFieldsFragmentSchema");
    });

    it("generates query variables type names", () => {
      expect(toQueryVariablesTypeName("GetPets")).toBe("GetPetsQueryVariables");
    });

    it("generates mutation variables type names", () => {
      expect(toMutationVariablesTypeName("CreatePet")).toBe(
        "CreatePetMutationVariables",
      );
    });

    it("generates query response type names", () => {
      expect(toQueryResponseTypeName("GetPets")).toBe("GetPetsQuery");
    });

    it("generates mutation response type names", () => {
      expect(toMutationResponseTypeName("CreatePet")).toBe("CreatePetMutation");
    });

    it("generates fragment type names", () => {
      expect(toFragmentTypeName("PetFields")).toBe("PetFieldsFragment");
    });
  });

  describe("extractDependencies", () => {
    it("extracts ref dependencies from schema", () => {
      const schema: SchemaIR = {
        kind: "object",
        properties: {
          status: { schema: { kind: "ref", name: "Status" }, required: true },
          category: {
            schema: { kind: "ref", name: "Category" },
            required: false,
          },
        },
      };
      const deps = extractDependencies(schema);
      expect(deps.has("Status")).toBe(true);
      expect(deps.has("Category")).toBe(true);
    });

    it("extracts dependencies from nested arrays", () => {
      const schema: SchemaIR = {
        kind: "array",
        items: { kind: "ref", name: "Pet" },
      };
      const deps = extractDependencies(schema);
      expect(deps.has("Pet")).toBe(true);
    });

    it("extracts dependencies from unions", () => {
      const schema: SchemaIR = {
        kind: "union",
        members: [
          { kind: "ref", name: "Dog" },
          { kind: "ref", name: "Cat" },
        ],
      };
      const deps = extractDependencies(schema);
      expect(deps.has("Dog")).toBe(true);
      expect(deps.has("Cat")).toBe(true);
    });

    it("returns empty set for primitive schemas", () => {
      expect(extractDependencies({ kind: "string" }).size).toBe(0);
      expect(extractDependencies({ kind: "number" }).size).toBe(0);
      expect(extractDependencies({ kind: "boolean" }).size).toBe(0);
    });
  });

  describe("createNamedSchema", () => {
    it("creates a named schema with dependencies", () => {
      const schema: SchemaIR = {
        kind: "object",
        properties: {
          status: { schema: { kind: "ref", name: "Status" }, required: true },
        },
      };
      const named = createNamedSchema("Pet", schema, "component");
      expect(named.name).toBe("Pet");
      expect(named.schema).toBe(schema);
      expect(named.category).toBe("component");
      expect(named.dependencies.has("Status")).toBe(true);
    });
  });

  describe("topologicalSortSchemas", () => {
    it("sorts schemas so dependencies come first", () => {
      const schemas: NamedSchemaIR[] = [
        {
          name: "Pet",
          schema: {
            kind: "object",
            properties: {
              status: {
                schema: { kind: "ref", name: "Status" },
                required: true,
              },
            },
          },
          dependencies: new Set(["Status"]),
          category: "component",
        },
        {
          name: "Status",
          schema: { kind: "enum", values: ["active", "inactive"] },
          dependencies: new Set(),
          category: "enum",
        },
      ];

      const sorted = topologicalSortSchemas(schemas);
      const statusIndex = sorted.findIndex((s) => s.name === "Status");
      const petIndex = sorted.findIndex((s) => s.name === "Pet");

      expect(statusIndex).toBeLessThan(petIndex);
    });

    it("handles schemas with no dependencies", () => {
      const schemas: NamedSchemaIR[] = [
        {
          name: "Name",
          schema: { kind: "string" },
          dependencies: new Set(),
          category: "component",
        },
        {
          name: "Age",
          schema: { kind: "number" },
          dependencies: new Set(),
          category: "component",
        },
      ];

      const sorted = topologicalSortSchemas(schemas);
      expect(sorted).toHaveLength(2);
    });

    it("handles circular dependencies gracefully", () => {
      const schemas: NamedSchemaIR[] = [
        {
          name: "A",
          schema: { kind: "ref", name: "B" },
          dependencies: new Set(["B"]),
          category: "component",
        },
        {
          name: "B",
          schema: { kind: "ref", name: "A" },
          dependencies: new Set(["A"]),
          category: "component",
        },
      ];

      // Should not throw and should return all schemas
      const sorted = topologicalSortSchemas(schemas);
      expect(sorted).toHaveLength(2);
    });
  });
});
