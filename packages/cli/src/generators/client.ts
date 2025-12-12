export interface ClientGeneratorOptions {
  url: string;
}

/**
 * Generate the GraphQL client file
 */
export function generateClient(options: ClientGeneratorOptions): string {
  const { url } = options;

  return `/* eslint-disable */
/* GraphQL Client - Generated once by tangrams. Customize as needed. */

import { GraphQLClient } from "graphql-request"

const endpoint = "${url}"

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
}
