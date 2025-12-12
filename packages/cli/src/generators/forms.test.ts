import { describe, expect, it } from "vitest";

import {
  filterGraphQLMutations,
  filterOpenAPIMutations,
  generateFormOptionsCode,
  getGraphQLInputSchemaName,
  getOpenAPIRequestSchemaName,
} from "./forms";

describe("generateFormOptionsCode", () => {
  it("generates form options for mutations", () => {
    const mutations = [
      {
        operationId: "createUser",
        requestSchemaName: "createUserRequestSchema",
        requestSchemaCode: `z.object({
  name: z.string(),
  email: z.string()
})`,
      },
    ];

    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      allSchemas: [
        "export const createUserRequestSchema = z.object({ name: z.string(), email: z.string() })",
      ],
    });

    expect(result.content).toContain("/* eslint-disable */");
    expect(result.content).toContain(
      'import { formOptions } from "@tanstack/react-form"',
    );
    expect(result.content).toContain(
      'import { createUserRequestSchema } from "./types"',
    );
    expect(result.content).toContain("export const createUserFormOptions");
    expect(result.content).toContain("defaultValues:");
    expect(result.content).toContain("validators:");
    expect(result.content).toContain("onSubmitAsync: createUserRequestSchema");
    expect(result.warnings).toHaveLength(0);
  });

  it("generates form options for multiple mutations", () => {
    const mutations = [
      {
        operationId: "createUser",
        requestSchemaName: "createUserRequestSchema",
        requestSchemaCode: "z.object({ name: z.string() })",
      },
      {
        operationId: "updateUser",
        requestSchemaName: "updateUserRequestSchema",
        requestSchemaCode: "z.object({ id: z.string(), name: z.string() })",
      },
    ];

    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      allSchemas: [],
    });

    expect(result.content).toContain("createUserFormOptions");
    expect(result.content).toContain("updateUserFormOptions");
    expect(result.content).toContain(
      "import { createUserRequestSchema, updateUserRequestSchema }",
    );
  });

  it("returns empty file with warning when no mutations provided", () => {
    const result = generateFormOptionsCode([], {
      schemaImportPath: "./types",
      allSchemas: [],
    });

    expect(result.content).toContain("/* eslint-disable */");
    expect(result.content).toContain("No mutations with request bodies found");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No mutations found");
  });

  it("handles complex nested object schemas for default values", () => {
    const mutations = [
      {
        operationId: "createPost",
        requestSchemaName: "createPostRequestSchema",
        requestSchemaCode: `z.object({
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string())
})`,
      },
    ];

    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "../schema/types",
      allSchemas: [],
    });

    expect(result.content).toContain("createPostFormOptions");
    expect(result.content).toContain(
      'import { createPostRequestSchema } from "../schema/types"',
    );
    expect(result.warnings).toHaveLength(0);
  });

  it("handles unknown schema types gracefully", () => {
    const mutations = [
      {
        operationId: "createItem",
        requestSchemaName: "createItemRequestSchema",
        // Unknown/unrecognized schema code
        requestSchemaCode: "z.unknown()",
      },
    ];

    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      allSchemas: [],
    });

    // Should still generate form options with null default values for unknown types
    expect(result.content).toContain("createItemFormOptions");
    expect(result.content).toContain("defaultValues: null");
    expect(result.warnings).toHaveLength(0);
  });

  it("generates proper camelCase form option names", () => {
    const mutations = [
      {
        operationId: "CreateNewUser",
        requestSchemaName: "createNewUserRequestSchema",
        requestSchemaCode: "z.object({ name: z.string() })",
      },
    ];

    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      allSchemas: [],
    });

    expect(result.content).toContain("createNewUserFormOptions");
  });
});

describe("filterOpenAPIMutations", () => {
  it("filters POST operations with request bodies", () => {
    const operations = [
      { operationId: "createUser", method: "post", requestBody: {} },
      { operationId: "getUsers", method: "get" },
      { operationId: "deleteUser", method: "delete" },
    ];

    const result = filterOpenAPIMutations(operations);

    expect(result).toEqual(["createUser"]);
  });

  it("filters PUT and PATCH operations with request bodies", () => {
    const operations = [
      { operationId: "updateUser", method: "put", requestBody: {} },
      { operationId: "patchUser", method: "patch", requestBody: {} },
      { operationId: "getUser", method: "get" },
    ];

    const result = filterOpenAPIMutations(operations);

    expect(result).toEqual(["updateUser", "patchUser"]);
  });

  it("excludes mutations without request bodies", () => {
    const operations = [
      { operationId: "createUser", method: "post", requestBody: {} },
      { operationId: "triggerAction", method: "post" }, // no request body
    ];

    const result = filterOpenAPIMutations(operations);

    expect(result).toEqual(["createUser"]);
  });

  it("returns empty array when no mutations", () => {
    const operations = [
      { operationId: "getUsers", method: "get" },
      { operationId: "getUser", method: "get" },
    ];

    const result = filterOpenAPIMutations(operations);

    expect(result).toEqual([]);
  });
});

describe("filterGraphQLMutations", () => {
  it("filters mutation operations", () => {
    const operations = [
      { name: "CreateUser", operation: "mutation" as const },
      { name: "GetUsers", operation: "query" as const },
      { name: "UserSubscription", operation: "subscription" as const },
    ];

    const result = filterGraphQLMutations(operations);

    expect(result).toEqual(["CreateUser"]);
  });

  it("returns multiple mutations", () => {
    const operations = [
      { name: "CreateUser", operation: "mutation" as const },
      { name: "UpdateUser", operation: "mutation" as const },
      { name: "GetUsers", operation: "query" as const },
    ];

    const result = filterGraphQLMutations(operations);

    expect(result).toEqual(["CreateUser", "UpdateUser"]);
  });

  it("returns empty array when no mutations", () => {
    const operations = [
      { name: "GetUsers", operation: "query" as const },
      { name: "GetUser", operation: "query" as const },
    ];

    const result = filterGraphQLMutations(operations);

    expect(result).toEqual([]);
  });
});

describe("getOpenAPIRequestSchemaName", () => {
  it("converts operationId to request schema name", () => {
    expect(getOpenAPIRequestSchemaName("createUser")).toBe(
      "createUserRequestSchema",
    );
    expect(getOpenAPIRequestSchemaName("updatePost")).toBe(
      "updatePostRequestSchema",
    );
  });

  it("handles already PascalCase operationId", () => {
    expect(getOpenAPIRequestSchemaName("CreateUser")).toBe(
      "createUserRequestSchema",
    );
  });
});

describe("getGraphQLInputSchemaName", () => {
  it("converts input type name to schema name", () => {
    expect(getGraphQLInputSchemaName("CreateUserInput")).toBe(
      "createUserInputSchema",
    );
    expect(getGraphQLInputSchemaName("UpdatePostInput")).toBe(
      "updatePostInputSchema",
    );
  });
});
