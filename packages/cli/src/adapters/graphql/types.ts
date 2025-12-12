/**
 * GraphQL type generation
 * Wraps the existing types generator with the adapter interface
 */
import { generateTypes as generateTypesCore } from "@/generators/types";

import type { GraphQLSourceConfig } from "@/core/config";
import type {
  GeneratedFile,
  GraphQLAdapterSchema,
  TypeGenOptions,
} from "../types";

/**
 * Generate TypeScript types from GraphQL schema and documents
 */
export function generateGraphQLTypes(
  schema: GraphQLAdapterSchema,
  _config: GraphQLSourceConfig,
  options: TypeGenOptions,
): GeneratedFile {
  const result = generateTypesCore({
    schema: schema.schema,
    documents: schema.documents,
    scalars: options.scalars,
  });

  return {
    filename: "types.ts",
    content: result.code,
    warnings: result.warnings,
  };
}
