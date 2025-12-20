/**
 * Emitter tests
 *
 * Tests for all validator emitters (Zod, Valibot, ArkType, Effect)
 */

import { describe, expect, it } from "vitest";

import { arktypeEmitter } from "./arktype";
import { effectEmitter } from "./effect";
import { getEmitter, isValidatorLibrary, supportedValidators } from "./index";
import { valibotEmitter } from "./valibot";
import { zodEmitter } from "./zod";

import type { NamedSchemaIR, SchemaIR } from "../ir/types";

// ============================================================================
// Helper Functions
// ============================================================================

function createNamedSchema(
  name: string,
  schema: SchemaIR,
  category: NamedSchemaIR["category"] = "component",
): NamedSchemaIR {
  return { name, schema, category, dependencies: new Set() };
}

// ============================================================================
// Emitter Registry Tests
// ============================================================================

describe("Emitter Registry", () => {
  describe("getEmitter", () => {
    it("returns the Zod emitter for 'zod'", () => {
      const emitter = getEmitter("zod");
      expect(emitter.library).toBe("zod");
    });

    it("returns the Valibot emitter for 'valibot'", () => {
      const emitter = getEmitter("valibot");
      expect(emitter.library).toBe("valibot");
    });

    it("returns the ArkType emitter for 'arktype'", () => {
      const emitter = getEmitter("arktype");
      expect(emitter.library).toBe("arktype");
    });

    it("returns the Effect emitter for 'effect'", () => {
      const emitter = getEmitter("effect");
      expect(emitter.library).toBe("effect");
    });

    it("throws for unknown library", () => {
      expect(() => getEmitter("unknown" as never)).toThrow(
        "Unknown validator library",
      );
    });
  });

  describe("isValidatorLibrary", () => {
    it("returns true for valid libraries", () => {
      expect(isValidatorLibrary("zod")).toBe(true);
      expect(isValidatorLibrary("valibot")).toBe(true);
      expect(isValidatorLibrary("arktype")).toBe(true);
      expect(isValidatorLibrary("effect")).toBe(true);
    });

    it("returns false for invalid libraries", () => {
      expect(isValidatorLibrary("unknown")).toBe(false);
      expect(isValidatorLibrary("")).toBe(false);
    });
  });

  describe("supportedValidators", () => {
    it("contains all four validators", () => {
      expect(supportedValidators).toContain("zod");
      expect(supportedValidators).toContain("valibot");
      expect(supportedValidators).toContain("arktype");
      expect(supportedValidators).toContain("effect");
      expect(supportedValidators).toHaveLength(4);
    });
  });
});

// ============================================================================
// Zod Emitter Tests
// ============================================================================

describe("Zod Emitter", () => {
  describe("getImportStatement", () => {
    it("returns correct Zod import", () => {
      expect(zodEmitter.getImportStatement()).toBe('import * as z from "zod"');
    });
  });

  describe("getTypeInference", () => {
    it("returns correct type inference", () => {
      expect(zodEmitter.getTypeInference("petSchema", "Pet")).toBe(
        "export type Pet = z.infer<typeof petSchema>",
      );
    });
  });

  describe("emit", () => {
    it("emits string schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Name", { kind: "string" }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain("z.string()");
      expect(result.content).toContain("export const nameSchema");
      expect(result.content).toContain("export type Name");
    });

    it("emits string with email format", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Email", { kind: "string", format: "email" }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain("z.email()");
    });

    it("emits string with datetime format", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("DateTime", { kind: "string", format: "datetime" }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain("z.iso.datetime()");
    });

    it("emits number schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Age", { kind: "number" }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain("z.number()");
    });

    it("emits integer schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Count", { kind: "number", integer: true }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain("z.number().int()");
    });

    it("emits boolean schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Active", { kind: "boolean" }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain("z.boolean()");
    });

    it("emits enum schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Status", {
          kind: "enum",
          values: ["active", "inactive"],
        }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain('z.enum(["active", "inactive"])');
    });

    it("emits array schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Tags", {
          kind: "array",
          items: { kind: "string" },
        }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain("z.array(z.string())");
    });

    it("emits object schema with required and optional fields", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("User", {
          kind: "object",
          properties: {
            id: { schema: { kind: "string" }, required: true },
            name: { schema: { kind: "string" }, required: true },
            email: { schema: { kind: "string" }, required: false },
          },
        }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain("z.object({");
      expect(result.content).toContain("id: z.string()");
      expect(result.content).toContain("name: z.string()");
      expect(result.content).toContain("email: z.string().nullish()");
    });

    it("emits union schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("StringOrNumber", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "number" }],
        }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain("z.union([z.string(), z.number()])");
    });

    it("emits ref schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Status", { kind: "enum", values: ["a", "b"] }),
        createNamedSchema("Item", {
          kind: "object",
          properties: {
            status: { schema: { kind: "ref", name: "Status" }, required: true },
          },
        }),
      ];
      const result = zodEmitter.emit(schemas);

      expect(result.content).toContain("status: statusSchema");
    });
  });
});

