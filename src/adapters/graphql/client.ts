/**
 * GraphQL client generation
 */
import { isUrlSchemaConfig } from "./schema";

import type { GraphQLSourceConfig } from "@/core/config";
import type { GeneratedFile, GraphQLAdapterSchema } from "../types";

/**
 * Generate the GraphQL client file
 */
export function generateGraphQLClient(
  _schema: GraphQLAdapterSchema,
  config: GraphQLSourceConfig,
): GeneratedFile {
  // For URL-based schemas, use the configured URL
  // For file-based schemas, use a placeholder that the user must configure
  const endpoint = isUrlSchemaConfig(config.schema)
    ? config.schema.url
    : "YOUR_GRAPHQL_ENDPOINT";

  const endpointComment = isUrlSchemaConfig(config.schema)
    ? ""
    : " // TODO: Set your GraphQL endpoint URL";

  const content = `/* eslint-disable */
/* GraphQL Client - Generated once by tangen. Customize as needed. */

import { GraphQLClient } from "graphql-request"

const endpoint = "${endpoint}"${endpointComment}

/**
 * Returns a GraphQL client instance.
 * Customize this function to add dynamic headers (e.g., auth tokens).
 */
export const getClient = async () => {
	return new GraphQLClient(endpoint, {
		headers: {
			// Add your headers here
		},
	})
}
`;

  return {
    filename: "client.ts",
    content,
  };
}
