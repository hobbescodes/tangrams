/**
 * Effect Schema emitter
 *
 * Converts IR to Effect Schema validation code.
 *
 * Effect Schema is part of the Effect ecosystem and uses a functional approach
 * to schema definition. Unlike Zod/Valibot/ArkType which natively implement
 * Standard Schema, Effect Schema requires wrapping with Schema.standardSchemaV1()
 * for use with tools like TanStack Form.
 */

import { createWriter, writeHeader, writeSectionComment } from "@/utils/writer";
import {
  getSafePropertyName,
  toFragmentSchemaName,
  toSchemaName,
} from "../ir/utils";

import type {
  ArraySchemaIR,
  EnumSchemaIR,
  IntersectionSchemaIR,
  NamedSchemaIR,
  ObjectSchemaIR,
  RecordSchemaIR,
  SchemaIR,
  StringSchemaIR,
  UnionSchemaIR,
} from "../ir/types";
import type { Emitter, EmitterOptions, EmitterResult } from "./types";

// ============================================================================
// Effect Schema Emitter
// ============================================================================

export const effectEmitter: Emitter = {
  library: "effect",

  getImportStatement(): string {
    return 'import { Schema } from "effect"';
  },

  getTypeInference(schemaVarName: string, typeName: string): string {
    return `export type ${typeName} = typeof ${schemaVarName}.Type`;
  },

  emit(schemas: NamedSchemaIR[], _options?: EmitterOptions): EmitterResult {
    const warnings: string[] = [];
    const writer = createWriter();

    writeHeader(writer);
    writer.writeLine(this.getImportStatement());
    writer.blankLine();

    // Generate schemas
    if (schemas.length > 0) {
      writeSectionComment(writer, "Effect Schemas");
      for (let i = 0; i < schemas.length; i++) {
        const { name, schema } = schemas[i]!;
        const schemaVarName = toSchemaName(name);
        const schemaCode = emitSchemaIR(schema, warnings);
        writer.writeLine(`export const ${schemaVarName} = ${schemaCode}`);
        // Add blank line between schemas, but not after the last one
        if (i < schemas.length - 1) {
          writer.blankLine();
        }
      }
      writer.blankLine();
    }

    // Generate type exports
    if (schemas.length > 0) {
      writeSectionComment(
        writer,
        "TypeScript Types (inferred from Effect schemas)",
      );
      for (const { name } of schemas) {
        const schemaVarName = toSchemaName(name);
        writer.writeLine(this.getTypeInference(schemaVarName, name));
      }
    }

    return {
      content: writer.toString(),
      warnings,
    };
  },
};

// ============================================================================
// IR to Effect Schema Conversion
// ============================================================================

/**
 * Convert a SchemaIR to Effect Schema code string
 */
function emitSchemaIR(schema: SchemaIR, warnings: string[]): string {
  switch (schema.kind) {
    case "string":
      return emitString(schema);

    case "number":
      return schema.integer
        ? "Schema.Number.pipe(Schema.int())"
        : "Schema.Number";

    case "boolean":
      return "Schema.Boolean";

    case "bigint":
      return "Schema.BigInt";

    case "null":
      return "Schema.Null";

    case "undefined":
      return "Schema.Undefined";

    case "unknown":
      return "Schema.Unknown";

    case "never":
      return "Schema.Never";

    case "date":
      return "Schema.Date";

    case "object":
      return emitObject(schema, warnings);

    case "array":
      return emitArray(schema, warnings);

    case "tuple":
      return emitTuple(schema, warnings);

    case "record":
      return emitRecord(schema, warnings);

    case "enum":
      return emitEnum(schema);

    case "literal":
      return emitLiteral(schema);

    case "union":
      return emitUnion(schema, warnings);

    case "intersection":
      return emitIntersection(schema, warnings);

    case "ref":
      return toSchemaName(schema.name);

    case "raw":
      // Raw code is validator-specific, but we'll emit it as-is
      // User needs to provide Effect-compatible code
      return schema.code;

    default:
      warnings.push(`Unknown schema kind: ${(schema as SchemaIR).kind}`);
      return "Schema.Unknown";
  }
}

