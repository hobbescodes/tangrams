import { describe, expect, it } from "vitest";

import { DEFAULT_SCALARS, resolveScalars } from "./scalars";

describe("DEFAULT_SCALARS", () => {
  it("contains expected GraphQL scalar mappings", () => {
    expect(DEFAULT_SCALARS).toMatchObject({
      ID: "string",
      String: "string",
      Int: "number",
      Float: "number",
      Boolean: "boolean",
    });
  });

  it("contains DateTime scalar", () => {
    expect(DEFAULT_SCALARS.DateTime).toBe("string");
  });

  it("contains JSON scalar", () => {
    expect(DEFAULT_SCALARS.JSON).toBe("unknown");
  });

  it("contains BigInt scalar", () => {
    expect(DEFAULT_SCALARS.BigInt).toBe("bigint");
  });
});

describe("resolveScalars", () => {
  it("returns DEFAULT_SCALARS when no user scalars provided", () => {
    const result = resolveScalars();
    expect(result).toEqual(DEFAULT_SCALARS);
  });

  it("returns DEFAULT_SCALARS when undefined is passed", () => {
    const result = resolveScalars(undefined);
    expect(result).toEqual(DEFAULT_SCALARS);
  });

  it("returns DEFAULT_SCALARS when empty object is passed", () => {
    const result = resolveScalars({});
    expect(result).toEqual(DEFAULT_SCALARS);
  });

  it("allows user scalar to override default", () => {
    const result = resolveScalars({ DateTime: "Date" });
    expect(result.DateTime).toBe("Date");
    // Other defaults should still be present
    expect(result.ID).toBe("string");
    expect(result.String).toBe("string");
  });

  it("allows user to add custom scalars", () => {
    const result = resolveScalars({ CustomScalar: "MyCustomType" });
    expect(result.CustomScalar).toBe("MyCustomType");
    // Defaults should still be present
    expect(result.ID).toBe("string");
  });

  it("allows multiple overrides and additions", () => {
    const result = resolveScalars({
      DateTime: "Date",
      JSON: "Record<string, unknown>",
      MyCustomScalar: "CustomType",
    });
    expect(result.DateTime).toBe("Date");
    expect(result.JSON).toBe("Record<string, unknown>");
    expect(result.MyCustomScalar).toBe("CustomType");
    expect(result.ID).toBe("string");
  });
});
