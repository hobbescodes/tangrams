/**
 * GraphQL operations generation
 * Wraps the existing operations generator with the adapter interface
 */
import { generateOperations as generateOperationsCore } from "@/generators/operations";

import type { GraphQLSourceConfig } from "@/core/config";
import type {
  GeneratedFile,
  GraphQLAdapterSchema,
  OperationGenOptions,
} from "../types";

/**
 * Generate TanStack Query operation helpers from GraphQL documents
 */
export function generateGraphQLOperations(
  schema: GraphQLAdapterSchema,
  _config: GraphQLSourceConfig,
  options: OperationGenOptions,
): GeneratedFile {
  const content = generateOperationsCore({
    documents: schema.documents,
    clientImportPath: options.clientImportPath,
    typesImportPath: options.typesImportPath,
    sourceName: options.sourceName,
  });

  return {
    filename: "operations.ts",
    content,
  };
}
