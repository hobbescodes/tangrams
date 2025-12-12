import { describe, expect, it } from "vitest";

import {
  createDefaultGenContext,
  generateDefaultValue,
  generateDefaultValuesCode,
} from "./defaults";

describe("Default Value Generator", () => {
  describe("generateDefaultValue", () => {
    it("generates empty string for z.string()", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValue("z.string()", ctx);
      expect(result).toBe("");
    });

    it("generates 0 for z.number()", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValue("z.number()", ctx);
      expect(result).toBe(0);
    });

    it("generates 0 for z.number().int()", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValue("z.number().int()", ctx);
      expect(result).toBe(0);
    });

    it("generates false for z.boolean()", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValue("z.boolean()", ctx);
      expect(result).toBe(false);
    });

    it("generates empty array for z.array()", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValue("z.array(z.string())", ctx);
      expect(result).toEqual([]);
    });

    it("generates null for nullable types", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValue("z.string().nullable()", ctx);
      expect(result).toBe(null);
    });

    it("generates undefined for optional types", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValue("z.string().optional()", ctx);
      expect(result).toBe(undefined);
    });

    it("generates first value for enums", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValue(
        'z.enum(["active", "inactive"])',
        ctx,
      );
      expect(result).toBe("active");
    });

    it("generates object with default values for z.object()", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValue(
        `z.object({
  name: z.string(),
  age: z.number()
})`,
        ctx,
      );
      expect(result).toEqual({ name: "", age: 0 });
    });

    it("excludes optional properties from object defaults", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValue(
        `z.object({
  name: z.string(),
  nickname: z.string().optional()
})`,
        ctx,
      );
      expect(result).toEqual({ name: "" });
    });

    it("resolves schema references", () => {
      const ctx = createDefaultGenContext([
        "export const userSchema = z.object({ name: z.string() })",
      ]);
      const result = generateDefaultValue("userSchema", ctx);
      expect(result).toEqual({ name: "" });
    });

    it("handles string format variants", () => {
      const ctx = createDefaultGenContext([]);

      expect(generateDefaultValue("z.email()", ctx)).toBe("");
      expect(generateDefaultValue("z.url()", ctx)).toBe("");
      expect(generateDefaultValue("z.uuid()", ctx)).toBe("");
      expect(generateDefaultValue("z.iso.datetime()", ctx)).toBe("");
      expect(generateDefaultValue("z.iso.date()", ctx)).toBe("");
    });
  });

  describe("generateDefaultValuesCode", () => {
    it("generates code for simple types", () => {
      const ctx = createDefaultGenContext([]);
      expect(generateDefaultValuesCode("z.string()", ctx)).toBe('""');
      expect(generateDefaultValuesCode("z.number()", ctx)).toBe("0");
      expect(generateDefaultValuesCode("z.boolean()", ctx)).toBe("false");
    });

    it("generates code for nullable types", () => {
      const ctx = createDefaultGenContext([]);
      expect(generateDefaultValuesCode("z.string().nullable()", ctx)).toBe(
        "null",
      );
    });

    it("generates code for objects", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValuesCode(
        `z.object({
  name: z.string(),
  age: z.number()
})`,
        ctx,
        "",
      );
      expect(result).toContain("name:");
      expect(result).toContain("age:");
    });

    it("generates code for enums with first value", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValuesCode(
        'z.enum(["active", "pending", "done"])',
        ctx,
      );
      expect(result).toBe('"active"');
    });

    it("handles nested objects", () => {
      const ctx = createDefaultGenContext([]);
      const result = generateDefaultValuesCode(
        `z.object({
  user: z.object({
    name: z.string()
  })
})`,
        ctx,
      );
      expect(result).toContain("user:");
      expect(result).toContain("name:");
    });
  });
});
