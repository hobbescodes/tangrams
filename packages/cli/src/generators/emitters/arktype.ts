/**
 * ArkType emitter
 *
 * Converts IR to ArkType validation code.
 *
 * ArkType uses a string-based DSL for type definitions, which is different
 * from Zod/Valibot's method chaining approach. We use the `type()` function
 * with object syntax for complex types.
 */

import { toFragmentSchemaName, toSchemaName } from "@/utils/naming";
import { createWriter, writeHeader, writeSectionComment } from "@/utils/writer";

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
// ArkType Emitter
// ============================================================================

export const arktypeEmitter: Emitter = {
  library: "arktype",

  getImportStatement(): string {
    return 'import { type } from "arktype"';
  },

  getTypeInference(schemaVarName: string, typeName: string): string {
    return `export type ${typeName} = typeof ${schemaVarName}.infer`;
  },

  emit(schemas: NamedSchemaIR[], _options?: EmitterOptions): EmitterResult {
    const warnings: string[] = [];
    const writer = createWriter();

    writeHeader(writer);
    writer.writeLine(this.getImportStatement());
    writer.blankLine();

    // Generate schemas
    if (schemas.length > 0) {
      writeSectionComment(writer, "ArkType Schemas");
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
        "TypeScript Types (inferred from ArkType schemas)",
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
// IR to ArkType Conversion
// ============================================================================

/**
 * Convert a SchemaIR to ArkType code string
 */
function emitSchemaIR(schema: SchemaIR, warnings: string[]): string {
  switch (schema.kind) {
    case "string":
      return emitString(schema);

    case "number":
      return schema.integer ? 'type("number.integer")' : 'type("number")';

    case "boolean":
      return 'type("boolean")';

    case "bigint":
      return 'type("bigint")';

    case "null":
      return 'type("null")';

    case "undefined":
      return 'type("undefined")';

    case "unknown":
      return 'type("unknown")';

    case "never":
      return 'type("never")';

    case "date":
      return 'type("Date")';

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
      // User needs to provide ArkType-compatible code
      return schema.code;

    default:
      warnings.push(`Unknown schema kind: ${(schema as SchemaIR).kind}`);
      return 'type("unknown")';
  }
}

/**
 * Emit string schema with format support
 */
function emitString(schema: StringSchemaIR): string {
  switch (schema.format) {
    case "email":
      return 'type("string.email")';
    case "url":
      return 'type("string.url")';
    case "uuid":
      return 'type("string.uuid")';
    case "datetime":
      return 'type("string.date.iso")';
    case "date":
      return 'type("string.date.iso")'; // ArkType doesn't have separate date-only
    case "time":
      return 'type("string")'; // ArkType doesn't have native time support
    case "ipv4":
      return 'type("string.ip.v4")';
    case "ipv6":
      return 'type("string.ip.v6")';
    default:
      return 'type("string")';
  }
}

/**
 * Emit object schema
 *
 * For ArkType, we cannot spread `.infer` inside `type({})` because `.infer` gives
 * a TypeScript type, not the schema definition. Instead:
 * - If only fragment spreads: merge them with `.and()`
 * - If fragments + properties: build the properties object and merge with fragments using `.and()`
 */
function emitObject(schema: ObjectSchemaIR, warnings: string[]): string {
  // Check for fragment spreads (stored as metadata by GraphQL parser)
  const fragmentSpreads = (
    schema as ObjectSchemaIR & { _fragmentSpreads?: string[] }
  )._fragmentSpreads;

  const hasFragmentSpreads = fragmentSpreads && fragmentSpreads.length > 0;
  const hasProperties = Object.keys(schema.properties).length > 0;
  const hasAdditionalProperties =
    schema.additionalProperties === true ||
    (typeof schema.additionalProperties === "object" &&
      schema.additionalProperties !== null);

  // Case 1: Only fragment spreads, no additional properties
  if (hasFragmentSpreads && !hasProperties && !hasAdditionalProperties) {
    // Merge all fragments using .and()
    if (fragmentSpreads.length === 1) {
      return toFragmentSchemaName(fragmentSpreads[0]!);
    }
    // Multiple fragments: chain with .and()
    let result = toFragmentSchemaName(fragmentSpreads[0]!);
    for (let i = 1; i < fragmentSpreads.length; i++) {
      result = `${result}.and(${toFragmentSchemaName(fragmentSpreads[i]!)})`;
    }
    return result;
  }

  // Build the properties object
  const fields: string[] = [];

  // Add regular properties
  for (const [propName, prop] of Object.entries(schema.properties)) {
    // For ArkType, we use string keys with "?" suffix for optional
    const keyStr = prop.required ? `"${propName}"` : `"${propName}?"`;

    // Get the type as a string for ArkType's object syntax
    let typeStr = getTypeString(prop.schema, warnings);

    // For optional fields, make them nullish (type | null) to match Zod/Valibot behavior
    // This allows both omission and explicit null values
    if (!prop.required) {
      typeStr = makeNullable(typeStr);
    }

    fields.push(`${keyStr}: ${typeStr}`);
  }

  // Handle additionalProperties
  if (schema.additionalProperties === true) {
    // ArkType uses "+": "ignore" for passthrough (though it's the default)
    fields.push('"+": "ignore"');
  } else if (
    typeof schema.additionalProperties === "object" &&
    schema.additionalProperties !== null
  ) {
    // For typed additional properties, use index signature
    const valueTypeStr = getTypeString(schema.additionalProperties, warnings);
    fields.push(`"[string]": ${valueTypeStr}`);
  }

  // Build the base object schema
  let result = `type({\n${fields.map((f) => `  ${f}`).join(",\n")}\n})`;

  // Case 2: Merge with fragment spreads if present
  if (hasFragmentSpreads) {
    for (const fragmentName of fragmentSpreads) {
      result = `${toFragmentSchemaName(fragmentName)}.and(${result})`;
    }
  }

  return result;
}

/**
 * Make a type string nullable by appending " | null"
 * Handles both string literal types and schema references
 */
function makeNullable(typeStr: string): string {
  // If it's a string literal type like "string" or "number.integer"
  if (typeStr.startsWith('"') && typeStr.endsWith('"')) {
    const innerType = typeStr.slice(1, -1);
    // Don't double-add null if already present
    if (innerType.includes(" | null")) {
      return typeStr;
    }
    return `"${innerType} | null"`;
  }

  // For schema references or complex types, use .or(type("null"))
  return `${typeStr}.or(type("null"))`;
}

/**
 * Get a type string for use in ArkType object syntax
 * Returns either a string literal type or a reference to a schema
 */
function getTypeString(schema: SchemaIR, warnings: string[]): string {
  switch (schema.kind) {
    case "string":
      return getStringTypeString(schema);

    case "number":
      return schema.integer ? '"number.integer"' : '"number"';

    case "boolean":
      return '"boolean"';

    case "bigint":
      return '"bigint"';

    case "null":
      return '"null"';

    case "undefined":
      return '"undefined"';

    case "unknown":
      return '"unknown"';

    case "never":
      return '"never"';

    case "date":
      return '"Date"';

    case "array": {
      const itemType = getTypeString(schema.items, warnings);
      // If item type is a string literal, we can use array syntax
      if (itemType.startsWith('"') && itemType.endsWith('"')) {
        const innerType = itemType.slice(1, -1);
        return `"${innerType}[]"`;
      }
      // Otherwise, use the full emitter for nested schemas
      return emitArray(schema, warnings);
    }

    case "ref":
      return toSchemaName(schema.name);

    case "enum":
      // For enums in object context, use the enum emitter
      return emitEnum(schema);

    case "union":
      return emitUnionTypeString(schema, warnings);

    case "literal":
      return emitLiteralTypeString(schema);

    case "raw":
      return schema.code;

    default:
      // For complex types, fall back to full emitter
      return emitSchemaIR(schema, warnings);
  }
}

/**
 * Get string type string for ArkType
 */
function getStringTypeString(schema: StringSchemaIR): string {
  switch (schema.format) {
    case "email":
      return '"string.email"';
    case "url":
      return '"string.url"';
    case "uuid":
      return '"string.uuid"';
    case "datetime":
      return '"string.date.iso"';
    case "date":
      return '"string.date.iso"';
    case "time":
      return '"string"';
    case "ipv4":
      return '"string.ip.v4"';
    case "ipv6":
      return '"string.ip.v6"';
    default:
      return '"string"';
  }
}

/**
 * Emit array schema
 */
function emitArray(schema: ArraySchemaIR, warnings: string[]): string {
  const itemType = getTypeString(schema.items, warnings);

  // If item type is a simple string, use array syntax
  if (itemType.startsWith('"') && itemType.endsWith('"')) {
    const innerType = itemType.slice(1, -1);
    return `type("${innerType}[]")`;
  }

  // For complex items, use type composition
  return `${itemType}.array()`;
}

/**
 * Emit tuple schema
 */
function emitTuple(
  schema: { kind: "tuple"; items: SchemaIR[] },
  warnings: string[],
): string {
  const itemTypes = schema.items.map((item) => getTypeString(item, warnings));
  return `type([${itemTypes.join(", ")}])`;
}

/**
 * Emit record schema
 */
function emitRecord(schema: RecordSchemaIR, warnings: string[]): string {
  const valueType = getTypeString(schema.valueType, warnings);

  // ArkType uses { "[string]": valueType } for records
  return `type({ "[string]": ${valueType} })`;
}

/**
 * Emit enum schema using enumerated
 */
function emitEnum(schema: EnumSchemaIR): string {
  const values = schema.values.map((v) =>
    typeof v === "string" ? `"${v}"` : String(v),
  );
  return `type.enumerated(${values.join(", ")})`;
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
    return `type("'${value}'")`;
  }
  if (typeof value === "boolean") {
    return `type("${value}")`;
  }
  return `type("${value}")`;
}

/**
 * Emit literal as a type string for object context
 */
function emitLiteralTypeString(schema: {
  kind: "literal";
  value: string | number | boolean;
}): string {
  const value = schema.value;
  if (typeof value === "string") {
    return `"'${value}'"`;
  }
  if (typeof value === "boolean") {
    return `"${value}"`;
  }
  return `"${value}"`;
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
    const innerType = getTypeString(nonNullMembers[0], warnings);
    if (innerType.startsWith('"') && innerType.endsWith('"')) {
      const type = innerType.slice(1, -1);
      return `type("${type} | null | undefined")`;
    }
    return `${emitSchemaIR(nonNullMembers[0], warnings)}.or(type("null | undefined"))`;
  }

  // Check for nullable pattern (value | null)
  if (
    hasNull &&
    !hasUndefined &&
    nonNullMembers.length === 1 &&
    nonNullMembers[0]
  ) {
    const innerType = getTypeString(nonNullMembers[0], warnings);
    if (innerType.startsWith('"') && innerType.endsWith('"')) {
      const type = innerType.slice(1, -1);
      return `type("${type} | null")`;
    }
    return `${emitSchemaIR(nonNullMembers[0], warnings)}.or(type("null"))`;
  }

  // Check for optional pattern (value | undefined)
  if (
    !hasNull &&
    hasUndefined &&
    nonNullMembers.length === 1 &&
    nonNullMembers[0]
  ) {
    const innerType = getTypeString(nonNullMembers[0], warnings);
    if (innerType.startsWith('"') && innerType.endsWith('"')) {
      const type = innerType.slice(1, -1);
      return `type("${type} | undefined")`;
    }
    return `${emitSchemaIR(nonNullMembers[0], warnings)}.or(type("undefined"))`;
  }

  // General union - try to use string syntax for simple types
  if (schema.members.length === 1 && schema.members[0]) {
    return emitSchemaIR(schema.members[0], warnings);
  }

  const canUseStringSyntax = schema.members.every((m) => {
    const typeStr = getTypeString(m, warnings);
    return typeStr.startsWith('"') && typeStr.endsWith('"');
  });

  if (canUseStringSyntax) {
    const types = schema.members.map((m) => {
      const typeStr = getTypeString(m, warnings);
      return typeStr.slice(1, -1);
    });
    return `type("${types.join(" | ")}")`;
  }

  // For complex unions, use .or() chaining
  const [first, ...rest] = schema.members;
  if (!first) {
    return 'type("unknown")';
  }

  let result = emitSchemaIR(first, warnings);
  for (const member of rest) {
    result = `${result}.or(${emitSchemaIR(member, warnings)})`;
  }
  return result;
}

/**
 * Emit union as a type string for object context
 */
function emitUnionTypeString(
  schema: UnionSchemaIR,
  warnings: string[],
): string {
  const canUseStringSyntax = schema.members.every((m) => {
    const typeStr = getTypeString(m, warnings);
    return typeStr.startsWith('"') && typeStr.endsWith('"');
  });

  if (canUseStringSyntax) {
    const types = schema.members.map((m) => {
      const typeStr = getTypeString(m, warnings);
      return typeStr.slice(1, -1);
    });
    return `"${types.join(" | ")}"`;
  }

  // Fall back to full emitter
  return emitUnion(schema, warnings);
}

/**
 * Emit intersection schema
 */
function emitIntersection(
  schema: IntersectionSchemaIR,
  warnings: string[],
): string {
  if (schema.members.length === 0) {
    return 'type("unknown")';
  }

  if (schema.members.length === 1 && schema.members[0]) {
    return emitSchemaIR(schema.members[0], warnings);
  }

  // Try string syntax for simple types
  const canUseStringSyntax = schema.members.every((m) => {
    const typeStr = getTypeString(m, warnings);
    return typeStr.startsWith('"') && typeStr.endsWith('"');
  });

  if (canUseStringSyntax) {
    const types = schema.members.map((m) => {
      const typeStr = getTypeString(m, warnings);
      return typeStr.slice(1, -1);
    });
    return `type("${types.join(" & ")}")`;
  }

  // Use .and() chaining for complex intersections
  const [first, ...rest] = schema.members;
  if (!first) {
    return 'type("unknown")';
  }

  let result = emitSchemaIR(first, warnings);
  for (const member of rest) {
    result = `${result}.and(${emitSchemaIR(member, warnings)})`;
  }
  return result;
}