/**
 * Emit string schema with format support
 *
 * Effect Schema has limited built-in format validators compared to Zod/Valibot.
 * We use available built-ins and fall back to pattern validation where needed.
 */
function emitString(schema: StringSchemaIR): string {
  const base = "Schema.String";

  switch (schema.format) {
    case "email":
      // Effect Schema doesn't have built-in email, use pattern
      return `${base}.pipe(Schema.pattern(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/))`;
    case "url":
      // Effect Schema doesn't have built-in URL validation
      return `${base}.pipe(Schema.pattern(/^https?:\\/\\/.+/))`;
    case "uuid":
      // Effect has built-in UUID
      return "Schema.UUID";
    case "datetime":
      // ISO 8601 datetime pattern
      return `${base}.pipe(Schema.pattern(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})?$/))`;
    case "date":
      // ISO 8601 date-only pattern
      return `${base}.pipe(Schema.pattern(/^\\d{4}-\\d{2}-\\d{2}$/))`;
    case "time":
      // ISO 8601 time pattern
      return `${base}.pipe(Schema.pattern(/^\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?$/))`;
    case "ipv4":
      // IPv4 pattern
      return `${base}.pipe(Schema.pattern(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/))`;
    case "ipv6":
      // Simplified IPv6 pattern (full validation is complex)
      return `${base}.pipe(Schema.pattern(/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/))`;
    default:
      return base;
  }
}

/**
 * Emit object schema
 */
function emitObject(schema: ObjectSchemaIR, warnings: string[]): string {
  // Check for fragment spreads (stored as metadata by GraphQL parser)
  const fragmentSpreads = (
    schema as ObjectSchemaIR & { _fragmentSpreads?: string[] }
  )._fragmentSpreads;

  const fields: string[] = [];

  // Add fragment spreads first
  if (fragmentSpreads && fragmentSpreads.length > 0) {
    for (const fragmentName of fragmentSpreads) {
      fields.push(`...${toFragmentSchemaName(fragmentName)}.fields`);
    }
  }

  // Add regular properties
  for (const [propName, prop] of Object.entries(schema.properties)) {
    const safeName = getSafePropertyName(propName);
    const propCode = emitSchemaIR(prop.schema, warnings);

    if (prop.required) {
      fields.push(`${safeName}: ${propCode}`);
    } else {
      // Use Schema.NullishOr for optional fields to handle both null and undefined
      fields.push(`${safeName}: Schema.NullishOr(${propCode})`);
    }
  }

  let objectCode = `Schema.Struct({\n${fields.map((f) => `  ${f}`).join(",\n")}\n})`;

  // Handle additionalProperties
  if (schema.additionalProperties === true) {
    // Effect Schema doesn't have a direct passthrough equivalent
    // Use Schema.Record for additional unknown properties
    warnings.push(
      "Effect Schema does not support passthrough mode. Additional properties will not be preserved.",
    );
  } else if (
    typeof schema.additionalProperties === "object" &&
    schema.additionalProperties !== null
  ) {
    // For typed additional properties, we need to use extend with a record
    const addPropCode = emitSchemaIR(schema.additionalProperties, warnings);
    // Use intersection of struct and record
    objectCode = `Schema.extend(${objectCode}, Schema.Record({ key: Schema.String, value: ${addPropCode} }))`;
  }

  return objectCode;
}

/**
 * Emit array schema
 */
function emitArray(schema: ArraySchemaIR, warnings: string[]): string {
  const itemCode = emitSchemaIR(schema.items, warnings);
  return `Schema.Array(${itemCode})`;
}

/**
 * Emit tuple schema
 */
