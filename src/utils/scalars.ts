/**
 * Default scalar mappings from GraphQL to TypeScript
 */
export const DEFAULT_SCALARS: Record<string, string> = {
  ID: "string",
  String: "string",
  Int: "number",
  Float: "number",
  Boolean: "boolean",
  DateTime: "string",
  Date: "string",
  Time: "string",
  JSON: "unknown",
  JSONObject: "Record<string, unknown>",
  BigInt: "bigint",
  UUID: "string",
};

/**
 * Merge user-defined scalars with defaults
 */
export function resolveScalars(
  userScalars?: Record<string, string>,
): Record<string, string> {
  return {
    ...DEFAULT_SCALARS,
    ...userScalars,
  };
}
