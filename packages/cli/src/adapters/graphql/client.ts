/**
 * GraphQL client generation
 */
import { formatUrlForClient } from "@/utils/url";
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
  // Priority: config.url > schema.url (for URL-based schemas)
  // For file-based schemas, config.url is required (enforced by validation)
  let url: string;
  if (config.url) {
    url = config.url;
  } else if (isUrlSchemaConfig(config.schema)) {
    url = config.schema.url;
  } else {
    // This should never happen due to config validation, but safety net
    throw new Error("GraphQL endpoint URL is required for file-based schemas");
  }

  const formattedUrl = formatUrlForClient(url);

  const content = `/* eslint-disable */
/* GraphQL Client - Generated once by tangrams. Customize as needed. */

import { GraphQLClient } from "graphql-request"

const endpoint = ${formattedUrl}

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
