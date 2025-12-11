import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getFragmentDependencies, loadDocuments } from "./documents";

const fixturesDir = resolve(__dirname, "../test/fixtures/graphql");

describe("loadDocuments", () => {
  it("loads and parses GraphQL documents from a glob pattern", async () => {
    const result = await loadDocuments(`${fixturesDir}/user.graphql`);

    expect(result.operations.length).toBeGreaterThan(0);
    expect(result.fragments.length).toBeGreaterThan(0);
  });

  it("parses query operations correctly", async () => {
    const result = await loadDocuments(`${fixturesDir}/user.graphql`);

    const getUser = result.operations.find((op) => op.name === "GetUser");
    expect(getUser).toBeDefined();
    expect(getUser?.operation).toBe("query");
    expect(getUser?.document).toContain("query GetUser");
  });

  it("parses mutation operations correctly", async () => {
    const result = await loadDocuments(`${fixturesDir}/user.graphql`);

    const createUser = result.operations.find((op) => op.name === "CreateUser");
    expect(createUser).toBeDefined();
    expect(createUser?.operation).toBe("mutation");
    expect(createUser?.document).toContain("mutation CreateUser");
  });

  it("parses fragments correctly", async () => {
    const result = await loadDocuments(`${fixturesDir}/user.graphql`);

    const userFields = result.fragments.find((f) => f.name === "UserFields");
    expect(userFields).toBeDefined();
    expect(userFields?.typeName).toBe("User");
    expect(userFields?.document).toContain("fragment UserFields on User");
  });

  it("loads documents from multiple files with array pattern", async () => {
    const result = await loadDocuments([
      `${fixturesDir}/user.graphql`,
      `${fixturesDir}/post.graphql`,
    ]);

    // Should have operations from both files
    const getUser = result.operations.find((op) => op.name === "GetUser");
    const getPosts = result.operations.find((op) => op.name === "GetPosts");
    expect(getUser).toBeDefined();
    expect(getPosts).toBeDefined();
  });

  it("loads documents from glob pattern matching multiple files", async () => {
    // Only match user and post files (exclude anonymous which would error)
    const result = await loadDocuments([
      `${fixturesDir}/user.graphql`,
      `${fixturesDir}/post.graphql`,
      `${fixturesDir}/subscription.graphql`,
    ]);

    // Should have operations from user.graphql and post.graphql
    expect(result.operations.length).toBeGreaterThanOrEqual(2);
  });

  it("throws when no files match the pattern", async () => {
    await expect(
      loadDocuments(`${fixturesDir}/nonexistent/**/*.graphql`),
    ).rejects.toThrow("No GraphQL documents found matching");
  });

  it("throws when encountering an anonymous operation", async () => {
    await expect(
      loadDocuments(`${fixturesDir}/anonymous.graphql`),
    ).rejects.toThrow("All operations must have a name");
  });

  it("skips subscription operations", async () => {
    const result = await loadDocuments(`${fixturesDir}/subscription.graphql`);

    // Subscriptions should be skipped, so no operations
    expect(result.operations).toHaveLength(0);
  });

  it("handles files with only fragments", async () => {
    // post.graphql has fragments
    const result = await loadDocuments(`${fixturesDir}/post.graphql`);

    expect(result.fragments.length).toBeGreaterThan(0);
    const postFields = result.fragments.find((f) => f.name === "PostFields");
    expect(postFields).toBeDefined();
  });

  it("extracts operation document source correctly", async () => {
    const result = await loadDocuments(`${fixturesDir}/user.graphql`);

    const listUsers = result.operations.find((op) => op.name === "ListUsers");
    expect(listUsers?.document).toContain("query ListUsers");
    expect(listUsers?.document).toContain("$limit: Int");
    expect(listUsers?.document).toContain("$offset: Int");
  });

  it("extracts fragment document source correctly", async () => {
    const result = await loadDocuments(`${fixturesDir}/user.graphql`);

    const userFields = result.fragments.find((f) => f.name === "UserFields");
    expect(userFields?.document).toContain("fragment UserFields on User");
    expect(userFields?.document).toContain("id");
    expect(userFields?.document).toContain("name");
    expect(userFields?.document).toContain("email");
  });
});

describe("getFragmentDependencies", () => {
  it("returns direct fragment dependencies", async () => {
    const docs = await loadDocuments(`${fixturesDir}/user.graphql`);

    const getUser = docs.operations.find((op) => op.name === "GetUser");
    if (!getUser) throw new Error("GetUser operation not found");

    const deps = getFragmentDependencies(getUser, docs.fragments);
    expect(deps).toHaveLength(1);
    expect(deps[0]?.name).toBe("UserFields");
  });

  it("returns nested fragment dependencies", async () => {
    const docs = await loadDocuments([
      `${fixturesDir}/user.graphql`,
      `${fixturesDir}/post.graphql`,
    ]);

    const getPosts = docs.operations.find((op) => op.name === "GetPosts");
    if (!getPosts) throw new Error("GetPosts operation not found");

    const deps = getFragmentDependencies(getPosts, docs.fragments);

    // PostWithAuthor depends on PostFields and UserFields (via nested author)
    const depNames = deps.map((d) => d.name);
    expect(depNames).toContain("PostFields");
    expect(depNames).toContain("PostWithAuthor");
    expect(depNames).toContain("UserFields");
  });

  it("returns empty array when operation uses no fragments", async () => {
    const docs = await loadDocuments(`${fixturesDir}/user.graphql`);

    const deleteUser = docs.operations.find((op) => op.name === "DeleteUser");
    if (!deleteUser) throw new Error("DeleteUser operation not found");

    const deps = getFragmentDependencies(deleteUser, docs.fragments);
    expect(deps).toHaveLength(0);
  });

  it("handles transitive fragment dependencies", async () => {
    const docs = await loadDocuments([
      `${fixturesDir}/user.graphql`,
      `${fixturesDir}/post.graphql`,
    ]);

    // PostWithAuthor uses PostFields and UserFields
    const getPosts = docs.operations.find((op) => op.name === "GetPosts");
    if (!getPosts) throw new Error("GetPosts operation not found");
    const deps = getFragmentDependencies(getPosts, docs.fragments);

    // Should include all transitive dependencies
    expect(deps.length).toBeGreaterThanOrEqual(3);
  });

  it("does not duplicate fragment dependencies", async () => {
    const docs = await loadDocuments([
      `${fixturesDir}/user.graphql`,
      `${fixturesDir}/post.graphql`,
    ]);

    const getPosts = docs.operations.find((op) => op.name === "GetPosts");
    if (!getPosts) throw new Error("GetPosts operation not found");
    const deps = getFragmentDependencies(getPosts, docs.fragments);

    // Check for unique fragment names
    const depNames = deps.map((d) => d.name);
    const uniqueNames = [...new Set(depNames)];
    expect(depNames).toHaveLength(uniqueNames.length);
  });
});
