/**
 * Default value generation from Zod schema strings
 * Generates empty/placeholder default values for form initialization
 */

/**
 * Extract complete schema definitions from generated Zod schema content.
 * Handles multi-line definitions by tracking bracket depth.
 *
 * @param content The full generated schema file content
 * @returns Array of complete schema definition strings (e.g., "export const fooSchema = z.object({...})")
 */
export function extractSchemaDefinitions(content: string): string[] {
  const definitions: string[] = [];
  const lines = content.split("\n");

  let currentDef = "";
  let depth = 0;
  let inDefinition = false;

  for (const line of lines) {
    // Check if this line starts a new schema definition
    if (line.startsWith("export const ") && line.includes("Schema")) {
      // If we were in a definition, save it first
      if (inDefinition && currentDef) {
        definitions.push(currentDef.trim());
      }

      currentDef = line;
      inDefinition = true;

      // Count brackets in this line to track depth
      depth = 0;
      for (const char of line) {
        if (char === "(" || char === "{" || char === "[") depth++;
        if (char === ")" || char === "}" || char === "]") depth--;
      }

      // If depth is 0, this is a single-line definition or a simple alias
      if (depth === 0) {
        definitions.push(currentDef.trim());
        currentDef = "";
        inDefinition = false;
      }
    } else if (inDefinition) {
      // Continue building the current definition
      currentDef += "\n" + line;

      // Track bracket depth
      for (const char of line) {
        if (char === "(" || char === "{" || char === "[") depth++;
        if (char === ")" || char === "}" || char === "]") depth--;
      }

      // If we're back to depth 0, the definition is complete
      if (depth === 0) {
        definitions.push(currentDef.trim());
        currentDef = "";
        inDefinition = false;
      }
    }
  }

  // Don't forget the last definition if file doesn't end with balanced brackets
  if (inDefinition && currentDef) {
    definitions.push(currentDef.trim());
  }

  return definitions;
}

/**
 * Parsed representation of a Zod schema for default value generation
 */
export interface ParsedZodSchema {
  type:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "enum"
    | "union"
    | "unknown"
    | "reference";
  nullable?: boolean;
  optional?: boolean;
  /** For arrays */
  itemType?: ParsedZodSchema;
  /** For objects */
  properties?: Record<string, ParsedZodSchema>;
  /** For enums */
  enumValues?: string[];
  /** For references to other schemas */
  referenceName?: string;
  /** For unions */
  unionTypes?: ParsedZodSchema[];
}

/**
 * Context for default value generation
 */
export interface DefaultGenContext {
  /** All generated schemas (name -> Zod string) for resolving references */
  schemas: Map<string, string>;
  /** Already parsed schemas (to avoid re-parsing) */
  parsedSchemas: Map<string, ParsedZodSchema>;
}

/**
 * Create a default generation context from generated Zod schema strings.
 * Accepts complete schema definition strings (which may be multi-line).
 */
export function createDefaultGenContext(
  zodSchemas: string[],
): DefaultGenContext {
  const schemas = new Map<string, string>();

  // Parse schema definitions to extract name -> schema mapping
  // Use a regex that handles multi-line definitions by using [\s\S] instead of .
  for (const definition of zodSchemas) {
    const match = definition.match(/^export const (\w+Schema) = ([\s\S]+)$/);
    if (match) {
      const [, name, schema] = match;
      if (name && schema) {
        schemas.set(name, schema.trim());
      }
    }
  }

  return {
    schemas,
    parsedSchemas: new Map(),
  };
}

/**
 * Generate a default value for a Zod schema string
 */
export function generateDefaultValue(
  zodSchema: string,
  ctx: DefaultGenContext,
): unknown {
  const parsed = parseZodSchema(zodSchema, ctx);
  return generateDefaultFromParsed(parsed, ctx);
}

/**
 * Generate a default value from a parsed schema
 */
function generateDefaultFromParsed(
  parsed: ParsedZodSchema,
  ctx: DefaultGenContext,
): unknown {
  // Handle nullable - return null
  if (parsed.nullable) {
    return null;
  }

  // Handle optional - return undefined
  if (parsed.optional) {
    return undefined;
  }

  switch (parsed.type) {
    case "string":
      return "";

    case "number":
      return 0;

    case "boolean":
      return false;

    case "array":
      return [];

    case "object": {
      if (!parsed.properties) return {};

      const obj: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(parsed.properties)) {
        // Don't include undefined values in the object
        const value = generateDefaultFromParsed(propSchema, ctx);
        if (value !== undefined) {
          obj[key] = value;
        }
      }
      return obj;
    }

    case "enum": {
      // Return the first enum value as default, or null if empty
      if (parsed.enumValues && parsed.enumValues.length > 0) {
        return parsed.enumValues[0];
      }
      return null;
    }

    case "union": {
      // For unions, use the first non-null type's default
      if (parsed.unionTypes && parsed.unionTypes.length > 0) {
        for (const unionType of parsed.unionTypes) {
          if (unionType.type !== "unknown") {
            return generateDefaultFromParsed(unionType, ctx);
          }
        }
      }
      return null;
    }

    case "reference": {
      // Resolve the reference and generate default for it
      if (parsed.referenceName) {
        const refSchema = ctx.schemas.get(parsed.referenceName);
        if (refSchema) {
          const refParsed = parseZodSchema(refSchema, ctx);
          return generateDefaultFromParsed(refParsed, ctx);
        }
      }
      return {};
    }

    default:
      return null;
  }
}