// ============================================================================
// Valibot Emitter Tests
// ============================================================================

describe("Valibot Emitter", () => {
  describe("getImportStatement", () => {
    it("returns correct Valibot import", () => {
      expect(valibotEmitter.getImportStatement()).toBe(
        'import * as v from "valibot"',
      );
    });
  });

  describe("getTypeInference", () => {
    it("returns correct type inference", () => {
      expect(valibotEmitter.getTypeInference("petSchema", "Pet")).toBe(
        "export type Pet = v.InferOutput<typeof petSchema>",
      );
    });
  });

  describe("emit", () => {
    it("emits string schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Name", { kind: "string" }),
      ];
      const result = valibotEmitter.emit(schemas);

      expect(result.content).toContain("v.string()");
    });

    it("emits string with email format using pipe", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Email", { kind: "string", format: "email" }),
      ];
      const result = valibotEmitter.emit(schemas);

      expect(result.content).toContain("v.pipe(v.string(), v.email())");
    });

    it("emits number schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Age", { kind: "number" }),
      ];
      const result = valibotEmitter.emit(schemas);

      expect(result.content).toContain("v.number()");
    });

    it("emits integer schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Count", { kind: "number", integer: true }),
      ];
      const result = valibotEmitter.emit(schemas);

      expect(result.content).toContain("v.pipe(v.number(), v.integer())");
    });

    it("emits enum schema using picklist", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Status", {
          kind: "enum",
          values: ["active", "inactive"],
        }),
      ];
      const result = valibotEmitter.emit(schemas);

      expect(result.content).toContain('v.picklist(["active", "inactive"])');
    });

    it("emits array schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Tags", {
          kind: "array",
          items: { kind: "string" },
        }),
      ];
      const result = valibotEmitter.emit(schemas);

      expect(result.content).toContain("v.array(v.string())");
    });

    it("emits object schema with required and optional fields", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("User", {
          kind: "object",
          properties: {
            id: { schema: { kind: "string" }, required: true },
            email: { schema: { kind: "string" }, required: false },
          },
        }),
      ];
      const result = valibotEmitter.emit(schemas);

      expect(result.content).toContain("v.object({");
      expect(result.content).toContain("id: v.string()");
      expect(result.content).toContain("v.nullish(v.string())");
    });

    it("emits union schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("StringOrNumber", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "number" }],
        }),
      ];
      const result = valibotEmitter.emit(schemas);

      expect(result.content).toContain("v.union([v.string(), v.number()])");
    });
  });
});

// ============================================================================
// ArkType Emitter Tests
// ============================================================================

