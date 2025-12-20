/**
 * Zod emitter
 *
 * Converts IR to Zod validation code.
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
// Zod Emitter
// ============================================================================

export const zodEmitter: Emitter = {
  library: "zod",

  getImportStatement(): string {
    return 'import * as z from "zod"';
  },

  getTypeInference(schemaVarName: string, typeName: string): string {
    return `export type ${typeName} = z.infer<typeof ${schemaVarName}>`;
  },

  emit(schemas: NamedSchemaIR[], _options?: EmitterOptions): EmitterResult {
    const warnings: string[] = [];
    const writer = createWriter();

    writeHeader(writer);
    writer.writeLine(this.getImportStatement());
    writer.blankLine();

    // Generate schemas
    if (schemas.length > 0) {
      writeSectionComment(writer, "Zod Schemas");
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
        "TypeScript Types (inferred from Zod schemas)",
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
// IR to Zod Conversion
// ============================================================================

/**
 * Convert a SchemaIR to Zod code string
 */
function emitSchemaIR(schema: SchemaIR, warnings: string[]): string {
  switch (schema.kind) {
    case "string":
      return emitString(schema);

    case "number":
      return schema.integer ? "z.number().int()" : "z.number()";

    case "boolean":
      return "z.boolean()";

    case "bigint":
      return "z.bigint()";

    case "null":
      return "z.null()";

    case "undefined":
      return "z.undefined()";

    case "unknown":
      return "z.unknown()";

    case "never":
      return "z.never()";

    case "date":
      return "z.date()";

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
      return schema.code;

    default:
      warnings.push(`Unknown schema kind: ${(schema as SchemaIR).kind}`);
      return "z.unknown()";
  }
}

/**
 * Emit string schema with format support
 */
function emitString(schema: StringSchemaIR): string {
  switch (schema.format) {
    case "email":
      return "z.email()";
    case "url":
      return "z.url()";
    case "uuid":
      return "z.uuid()";
    case "datetime":
      return "z.iso.datetime()";
    case "date":
      return "z.iso.date()";
    case "time":
      return "z.iso.time()";
    case "ipv4":
      return "z.ipv4()";
    case "ipv6":
      return "z.ipv6()";
    default:
      return "z.string()";
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
      fields.push(`...${toFragmentSchemaName(fragmentName)}.shape`);
    }
  }

  // Add regular properties
  for (const [propName, prop] of Object.entries(schema.properties)) {
    const safeName = getSafePropertyName(propName);
    const propCode = emitSchemaIR(prop.schema, warnings);

    if (prop.required) {
      fields.push(`${safeName}: ${propCode}`);
    } else {
      // Use .nullish() for optional fields to handle both null and undefined
      fields.push(`${safeName}: ${propCode}.nullish()`);
    }
  }

  let objectCode = `z.object({\n${fields.map((f) => `  ${f}`).join(",\n")}\n})`;

  // Handle additionalProperties
  if (schema.additionalProperties === true) {
    objectCode = `${objectCode}.passthrough()`;
  } else if (
    typeof schema.additionalProperties === "object" &&
    schema.additionalProperties !== null
  ) {
    const addPropCode = emitSchemaIR(schema.additionalProperties, warnings);
    objectCode = `${objectCode}.catchall(${addPropCode})`;
  }

  return objectCode;
}

/**
 * Emit array schema
 */
function emitArray(schema: ArraySchemaIR, warnings: string[]): string {
  const itemCode = emitSchemaIR(schema.items, warnings);
  return `z.array(${itemCode})`;
}

/**
 * Emit tuple schema
 */
function emitTuple(
  schema: { kind: "tuple"; items: SchemaIR[] },
  warnings: string[],
): string {
  const itemCodes = schema.items.map((item) => emitSchemaIR(item, warnings));
  return `z.tuple([${itemCodes.join(", ")}])`;
}

/**
 * Emit record schema
 */
function emitRecord(schema: RecordSchemaIR, warnings: string[]): string {
  const keyCode = emitSchemaIR(schema.keyType, warnings);
  const valueCode = emitSchemaIR(schema.valueType, warnings);
  return `z.record(${keyCode}, ${valueCode})`;
}

/**
 * Emit enum schema
 */
function emitEnum(schema: EnumSchemaIR): string {
  const values = schema.values.map((v) =>
    typeof v === "string" ? `"${v}"` : String(v),
  );
  return `z.enum([${values.join(", ")}])`;
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
    return `z.literal("${value}")`;
  }
  return `z.literal(${value})`;
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
    return `${innerCode}.nullish()`;
  }

  // Check for nullable pattern (value | null)
  if (
    hasNull &&
    !hasUndefined &&
    nonNullMembers.length === 1 &&
    nonNullMembers[0]
  ) {
    const innerCode = emitSchemaIR(nonNullMembers[0], warnings);
    return `${innerCode}.nullable()`;
  }

  // Check for optional pattern (value | undefined)
  if (
    !hasNull &&
    hasUndefined &&
    nonNullMembers.length === 1 &&
    nonNullMembers[0]
  ) {
    const innerCode = emitSchemaIR(nonNullMembers[0], warnings);
    return `${innerCode}.optional()`;
  }

  // General union
  if (schema.members.length === 1 && schema.members[0]) {
    return emitSchemaIR(schema.members[0], warnings);
  }

  const memberCodes = schema.members.map((m) => emitSchemaIR(m, warnings));
  return `z.union([${memberCodes.join(", ")}])`;
}

/**
 * Emit intersection schema
 */
function emitIntersection(
  schema: IntersectionSchemaIR,
  warnings: string[],
): string {
  if (schema.members.length === 0) {
    return "z.unknown()";
  }

  if (schema.members.length === 1 && schema.members[0]) {
    return emitSchemaIR(schema.members[0], warnings);
  }

  // Use .and() chain for intersections
  const [first, ...rest] = schema.members;
  if (!first) {
    return "z.unknown()";
  }

  let result = emitSchemaIR(first, warnings);
  for (const member of rest) {
    result = `${result}.and(${emitSchemaIR(member, warnings)})`;
  }
  return result;
}
