import { describe, expect, it } from "vitest";

import { generateClient } from "./client";

describe("generateClient", () => {
  it("generates a client file with the correct endpoint", () => {
    const result = generateClient({ url: "http://localhost:4000/graphql" });

    expect(result).toContain("http://localhost:4000/graphql");
  });

  it("includes GraphQLClient import", () => {
    const result = generateClient({ url: "http://localhost:4000/graphql" });

    expect(result).toContain('import { GraphQLClient } from "graphql-request"');
  });

  it("exports getClient function", () => {
    const result = generateClient({ url: "http://localhost:4000/graphql" });

    expect(result).toContain("export const getClient");
  });

  it("includes async getClient function", () => {
    const result = generateClient({ url: "http://localhost:4000/graphql" });

    expect(result).toContain("async");
  });

  it("includes eslint-disable comment", () => {
    const result = generateClient({ url: "http://localhost:4000/graphql" });

    expect(result).toContain("/* eslint-disable */");
  });

  it("includes auto-generated comment", () => {
    const result = generateClient({ url: "http://localhost:4000/graphql" });

    expect(result).toContain("Generated once by tangrams");
  });

  it("matches snapshot for standard endpoint", () => {
    const result = generateClient({ url: "http://localhost:4000/graphql" });

    expect(result).toMatchSnapshot();
  });

  it("matches snapshot for production endpoint", () => {
    const result = generateClient({ url: "https://api.example.com/graphql" });

    expect(result).toMatchSnapshot();
  });
});