describe("ArkType Emitter", () => {
  describe("getImportStatement", () => {
    it("returns correct ArkType import", () => {
      expect(arktypeEmitter.getImportStatement()).toBe(
        'import { type } from "arktype"',
      );
    });
  });

  describe("getTypeInference", () => {
    it("returns correct type inference", () => {
      expect(arktypeEmitter.getTypeInference("petSchema", "Pet")).toBe(
        "export type Pet = typeof petSchema.infer",
      );
    });
  });

  describe("emit", () => {
    it("emits string schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Name", { kind: "string" }),
      ];
      const result = arktypeEmitter.emit(schemas);

      expect(result.content).toContain('type("string")');
    });

    it("emits string with email format", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Email", { kind: "string", format: "email" }),
      ];
      const result = arktypeEmitter.emit(schemas);

      expect(result.content).toContain('type("string.email")');
    });

    it("emits number schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Age", { kind: "number" }),
      ];
      const result = arktypeEmitter.emit(schemas);

      expect(result.content).toContain('type("number")');
    });

    it("emits integer schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Count", { kind: "number", integer: true }),
      ];
      const result = arktypeEmitter.emit(schemas);

      expect(result.content).toContain('type("number.integer")');
    });

    it("emits enum schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Status", {
          kind: "enum",
          values: ["active", "inactive"],
        }),
      ];
      const result = arktypeEmitter.emit(schemas);

      // ArkType uses type.enumerated() for enums
      expect(result.content).toContain('type.enumerated("active", "inactive")');
    });

    it("emits array schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Tags", {
          kind: "array",
          items: { kind: "string" },
        }),
      ];
      const result = arktypeEmitter.emit(schemas);

      expect(result.content).toContain('type("string[]")');
    });

    it("emits object schema with required and optional fields", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("User", {
          kind: "object",
          properties: {
            id: { schema: { kind: "string" }, required: true },
            email: { schema: { kind: "string" }, required: false },
          },
        }),
      ];
      const result = arktypeEmitter.emit(schemas);

      expect(result.content).toContain("type({");
      // ArkType quotes all property names
      expect(result.content).toContain('"id": "string"');
      // Optional fields use "key?" syntax
      expect(result.content).toContain('"email?":');
    });

    it("emits union schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("StringOrNumber", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "number" }],
        }),
      ];
      const result = arktypeEmitter.emit(schemas);

      expect(result.content).toContain('type("string | number")');
    });
  });
});

// ============================================================================
// Effect Emitter Tests
// ============================================================================

describe("Effect Emitter", () => {
  describe("getImportStatement", () => {
    it("returns correct Effect import", () => {
      expect(effectEmitter.getImportStatement()).toBe(
        'import { Schema } from "effect"',
      );
    });
  });

  describe("getTypeInference", () => {
    it("returns correct type inference", () => {
      expect(effectEmitter.getTypeInference("petSchema", "Pet")).toBe(
        "export type Pet = typeof petSchema.Type",
      );
    });
  });

  describe("emit", () => {
    it("emits string schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Name", { kind: "string" }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain("Schema.String");
      expect(result.content).toContain("export const nameSchema");
      expect(result.content).toContain("export type Name");
    });

    it("emits string with email format using pattern", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Email", { kind: "string", format: "email" }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain("Schema.String.pipe(Schema.pattern(");
    });

    it("emits string with uuid format using built-in", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Id", { kind: "string", format: "uuid" }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain("Schema.UUID");
    });

    it("emits number schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Age", { kind: "number" }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain("Schema.Number");
    });

    it("emits integer schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Count", { kind: "number", integer: true }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain("Schema.Number.pipe(Schema.int())");
    });

    it("emits boolean schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Active", { kind: "boolean" }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain("Schema.Boolean");
    });

    it("emits enum schema using union of literals", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Status", {
          kind: "enum",
          values: ["active", "inactive"],
        }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain(
        'Schema.Union(Schema.Literal("active"), Schema.Literal("inactive"))',
      );
    });

    it("emits array schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Tags", {
          kind: "array",
          items: { kind: "string" },
        }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain("Schema.Array(Schema.String)");
    });

    it("emits object schema with required and optional fields", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("User", {
          kind: "object",
          properties: {
            id: { schema: { kind: "string" }, required: true },
            name: { schema: { kind: "string" }, required: true },
            email: { schema: { kind: "string" }, required: false },
          },
        }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain("Schema.Struct({");
      expect(result.content).toContain("id: Schema.String");
      expect(result.content).toContain("name: Schema.String");
      expect(result.content).toContain(
        "email: Schema.optional(Schema.NullOr(Schema.String))",
      );
    });

    it("emits union schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("StringOrNumber", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "number" }],
        }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain(
        "Schema.Union(Schema.String, Schema.Number)",
      );
    });

    it("emits nullable union as Schema.NullOr", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NullableString", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "null" }],
        }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain("Schema.NullOr(Schema.String)");
    });

    it("emits ref schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Status", { kind: "enum", values: ["a", "b"] }),
        createNamedSchema("Item", {
          kind: "object",
          properties: {
            status: { schema: { kind: "ref", name: "Status" }, required: true },
          },
        }),
      ];
      const result = effectEmitter.emit(schemas);

      expect(result.content).toContain("status: statusSchema");
    });
  });
});

// ============================================================================
// Additional Edge Case Tests for Coverage
// ============================================================================

