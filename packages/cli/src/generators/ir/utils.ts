/**
 * IR utilities for schema generation
 *
 * Contains dependency extraction, topological sorting, and IR builders.
 * Naming utilities have been consolidated into @/utils/naming.
 */

import type { NamedSchemaIR, SchemaIR } from "./types";

// ============================================================================
// Dependency Extraction
// ============================================================================

/**
 * Extract schema dependencies (references to other schemas) from a SchemaIR
 */
export function extractDependencies(schema: SchemaIR): Set<string> {
  const deps = new Set<string>();

  function visit(s: SchemaIR): void {
    switch (s.kind) {
      case "ref":
        deps.add(s.name);
        break;

      case "object":
        for (const prop of Object.values(s.properties)) {
          visit(prop.schema);
        }
        if (
          s.additionalProperties &&
          typeof s.additionalProperties === "object"
        ) {
          visit(s.additionalProperties);
        }
        break;

      case "array":
        visit(s.items);
        break;

      case "tuple":
        for (const item of s.items) {
          visit(item);
        }
        break;

      case "record":
        visit(s.keyType);
        visit(s.valueType);
        break;

      case "union":
      case "intersection":
        for (const member of s.members) {
          visit(member);
        }
        break;

      // Primitives and other types don't have dependencies
      default:
        break;
    }
  }

  visit(schema);
  return deps;
}

// ============================================================================
// Topological Sort
// ============================================================================

/**
 * Topologically sort schema entries so dependencies come before dependents
 */
export function topologicalSortSchemas(
  schemas: NamedSchemaIR[],
): NamedSchemaIR[] {
  const result: NamedSchemaIR[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>(); // For cycle detection

  // Create a map for quick lookup
  const schemaMap = new Map<string, NamedSchemaIR>();
  for (const schema of schemas) {
    schemaMap.set(schema.name, schema);
  }

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      // Cycle detected - just return, the schema will be emitted where it is
      return;
    }

    const schema = schemaMap.get(name);
    if (!schema) return;

    visiting.add(name);

    // Visit dependencies first
    for (const dep of schema.dependencies) {
      if (schemaMap.has(dep)) {
        visit(dep);
      }
    }

    visiting.delete(name);
    visited.add(name);
    result.push(schema);
  }

  // Visit all entries
  for (const schema of schemas) {
    visit(schema.name);
  }

  return result;
}

// ============================================================================
// Schema IR Builders
// ============================================================================

/**
 * Convenience builders for creating SchemaIR nodes
 */
export const ir = {
  string: (format?: SchemaIR extends { format?: infer F } ? F : never) =>
    ({ kind: "string", format }) as const,

  number: (integer?: boolean) => ({ kind: "number", integer }) as const,

  boolean: () => ({ kind: "boolean" }) as const,

  bigint: () => ({ kind: "bigint" }) as const,

  null: () => ({ kind: "null" }) as const,

  undefined: () => ({ kind: "undefined" }) as const,

  unknown: () => ({ kind: "unknown" }) as const,

  never: () => ({ kind: "never" }) as const,

  date: () => ({ kind: "date" }) as const,

  object: (
    properties: Record<string, { schema: SchemaIR; required: boolean }>,
    additionalProperties?: boolean | SchemaIR,
  ) =>
    ({
      kind: "object",
      properties,
      additionalProperties,
    }) as const,

  array: (items: SchemaIR) => ({ kind: "array", items }) as const,

  tuple: (items: SchemaIR[]) => ({ kind: "tuple", items }) as const,

  record: (keyType: SchemaIR, valueType: SchemaIR) =>
    ({ kind: "record", keyType, valueType }) as const,

  enum: (values: (string | number)[]) => ({ kind: "enum", values }) as const,

  literal: (value: string | number | boolean) =>
    ({ kind: "literal", value }) as const,

  union: (members: SchemaIR[]) => ({ kind: "union", members }) as const,

  intersection: (members: SchemaIR[]) =>
    ({ kind: "intersection", members }) as const,

  ref: (name: string) => ({ kind: "ref", name }) as const,

  raw: (code: string) => ({ kind: "raw", code }) as const,
};

// ============================================================================
// Schema Creation Helpers
// ============================================================================

/**
 * Create a NamedSchemaIR with automatically extracted dependencies
 */
export function createNamedSchema(
  name: string,
  schema: SchemaIR,
  category?: NamedSchemaIR["category"],
): NamedSchemaIR {
  const dependencies = extractDependencies(schema);
  // Remove self-reference
  dependencies.delete(name);

  return {
    name,
    schema,
    dependencies,
    category,
  };
}

/**
 * Wrap a schema to make it nullable (| null)
 */
export function makeNullable(schema: SchemaIR): SchemaIR {
  return {
    kind: "union",
    members: [schema, { kind: "null" }],
  };
}

/**
 * Wrap a schema to make it nullish (| null | undefined)
 * This is commonly used for optional nullable fields
 */
export function makeNullish(schema: SchemaIR): SchemaIR {
  return {
    kind: "union",
    members: [schema, { kind: "null" }, { kind: "undefined" }],
  };
}
