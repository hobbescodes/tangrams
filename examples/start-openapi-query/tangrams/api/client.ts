/* eslint-disable */
/* OpenAPI Client - Generated once by tangrams. Customize as needed. */

import { createFetch } from "@better-fetch/fetch"

const baseURL = "http://localhost:3000/api"

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
		path = path.replace(`{${key}}`, String(value))
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
		.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
		.join("&")
}
