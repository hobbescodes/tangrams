import { relative } from "node:path";

/**
 * Calculate a relative import path between two file paths.
 * Handles the edge case where path.relative returns a path starting with ".."
 * to avoid generating "./../" patterns.
 *
 * @param fromDir - The directory of the importing file
 * @param toFile - The file being imported
 * @returns A properly formatted relative import path (without .ts extension)
 *
 * @example
 * // Same directory
 * getRelativeImportPath("/src/api", "/src/api/client.ts") // "./client"
 *
 * // Parent directory
 * getRelativeImportPath("/src/api/query", "/src/api/schema.ts") // "../schema"
 *
 * // Sibling directory
 * getRelativeImportPath("/src/api/query", "/src/api/form/options.ts") // "../form/options"
 */
export function getRelativeImportPath(fromDir: string, toFile: string): string {
  const rel = relative(fromDir, toFile).replace(/\.ts$/, "");
  // Only prepend ./ if it doesn't already start with a dot (same-dir or child import)
  if (!rel.startsWith(".")) {
    return "./" + rel;
  }
  return rel;
}
