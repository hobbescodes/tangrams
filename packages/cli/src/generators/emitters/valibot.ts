/**
 * Valibot emitter
 *
 * Converts IR to Valibot validation code.
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
// Valibot Emitter
// ============================================================================

export const valibotEmitter: Emitter = {
  library: "valibot",

  getImportStatement(): string {
    return 'import * as v from "valibot"';
  },

  getTypeInference(schemaVarName: string, typeName: string): string {
    return `export type ${typeName} = v.InferOutput<typeof ${schemaVarName}>`;
  },

  emit(schemas: NamedSchemaIR[], _options?: EmitterOptions): EmitterResult {
    const warnings: string[] = [];
    const writer = createWriter();

    writeHeader(writer);
    writer.writeLine(this.getImportStatement());
    writer.blankLine();

    // Generate schemas
    if (schemas.length > 0) {
      writeSectionComment(writer, "Valibot Schemas");
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
        "TypeScript Types (inferred from Valibot schemas)",
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
// IR to Valibot Conversion
// ============================================================================

/**
 * Convert a SchemaIR to Valibot code string
 */
function emitSchemaIR(schema: SchemaIR, warnings: string[]): string {
  switch (schema.kind) {
    case "string":
      return emitString(schema);

    case "number":
      return schema.integer ? "v.pipe(v.number(), v.integer())" : "v.number()";

    case "boolean":
      return "v.boolean()";

    case "bigint":
      return "v.bigint()";

    case "null":
      return "v.null()";

    case "undefined":
      return "v.undefined()";

    case "unknown":
      return "v.unknown()";

    case "never":
      return "v.never()";

    case "date":
      return "v.date()";

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
      // User needs to provide Valibot-compatible code
      return schema.code;

    default:
      warnings.push(`Unknown schema kind: ${(schema as SchemaIR).kind}`);
      return "v.unknown()";
  }
}

/**
 * Emit string schema with format support using Valibot pipes
 */
function emitString(schema: StringSchemaIR): string {
  const base = "v.string()";

  switch (schema.format) {
    case "email":
      return `v.pipe(${base}, v.email())`;
    case "url":
      return `v.pipe(${base}, v.url())`;
    case "uuid":
      return `v.pipe(${base}, v.uuid())`;
    case "datetime":
      // Use isoTimestamp for full ISO 8601 datetime with seconds and timezone
      // isoDateTime only validates yyyy-mm-ddThh:mm format (no seconds/timezone)
      return `v.pipe(${base}, v.isoTimestamp())`;
    case "date":
      return `v.pipe(${base}, v.isoDate())`;
    case "time":
      return `v.pipe(${base}, v.isoTime())`;
    case "ipv4":
      return `v.pipe(${base}, v.ipv4())`;
    case "ipv6":
      return `v.pipe(${base}, v.ipv6())`;
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

  // Add fragment spreads first (using spread syntax on entries)
  if (fragmentSpreads && fragmentSpreads.length > 0) {
    for (const fragmentName of fragmentSpreads) {
      fields.push(`...${toFragmentSchemaName(fragmentName)}.entries`);
    }
  }

  // Add regular properties
  for (const [propName, prop] of Object.entries(schema.properties)) {
    const safeName = getSafePropertyName(propName);
    const propCode = emitSchemaIR(prop.schema, warnings);

    if (prop.required) {
      fields.push(`${safeName}: ${propCode}`);
    } else {
      // Use v.nullish() for optional fields
      fields.push(`${safeName}: v.nullish(${propCode})`);
    }
  }

  let objectCode = `v.object({\n${fields.map((f) => `  ${f}`).join(",\n")}\n})`;

  // Handle additionalProperties
  if (schema.additionalProperties === true) {
    // Valibot uses looseObject for passthrough
    objectCode = `v.looseObject({\n${fields.map((f) => `  ${f}`).join(",\n")}\n})`;
  } else if (
    typeof schema.additionalProperties === "object" &&
    schema.additionalProperties !== null
  ) {
    // Valibot uses objectWithRest for typed additional properties
    const addPropCode = emitSchemaIR(schema.additionalProperties, warnings);
    objectCode = `v.objectWithRest({\n${fields.map((f) => `  ${f}`).join(",\n")}\n}, ${addPropCode})`;
  }

  return objectCode;
}

/**
 * Emit array schema
 */
function emitArray(schema: ArraySchemaIR, warnings: string[]): string {
  const itemCode = emitSchemaIR(schema.items, warnings);
  return `v.array(${itemCode})`;
}

/**
 * Emit tuple schema
 */
function emitTuple(
  schema: { kind: "tuple"; items: SchemaIR[] },
  warnings: string[],
): string {
  const itemCodes = schema.items.map((item) => emitSchemaIR(item, warnings));
  return `v.tuple([${itemCodes.join(", ")}])`;
}

/**
 * Emit record schema
 */
function emitRecord(schema: RecordSchemaIR, warnings: string[]): string {
  const keyCode = emitSchemaIR(schema.keyType, warnings);
  const valueCode = emitSchemaIR(schema.valueType, warnings);
  return `v.record(${keyCode}, ${valueCode})`;
}

/**
 * Emit enum schema using picklist
 */
function emitEnum(schema: EnumSchemaIR): string {
  const values = schema.values.map((v) =>
    typeof v === "string" ? `"${v}"` : String(v),
  );
  return `v.picklist([${values.join(", ")}])`;
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
    return `v.literal("${value}")`;
  }
  return `v.literal(${value})`;
}

/**
 * Emit union schema
 */
function emitUnion(schema: UnionSchemaIR, warnings: string[]): string {
  // Special case: nullable (union with null)
  const nonNullMembers = schema.members.filter((m) => m.kind !== "null");
  const hasNull = schema.members.some((m) => m.kind === "null");
  const hasUndefined = schema.members.some((m) => m.kind === "undefined");

  // Check for nullish pattern (value | null | undefined)
  if (
    hasNull &&
    hasUndefined &&
    nonNullMembers.length === 1 &&
    nonNullMembers[0]
  ) {
    const innerCode = emitSchemaIR(nonNullMembers[0], warnings);
    return `v.nullish(${innerCode})`;
  }

  // Check for nullable pattern (value | null)
  if (
    hasNull &&
    !hasUndefined &&
    nonNullMembers.length === 1 &&
    nonNullMembers[0]
  ) {
    const innerCode = emitSchemaIR(nonNullMembers[0], warnings);
    return `v.nullable(${innerCode})`;
  }

  // Check for optional pattern (value | undefined)
  if (
    !hasNull &&
    hasUndefined &&
    nonNullMembers.length === 1 &&
    nonNullMembers[0]
  ) {
    const innerCode = emitSchemaIR(nonNullMembers[0], warnings);
    return `v.optional(${innerCode})`;
  }

  // General union
  if (schema.members.length === 1 && schema.members[0]) {
    return emitSchemaIR(schema.members[0], warnings);
  }

  const memberCodes = schema.members.map((m) => emitSchemaIR(m, warnings));
  return `v.union([${memberCodes.join(", ")}])`;
}

/**
 * Emit intersection schema
 */
function emitIntersection(
  schema: IntersectionSchemaIR,
  warnings: string[],
): string {
  if (schema.members.length === 0) {
    return "v.unknown()";
  }

  if (schema.members.length === 1 && schema.members[0]) {
    return emitSchemaIR(schema.members[0], warnings);
  }

  // Use v.intersect for intersections
  const memberCodes = schema.members.map((m) => emitSchemaIR(m, warnings));
  return `v.intersect([${memberCodes.join(", ")}])`;
}
