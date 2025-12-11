import { buildClientSchema, getIntrospectionQuery } from "graphql";

import type { GraphQLSchema, IntrospectionQuery } from "graphql";

export interface IntrospectionOptions {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Fetch the GraphQL schema via introspection query
 */
export async function introspectSchema(
  options: IntrospectionOptions,
): Promise<GraphQLSchema> {
  const { url, headers } = options;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      query: getIntrospectionQuery(),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to introspect schema: ${response.status} ${response.statusText}`,
    );
  }

  const result = (await response.json()) as {
    data?: IntrospectionQuery;
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    const messages = result.errors.map((e) => e.message).join(", ");
    throw new Error(`GraphQL introspection errors: ${messages}`);
  }

  if (!result.data) {
    throw new Error("No data returned from introspection query");
  }

  return buildClientSchema(result.data);
}