/**
 * Parse a Zod schema string into a structured representation
 * This is a simplified parser that handles common patterns
 */
function parseZodSchema(
  zodSchema: string,
  ctx: DefaultGenContext,
): ParsedZodSchema {
  // Check cache
  const cached = ctx.parsedSchemas.get(zodSchema);
  if (cached) return cached;

  const result = parseZodSchemaInternal(zodSchema.trim(), ctx);

  // Cache result
  ctx.parsedSchemas.set(zodSchema, result);

  return result;
}

/**
 * Internal parser for Zod schema strings
 */
function parseZodSchemaInternal(
  schema: string,
  ctx: DefaultGenContext,
): ParsedZodSchema {
  // Handle modifiers at the end: .nullable(), .optional()
  let nullable = false;
  let optional = false;
  let baseSchema = schema;

  // Check for .nullable() at the end
  if (baseSchema.endsWith(".nullable()")) {
    nullable = true;
    baseSchema = baseSchema.slice(0, -".nullable()".length);
  }

  // Check for .optional() at the end
  if (baseSchema.endsWith(".optional()")) {
    optional = true;
    baseSchema = baseSchema.slice(0, -".optional()".length);
  }

  // Handle chained modifiers (nullable can come before optional or vice versa)
  if (baseSchema.endsWith(".nullable()")) {
    nullable = true;
    baseSchema = baseSchema.slice(0, -".nullable()".length);
  }
  if (baseSchema.endsWith(".optional()")) {
    optional = true;
    baseSchema = baseSchema.slice(0, -".optional()".length);
  }

  // Reference to another schema (e.g., "userSchema")
  if (/^[a-zA-Z]\w*Schema$/.test(baseSchema)) {
    return {
      type: "reference",
      referenceName: baseSchema,
      nullable,
      optional,
    };
  }

  // z.string() and variants
  if (
    baseSchema.startsWith("z.string()") ||
    baseSchema.startsWith("z.email()") ||
    baseSchema.startsWith("z.url()") ||
    baseSchema.startsWith("z.uuid()") ||
    baseSchema.startsWith("z.ipv4()") ||
    baseSchema.startsWith("z.ipv6()") ||
    baseSchema.startsWith("z.iso.datetime()") ||
    baseSchema.startsWith("z.iso.date()") ||
    baseSchema.startsWith("z.iso.time()")
  ) {
    return { type: "string", nullable, optional };
  }

  // z.number() and variants
  if (
    baseSchema.startsWith("z.number()") ||
    baseSchema.startsWith("z.bigint()")
  ) {
    return { type: "number", nullable, optional };
  }

  // z.boolean()
  if (baseSchema.startsWith("z.boolean()")) {
    return { type: "boolean", nullable, optional };
  }

  // z.unknown()
  if (baseSchema.startsWith("z.unknown()")) {
    return { type: "unknown", nullable, optional };
  }

  // z.array(...)
  const arrayMatch = baseSchema.match(/^z\.array\((.+)\)/);
  if (arrayMatch) {
    const innerSchema = arrayMatch[1];
    return {
      type: "array",
      itemType: innerSchema ? parseZodSchema(innerSchema, ctx) : undefined,
      nullable,
      optional,
    };
  }

  // z.enum([...])
  const enumMatch = baseSchema.match(/^z\.enum\(\[(.+)\]\)/);
  if (enumMatch) {
    const valuesStr = enumMatch[1];
    const enumValues = valuesStr
      ? valuesStr.split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""))
      : [];
    return { type: "enum", enumValues, nullable, optional };
  }

  // z.union([...])
  const unionMatch = baseSchema.match(/^z\.union\(\[(.+)\]\)/);
  if (unionMatch) {
    const innerContent = unionMatch[1];
    if (innerContent) {
      const unionTypes = splitTopLevel(innerContent, ",").map((s) =>
        parseZodSchema(s.trim(), ctx),
      );
      return { type: "union", unionTypes, nullable, optional };
    }
    return { type: "union", unionTypes: [], nullable, optional };
  }

  // z.object({...})
  const objectMatch = baseSchema.match(/^z\.object\(\{([\s\S]*)\}\)/);
  if (objectMatch) {
    const content = objectMatch[1]?.trim();
    if (!content) {
      return { type: "object", properties: {}, nullable, optional };
    }

    const properties: Record<string, ParsedZodSchema> = {};
    const propPairs = splitTopLevel(content, ",");

    for (const pair of propPairs) {
      const trimmed = pair.trim();
      if (!trimmed) continue;

      // Parse "propName: zodSchema" or '"prop-name": zodSchema'
      const colonIndex = findTopLevelColon(trimmed);
      if (colonIndex === -1) continue;

      let propName = trimmed.slice(0, colonIndex).trim();
      const propSchema = trimmed.slice(colonIndex + 1).trim();

      // Remove quotes from property name if present
      if (
        (propName.startsWith('"') && propName.endsWith('"')) ||
        (propName.startsWith("'") && propName.endsWith("'"))
      ) {
        propName = propName.slice(1, -1);
      }

      if (propName && propSchema) {
        properties[propName] = parseZodSchema(propSchema, ctx);
      }
    }

    return { type: "object", properties, nullable, optional };
  }

  // z.record(...)
  if (baseSchema.startsWith("z.record(")) {
    return { type: "object", properties: {}, nullable, optional };
  }

  // Fallback for unknown patterns
  return { type: "unknown", nullable, optional };
}