function emitTuple(
  schema: { kind: "tuple"; items: SchemaIR[] },
  warnings: string[],
): string {
  const itemCodes = schema.items.map((item) => emitSchemaIR(item, warnings));
  return `Schema.Tuple(${itemCodes.join(", ")})`;
}

/**
 * Emit record schema
 */
function emitRecord(schema: RecordSchemaIR, warnings: string[]): string {
  const keyCode = emitSchemaIR(schema.keyType, warnings);
  const valueCode = emitSchemaIR(schema.valueType, warnings);
  return `Schema.Record({ key: ${keyCode}, value: ${valueCode} })`;
}

/**
 * Emit enum schema using union of literals
 */
function emitEnum(schema: EnumSchemaIR): string {
  const literals = schema.values.map((v) =>
    typeof v === "string"
      ? `Schema.Literal("${v}")`
      : `Schema.Literal(${String(v)})`,
  );
  return `Schema.Union(${literals.join(", ")})`;
}

/**
 * Emit literal schema
 */
function emitLiteral(schema: {
  kind: "literal";
  value: string | number | boolean;
}): string {
  const value = schema.value;
  if (typeof value === "string") {
    return `Schema.Literal("${value}")`;
  }
  return `Schema.Literal(${value})`;
}

/**
 * Emit union schema
 */
function emitUnion(schema: UnionSchemaIR, warnings: string[]): string {
  // Special case: nullable (union with null)
  const nonNullMembers = schema.members.filter((m) => m.kind !== "null");
  const hasNull = schema.members.some((m) => m.kind === "null");
  const hasUndefined = schema.members.some((m) => m.kind === "undefined");

  // Filter out undefined for nonUndefinedMembers
  const nonNullUndefinedMembers = nonNullMembers.filter(
    (m) => m.kind !== "undefined",
  );

  // Check for nullish pattern (value | null | undefined)
  if (
    hasNull &&
    hasUndefined &&
    nonNullUndefinedMembers.length === 1 &&
    nonNullUndefinedMembers[0]
  ) {
    const innerCode = emitSchemaIR(nonNullUndefinedMembers[0], warnings);
    return `Schema.NullishOr(${innerCode})`;
  }

  // Check for nullable pattern (value | null)
  if (
    hasNull &&
    !hasUndefined &&
    nonNullMembers.length === 1 &&
    nonNullMembers[0]
  ) {
    const innerCode = emitSchemaIR(nonNullMembers[0], warnings);
    return `Schema.NullOr(${innerCode})`;
  }

  // Check for optional pattern (value | undefined)
  if (
    !hasNull &&
    hasUndefined &&
    nonNullUndefinedMembers.length === 1 &&
    nonNullUndefinedMembers[0]
  ) {
    const innerCode = emitSchemaIR(nonNullUndefinedMembers[0], warnings);
    return `Schema.UndefinedOr(${innerCode})`;
  }

  // General union
  if (schema.members.length === 1 && schema.members[0]) {
    return emitSchemaIR(schema.members[0], warnings);
  }

  const memberCodes = schema.members.map((m) => emitSchemaIR(m, warnings));
  return `Schema.Union(${memberCodes.join(", ")})`;
}

/**
 * Emit intersection schema
 */
function emitIntersection(
  schema: IntersectionSchemaIR,
  warnings: string[],
): string {
  if (schema.members.length === 0) {
    return "Schema.Unknown";
  }

  if (schema.members.length === 1 && schema.members[0]) {
    return emitSchemaIR(schema.members[0], warnings);
  }

  // Use Schema.extend for intersections (works with Struct schemas)
  const [first, ...rest] = schema.members;
  if (!first) {
    return "Schema.Unknown";
  }

  let result = emitSchemaIR(first, warnings);
  for (const member of rest) {
    result = `Schema.extend(${result}, ${emitSchemaIR(member, warnings)})`;
  }
  return result;
}
