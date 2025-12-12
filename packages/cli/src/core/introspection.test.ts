import { GraphQLSchema, getIntrospectionQuery, graphqlSync } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { testSchema } from "../test/fixtures/schema";
import { introspectSchema } from "./introspection";

const testGraphQLEndpoint = "http://localhost:4000/graphql";

/**
 * Generate introspection result from our test schema
 */
function getIntrospectionResult() {
  const result = graphqlSync({
    schema: testSchema,
    source: getIntrospectionQuery(),
  });
  return result;
}

describe("introspectSchema", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a GraphQLSchema on successful introspection", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => getIntrospectionResult(),
    } as Response);

    const schema = await introspectSchema({ url: testGraphQLEndpoint });

    expect(schema).toBeInstanceOf(GraphQLSchema);
  });

  it("includes expected types from the schema", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => getIntrospectionResult(),
    } as Response);

    const schema = await introspectSchema({ url: testGraphQLEndpoint });

    // Check for types defined in our test schema
    expect(schema.getType("User")).toBeDefined();
    expect(schema.getType("Post")).toBeDefined();
    expect(schema.getType("CreateUserInput")).toBeDefined();
    expect(schema.getType("UserRole")).toBeDefined();
  });

  it("includes query and mutation types", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => getIntrospectionResult(),
    } as Response);

    const schema = await introspectSchema({ url: testGraphQLEndpoint });

    expect(schema.getQueryType()).toBeDefined();
    expect(schema.getMutationType()).toBeDefined();
  });

  it("throws on HTTP error response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    await expect(
      introspectSchema({ url: testGraphQLEndpoint }),
    ).rejects.toThrow("Failed to introspect schema: 500 Internal Server Error");
  });

  it("throws on 404 response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    await expect(
      introspectSchema({ url: testGraphQLEndpoint }),
    ).rejects.toThrow("Failed to introspect schema: 404 Not Found");
  });

  it("throws when GraphQL returns errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errors: [{ message: "Schema introspection is disabled" }],
      }),
    } as Response);

    await expect(
      introspectSchema({ url: testGraphQLEndpoint }),
    ).rejects.toThrow(
      "GraphQL introspection errors: Schema introspection is disabled",
    );
  });

  it("throws when GraphQL returns multiple errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errors: [{ message: "Error one" }, { message: "Error two" }],
      }),
    } as Response);

    await expect(
      introspectSchema({ url: testGraphQLEndpoint }),
    ).rejects.toThrow("GraphQL introspection errors: Error one, Error two");
  });

  it("throws when response has no data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    await expect(
      introspectSchema({ url: testGraphQLEndpoint }),
    ).rejects.toThrow("No data returned from introspection query");
  });

  it("passes custom headers to the request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => getIntrospectionResult(),
    } as Response);

    await introspectSchema({
      url: testGraphQLEndpoint,
      headers: {
        "x-api-key": "test-api-key",
        Authorization: "Bearer test-token",
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      testGraphQLEndpoint,
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "test-api-key",
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });
});