/**
 * Split a string by a delimiter, but only at the top level
 * (not inside nested brackets or parentheses)
 */
function splitTopLevel(str: string, delimiter: string): string[] {
  const results: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i] as string;
    const prevChar = str[i - 1];

    // Track string state
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Track bracket depth
    if (!inString) {
      if (char === "(" || char === "[" || char === "{") {
        depth++;
      } else if (char === ")" || char === "]" || char === "}") {
        depth--;
      }
    }

    // Check for delimiter at top level
    if (
      !inString &&
      depth === 0 &&
      str.slice(i, i + delimiter.length) === delimiter
    ) {
      results.push(current);
      current = "";
      i += delimiter.length - 1;
    } else {
      current += char;
    }
  }

  if (current) {
    results.push(current);
  }

  return results;
}

/**
 * Find the index of the first colon at the top level
 */
function findTopLevelColon(str: string): number {
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i] as string;
    const prevChar = str[i - 1];

    // Track string state
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Track bracket depth
    if (!inString) {
      if (char === "(" || char === "[" || char === "{") {
        depth++;
      } else if (char === ")" || char === "]" || char === "}") {
        depth--;
      }
    }

    // Found top-level colon
    if (!inString && depth === 0 && char === ":") {
      return i;
    }
  }

  return -1;
}

/**
 * Generate default values object code as a string
 * Used for code generation in form options
 */
export function generateDefaultValuesCode(
  zodSchema: string,
  ctx: DefaultGenContext,
  indent = "  ",
): string {
  const parsed = parseZodSchema(zodSchema, ctx);
  return generateCodeFromParsed(parsed, ctx, indent);
}

/**
 * Generate code string from a parsed schema
 */
function generateCodeFromParsed(
  parsed: ParsedZodSchema,
  ctx: DefaultGenContext,
  indent: string,
): string {
  // Handle nullable - return null
  if (parsed.nullable) {
    return "null";
  }

  // Handle optional - return undefined
  if (parsed.optional) {
    return "undefined";
  }

  switch (parsed.type) {
    case "string":
      return '""';

    case "number":
      return "0";

    case "boolean":
      return "false";

    case "array":
      return "[]";

    case "object": {
      if (!parsed.properties || Object.keys(parsed.properties).length === 0) {
        return "{}";
      }

      const entries = Object.entries(parsed.properties)
        .filter(([, propSchema]) => !propSchema.optional)
        .map(([key, propSchema]) => {
          const value = generateCodeFromParsed(propSchema, ctx, `${indent}  `);
          // Quote keys that need it
          const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
            ? key
            : `"${key}"`;
          return `${indent}  ${safeKey}: ${value}`;
        });

      if (entries.length === 0) {
        return "{}";
      }

      return `{\n${entries.join(",\n")},\n${indent}}`;
    }

    case "enum": {
      if (parsed.enumValues && parsed.enumValues.length > 0) {
        return `"${parsed.enumValues[0]}"`;
      }
      return "null";
    }

    case "union": {
      if (parsed.unionTypes && parsed.unionTypes.length > 0) {
        for (const unionType of parsed.unionTypes) {
          if (unionType.type !== "unknown") {
            return generateCodeFromParsed(unionType, ctx, indent);
          }
        }
      }
      return "null";
    }

    case "reference": {
      if (parsed.referenceName) {
        const refSchema = ctx.schemas.get(parsed.referenceName);
        if (refSchema) {
          const refParsed = parseZodSchema(refSchema, ctx);
          return generateCodeFromParsed(refParsed, ctx, indent);
        }
      }
      return "{}";
    }

    default:
      return "null";
  }
}