describe("Emitter Edge Cases", () => {
  describe("Zod Emitter Edge Cases", () => {
    it("emits boolean schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Active", { kind: "boolean" }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.boolean()");
    });

    it("emits bigint schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("BigNumber", { kind: "bigint" }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.bigint()");
    });

    it("emits null schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NullValue", { kind: "null" }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.null()");
    });

    it("emits undefined schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("UndefinedValue", { kind: "undefined" }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.undefined()");
    });

    it("emits unknown schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("AnyValue", { kind: "unknown" }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.unknown()");
    });

    it("emits literal number schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("FortyTwo", { kind: "literal", value: 42 }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.literal(42)");
    });

    it("emits literal boolean schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("True", { kind: "literal", value: true }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.literal(true)");
    });

    it("emits tuple schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Point", {
          kind: "tuple",
          items: [{ kind: "number" }, { kind: "number" }],
        }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.tuple([z.number(), z.number()])");
    });

    it("emits record schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("StringMap", {
          kind: "record",
          keyType: { kind: "string" },
          valueType: { kind: "number" },
        }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.record(z.string(), z.number())");
    });

    it("emits object with passthrough", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Flexible", {
          kind: "object",
          properties: {
            id: { schema: { kind: "string" }, required: true },
          },
          additionalProperties: true,
        }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain(".passthrough()");
    });

    it("emits object with catchall", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("StringDict", {
          kind: "object",
          properties: {
            id: { schema: { kind: "string" }, required: true },
          },
          additionalProperties: { kind: "string" },
        }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain(".catchall(z.string())");
    });

    it("emits nullable union", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NullableString", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "null" }],
        }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain(".nullable()");
    });

    it("emits optional union as regular union", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("OptionalString", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "undefined" }],
        }),
      ];
      const result = zodEmitter.emit(schemas);
      // The optional detection filters only null, so undefined is still in nonNullMembers
      // This results in a regular union
      expect(result.content).toContain("z.union([");
    });

    it("emits nullish union as regular union (3 members)", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NullishString", {
          kind: "union",
          members: [
            { kind: "string" },
            { kind: "null" },
            { kind: "undefined" },
          ],
        }),
      ];
      const result = zodEmitter.emit(schemas);
      // The nullish detection requires exactly 1 non-null/undefined member
      // With current implementation, it emits as union
      expect(result.content).toContain("z.union([");
    });

    it("emits single-member union", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("SingleString", {
          kind: "union",
          members: [{ kind: "string" }],
        }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.string()");
    });

    it("emits intersection schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Combined", {
          kind: "intersection",
          members: [
            {
              kind: "object",
              properties: { a: { schema: { kind: "string" }, required: true } },
            },
            {
              kind: "object",
              properties: { b: { schema: { kind: "number" }, required: true } },
            },
          ],
        }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain(".and(");
    });

    it("emits single-member intersection", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Single", {
          kind: "intersection",
          members: [{ kind: "string" }],
        }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.string()");
    });

    it("emits empty intersection as unknown", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Empty", {
          kind: "intersection",
          members: [],
        }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.unknown()");
    });

    it("emits raw schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Custom", {
          kind: "raw",
          code: "z.custom<MyType>()",
        }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.content).toContain("z.custom<MyType>()");
    });

    it("emits string formats", () => {
      const formats = ["url", "uuid", "date", "time", "ipv4", "ipv6"] as const;
      for (const format of formats) {
        const schemas: NamedSchemaIR[] = [
          createNamedSchema("Test", { kind: "string", format }),
        ];
        const result = zodEmitter.emit(schemas);
        expect(result.content).toContain("z.");
      }
    });

    it("handles unknown schema kind with warning", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Unknown", { kind: "unknown-kind" as never }),
      ];
      const result = zodEmitter.emit(schemas);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("Valibot Emitter Edge Cases", () => {
    it("emits boolean schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Active", { kind: "boolean" }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.boolean()");
    });

    it("emits bigint schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("BigNumber", { kind: "bigint" }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.bigint()");
    });

    it("emits null schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NullValue", { kind: "null" }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.null()");
    });

    it("emits undefined schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("UndefinedValue", { kind: "undefined" }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.undefined()");
    });

    it("emits unknown schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("AnyValue", { kind: "unknown" }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.unknown()");
    });

    it("emits literal schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("FortyTwo", { kind: "literal", value: 42 }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.literal(42)");
    });

    it("emits tuple schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Point", {
          kind: "tuple",
          items: [{ kind: "number" }, { kind: "number" }],
        }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.tuple([");
    });

    it("emits record schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("StringMap", {
          kind: "record",
          keyType: { kind: "string" },
          valueType: { kind: "number" },
        }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.record(");
    });

    it("emits object with passthrough", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Flexible", {
          kind: "object",
          properties: {},
          additionalProperties: true,
        }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.looseObject");
    });

    it("emits nullable union", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NullableString", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "null" }],
        }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.nullable(");
    });

    it("emits optional union as union", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("OptionalString", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "undefined" }],
        }),
      ];
      const result = valibotEmitter.emit(schemas);
      // Valibot doesn't have special handling for optional, uses union
      expect(result.content).toContain("v.union([");
    });

    it("emits intersection schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Combined", {
          kind: "intersection",
          members: [
            { kind: "object", properties: {} },
            { kind: "object", properties: {} },
          ],
        }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.intersect(");
    });

    it("emits raw schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Custom", { kind: "raw", code: "v.custom()" }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.custom()");
    });

    it("emits string formats with pipe", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Url", { kind: "string", format: "url" }),
      ];
      const result = valibotEmitter.emit(schemas);
      expect(result.content).toContain("v.pipe(v.string(), v.url())");
    });
  });

  describe("ArkType Emitter Edge Cases", () => {
    it("emits boolean schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Active", { kind: "boolean" }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain('"boolean"');
    });

    it("emits bigint schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("BigNumber", { kind: "bigint" }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain('"bigint"');
    });

    it("emits null schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NullValue", { kind: "null" }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain('"null"');
    });

    it("emits undefined schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("UndefinedValue", { kind: "undefined" }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain('"undefined"');
    });

    it("emits unknown schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("AnyValue", { kind: "unknown" }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain('"unknown"');
    });

    it("emits literal string schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Active", { kind: "literal", value: "active" }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain("\"'active'\"");
    });

    it("emits literal number schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("FortyTwo", { kind: "literal", value: 42 }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain('"42"');
    });

    it("emits record schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("StringMap", {
          kind: "record",
          keyType: { kind: "string" },
          valueType: { kind: "number" },
        }),
      ];
      const result = arktypeEmitter.emit(schemas);
      // ArkType uses { "[string]": "number" } syntax for records
      expect(result.content).toContain('"[string]"');
    });

    it("emits nullable union", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NullableString", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "null" }],
        }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain("string | null");
    });

    it("emits intersection schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Combined", {
          kind: "intersection",
          members: [
            {
              kind: "object",
              properties: { a: { schema: { kind: "string" }, required: true } },
            },
            {
              kind: "object",
              properties: { b: { schema: { kind: "number" }, required: true } },
            },
          ],
        }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain(".and(");
    });

    it("emits raw schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Custom", { kind: "raw", code: "type.any" }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain("type.any");
    });

    it("emits string formats", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Url", { kind: "string", format: "url" }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain("string.url");
    });

    it("emits object with nested properties", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Nested", {
          kind: "object",
          properties: {
            inner: {
              schema: {
                kind: "object",
                properties: {
                  value: { schema: { kind: "string" }, required: true },
                },
              },
              required: true,
            },
          },
        }),
      ];
      const result = arktypeEmitter.emit(schemas);
      expect(result.content).toContain("type({");
    });
  });

  describe("Effect Emitter Edge Cases", () => {
    it("emits bigint schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("BigNumber", { kind: "bigint" }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.BigInt");
    });

    it("emits null schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NullValue", { kind: "null" }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.Null");
    });

    it("emits undefined schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("UndefinedValue", { kind: "undefined" }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.Undefined");
    });

    it("emits unknown schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("AnyValue", { kind: "unknown" }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.Unknown");
    });

    it("emits never schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NeverValue", { kind: "never" }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.Never");
    });

    it("emits date schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("DateValue", { kind: "date" }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.Date");
    });

    it("emits literal string schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Active", { kind: "literal", value: "active" }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain('Schema.Literal("active")');
    });

    it("emits literal number schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("FortyTwo", { kind: "literal", value: 42 }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.Literal(42)");
    });

    it("emits literal boolean schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("True", { kind: "literal", value: true }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.Literal(true)");
    });

    it("emits tuple schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Point", {
          kind: "tuple",
          items: [{ kind: "number" }, { kind: "number" }],
        }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain(
        "Schema.Tuple(Schema.Number, Schema.Number)",
      );
    });

    it("emits record schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("StringMap", {
          kind: "record",
          keyType: { kind: "string" },
          valueType: { kind: "number" },
        }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain(
        "Schema.Record({ key: Schema.String, value: Schema.Number })",
      );
    });

    it("emits optional union as Schema.UndefinedOr", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("OptionalString", {
          kind: "union",
          members: [{ kind: "string" }, { kind: "undefined" }],
        }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.UndefinedOr(Schema.String)");
    });

    it("emits nullish union as Schema.NullishOr", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("NullishString", {
          kind: "union",
          members: [
            { kind: "string" },
            { kind: "null" },
            { kind: "undefined" },
          ],
        }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.NullishOr(Schema.String)");
    });

    it("emits single-member union", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("SingleString", {
          kind: "union",
          members: [{ kind: "string" }],
        }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.String");
    });

    it("emits intersection schema using Schema.extend", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Combined", {
          kind: "intersection",
          members: [
            {
              kind: "object",
              properties: { a: { schema: { kind: "string" }, required: true } },
            },
            {
              kind: "object",
              properties: { b: { schema: { kind: "number" }, required: true } },
            },
          ],
        }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.extend(");
    });

    it("emits single-member intersection", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Single", {
          kind: "intersection",
          members: [{ kind: "string" }],
        }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.String");
    });

    it("emits empty intersection as unknown", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Empty", {
          kind: "intersection",
          members: [],
        }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.Unknown");
    });

    it("emits raw schema", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Custom", {
          kind: "raw",
          code: "Schema.suspend(() => mySchema)",
        }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.content).toContain("Schema.suspend(() => mySchema)");
    });

    it("emits string formats with patterns", () => {
      const formats = [
        "email",
        "url",
        "datetime",
        "date",
        "time",
        "ipv4",
        "ipv6",
      ] as const;
      for (const format of formats) {
        const schemas: NamedSchemaIR[] = [
          createNamedSchema("Test", { kind: "string", format }),
        ];
        const result = effectEmitter.emit(schemas);
        // All these formats use Schema.String.pipe(Schema.pattern(...))
        expect(result.content).toContain("Schema.String.pipe(Schema.pattern(");
      }
    });

    it("handles unknown schema kind with warning", () => {
      const schemas: NamedSchemaIR[] = [
        createNamedSchema("Unknown", { kind: "unknown-kind" as never }),
      ];
      const result = effectEmitter.emit(schemas);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Cross-Emitter Consistency Tests
// ============================================================================

describe("Cross-Emitter Consistency", () => {
  const testSchemas: NamedSchemaIR[] = [
    createNamedSchema("Status", {
      kind: "enum",
      values: ["active", "pending"],
    }),
    createNamedSchema("Pet", {
      kind: "object",
      properties: {
        id: { schema: { kind: "string" }, required: true },
        name: { schema: { kind: "string" }, required: true },
        status: { schema: { kind: "ref", name: "Status" }, required: true },
        age: { schema: { kind: "number", integer: true }, required: false },
      },
    }),
  ];

  it("all emitters produce valid output with no warnings for basic schema", () => {
    for (const validator of supportedValidators) {
      const emitter = getEmitter(validator);
      const result = emitter.emit(testSchemas);

      expect(result.content).toBeTruthy();
      expect(result.warnings).toHaveLength(0);
    }
  });

  it("all emitters include file header", () => {
    for (const validator of supportedValidators) {
      const emitter = getEmitter(validator);
      const result = emitter.emit(testSchemas);

      expect(result.content).toContain("eslint-disable");
      expect(result.content).toContain("auto-generated by tangrams");
    }
  });

  it("all emitters export schema and type", () => {
    for (const validator of supportedValidators) {
      const emitter = getEmitter(validator);
      const result = emitter.emit(testSchemas);

      expect(result.content).toContain("export const statusSchema");
      expect(result.content).toContain("export const petSchema");
      expect(result.content).toContain("export type Status");
      expect(result.content).toContain("export type Pet");
    }
  });
});
