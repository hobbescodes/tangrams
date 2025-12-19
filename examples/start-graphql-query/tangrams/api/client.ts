/* eslint-disable */
/* GraphQL Client - Generated once by tangrams. Customize as needed. */

import { GraphQLClient } from "graphql-request"

const endpoint = "YOUR_GRAPHQL_ENDPOINT" // TODO: Set your GraphQL endpoint URL

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
