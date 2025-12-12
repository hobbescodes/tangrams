/**
 * GraphQL schema loading - supports both URL introspection and local file loading
 */

import { readFile } from "node:fs/promises";

import fg from "fast-glob";
import { buildSchema } from "graphql";

import type { GraphQLSchema } from "graphql";
import type {
  GraphQLSchemaConfig,
  GraphQLSchemaFileConfig,
  GraphQLSchemaUrlConfig,
} from "@/core/config";

// Re-export introspection for URL-based schema loading
export {
  type IntrospectionOptions,
  introspectSchema,
} from "@/core/introspection";

/**
 * Type guard to check if schema config is URL-based
 */
export function isUrlSchemaConfig(
  schema: GraphQLSchemaConfig,
): schema is GraphQLSchemaUrlConfig {
  return "url" in schema;
}

/**
 * Type guard to check if schema config is file-based
 */
export function isFileSchemaConfig(
  schema: GraphQLSchemaConfig,
): schema is GraphQLSchemaFileConfig {
  return "file" in schema;
}

/**
 * Load and build a GraphQL schema from local SDL file(s)
 *
 * @param patterns - Glob pattern(s) for .graphql schema files
 * @returns The built GraphQL schema
 * @throws Error if no files match or if schema building fails
 */
export async function loadSchemaFromFiles(
  patterns: string | string[],
): Promise<GraphQLSchema> {
  const patternList = Array.isArray(patterns) ? patterns : [patterns];

  // Find all matching .graphql files
  const files = await fg(patternList, {
    absolute: true,
    onlyFiles: true,
  });

  if (files.length === 0) {
    throw new Error(
      `No GraphQL schema files found matching: ${patternList.join(", ")}`,
    );
  }

  // Sort files for consistent ordering (helps with reproducible builds)
  files.sort();

  // Read all files
  const sdlParts = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(file, "utf-8");
      return content;
    }),
  );

  // Concatenate all SDL parts with newlines
  const sdl = sdlParts.join("\n\n");

  try {
    return buildSchema(sdl);
  } catch (error) {
    // Provide detailed error message with file context
    const fileList = files.map((f) => `  - ${f}`).join("\n");
    const errorMessage = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Failed to build GraphQL schema from files:\n${fileList}\n\nError: ${errorMessage}`,
    );
  }
}
