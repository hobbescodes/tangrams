/**
 * OpenAPI client generation
 * Generates a better-fetch client for OpenAPI endpoints
 */
import { formatUrlForClient } from "@/utils/url";

import type { OpenAPISourceConfig } from "@/core/config";
import type { GeneratedFile, OpenAPIAdapterSchema } from "../types";

/**
 * Generate the OpenAPI client file using better-fetch
 */
export function generateOpenAPIClient(
  schema: OpenAPIAdapterSchema,
  config: OpenAPISourceConfig,
): GeneratedFile {
  // Priority: config.baseUrl > schema.baseUrl (from spec)
  const url = config.baseUrl ?? schema.baseUrl;

  if (!url) {
    throw new Error(
      "baseUrl is required: OpenAPI spec has no servers defined. " +
        "Add a 'baseUrl' field to your source config.",
    );
  }

  const formattedUrl = formatUrlForClient(url);

  const content = `/* eslint-disable */
/* OpenAPI Client - Generated once by tangrams. Customize as needed. */

import { createFetch } from "@better-fetch/fetch"

const baseURL = ${formattedUrl}

/**
 * Returns a configured fetch client.
 * Customize this function to add dynamic headers (e.g., auth tokens).
 */
export const getClient = async () => {
	return createFetch({
		baseURL,
		headers: {
			// Add your headers here
		},
	})
}

/**
 * Helper to build URL paths with path parameters.
 * @param template - URL template with {param} placeholders
 * @param params - Object with parameter values
 * @returns URL with parameters substituted
 *
 * @example
 * buildPath("/users/{id}", { id: "123" }) // "/users/123"
 */
export function buildPath(
	template: string,
	params: Record<string, string | number>,
): string {
	let path = template
	for (const [key, value] of Object.entries(params)) {
		path = path.replace(\`{\${key}}\`, String(value))
	}
	return path
}

/**
 * Helper to build query string from params object.
 * @param params - Query parameters object
 * @returns Query string (without leading ?)
 *
 * @example
 * buildQuery({ page: 1, limit: 10 }) // "page=1&limit=10"
 */
export function buildQuery(
	params: Record<string, string | number | boolean | null | undefined>,
): string {
	const entries = Object.entries(params).filter(
		([, v]) => v !== undefined && v !== null,
	)
	if (entries.length === 0) return ""
	return entries
		.map(([k, v]) => \`\${encodeURIComponent(k)}=\${encodeURIComponent(String(v))}\`)
		.join("&")
}
`;

  return {
    filename: "client.ts",
    content,
  };
}
