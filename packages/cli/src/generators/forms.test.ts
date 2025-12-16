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
      },
    ];

    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
    });

    expect(result.content).toContain("/* eslint-disable */");
    expect(result.content).toContain(
      'import { formOptions } from "@tanstack/react-form"',
    );
    expect(result.content).toContain(
      'import { createUserRequestSchema } from "./types"',
    );
    // Should import the type for type assertion
    expect(result.content).toContain(
      'import type { CreateUserRequest } from "./types"',
    );
    expect(result.content).toContain("export const createUserFormOptions");
    expect(result.content).toContain("defaultValues: {} as CreateUserRequest");
    expect(result.content).toContain("validators:");
    expect(result.content).toContain("onSubmitAsync: createUserRequestSchema");
    expect(result.warnings).toHaveLength(0);
  });

  it("generates form options for multiple mutations", () => {
    const mutations = [
      {
        operationId: "createUser",
        requestSchemaName: "createUserRequestSchema",
      },
      {
        operationId: "updateUser",
        requestSchemaName: "updateUserRequestSchema",
      },
    ];

    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
    });

    expect(result.content).toContain("createUserFormOptions");
    expect(result.content).toContain("updateUserFormOptions");
    expect(result.content).toContain(
      "import { createUserRequestSchema, updateUserRequestSchema }",
    );
    // Should import types for both mutations
    expect(result.content).toContain(
      "import type { CreateUserRequest, UpdateUserRequest }",
    );
  });

  it("returns empty file with warning when no mutations provided", () => {
    const result = generateFormOptionsCode([], {
      schemaImportPath: "./types",
    });

    expect(result.content).toContain("/* eslint-disable */");
    expect(result.content).toContain("No mutations with request bodies found");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No mutations found");
  });

  it("generates empty object as default values", () => {
    const mutations = [
      {
        operationId: "createPost",
        requestSchemaName: "createPostRequestSchema",
      },
    ];

    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "../schema/types",
    });

    expect(result.content).toContain("createPostFormOptions");
    expect(result.content).toContain(
      'import { createPostRequestSchema } from "../schema/types"',
    );
    expect(result.content).toContain("defaultValues: {} as CreatePostRequest");
    expect(result.warnings).toHaveLength(0);
  });

  it("generates proper camelCase form option names", () => {
    const mutations = [
      {
        operationId: "CreateNewUser",
        requestSchemaName: "createNewUserRequestSchema",
      },
    ];

    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
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

describe("generateFormOptionsCode with validator config", () => {
  const mutations = [
    {
      operationId: "createUser",
      requestSchemaName: "createUserRequestSchema",
    },
  ];

  it("uses onSubmitAsync by default", () => {
    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
    });

    expect(result.content).toContain("onSubmitAsync: createUserRequestSchema");
    expect(result.content).not.toContain("revalidateLogic");
    expect(result.content).not.toContain("validationLogic:");
  });

  it("uses onChange validator when configured", () => {
    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      formOverrides: { validator: "onChange" },
    });

    expect(result.content).toContain("onChange: createUserRequestSchema");
    expect(result.content).not.toContain("onSubmitAsync");
  });

  it("uses onChangeAsync validator when configured", () => {
    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      formOverrides: { validator: "onChangeAsync" },
    });

    expect(result.content).toContain("onChangeAsync: createUserRequestSchema");
  });

  it("uses onBlur validator when configured", () => {
    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      formOverrides: { validator: "onBlur" },
    });

    expect(result.content).toContain("onBlur: createUserRequestSchema");
  });

  it("uses onBlurAsync validator when configured", () => {
    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      formOverrides: { validator: "onBlurAsync" },
    });

    expect(result.content).toContain("onBlurAsync: createUserRequestSchema");
  });

  it("uses onSubmit validator when configured", () => {
    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      formOverrides: { validator: "onSubmit" },
    });

    expect(result.content).toContain("onSubmit: createUserRequestSchema");
    expect(result.content).not.toContain("onSubmitAsync");
  });

  it("uses onDynamic validator with revalidateLogic", () => {
    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      formOverrides: { validator: "onDynamic" },
    });

    expect(result.content).toContain(
      'import { formOptions, revalidateLogic } from "@tanstack/react-form"',
    );
    expect(result.content).toContain("onDynamic: createUserRequestSchema");
    expect(result.content).toContain(
      'validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" })',
    );
  });

  it("uses custom validationLogic modes for onDynamic", () => {
    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      formOverrides: {
        validator: "onDynamic",
        validationLogic: { mode: "blur", modeAfterSubmission: "blur" },
      },
    });

    expect(result.content).toContain(
      'validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "blur" })',
    );
  });

  it("warns when validationLogic is set but validator is not onDynamic", () => {
    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      formOverrides: {
        validator: "onChangeAsync",
        validationLogic: { mode: "blur", modeAfterSubmission: "change" },
      },
    });

    expect(result.content).toContain("onChangeAsync: createUserRequestSchema");
    expect(result.content).not.toContain("validationLogic:");
    expect(result.content).not.toContain("revalidateLogic");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      'validationLogic is only used with "onDynamic" validator',
    );
  });

  it("does not import revalidateLogic when not using onDynamic", () => {
    const result = generateFormOptionsCode(mutations, {
      schemaImportPath: "./types",
      formOverrides: { validator: "onBlurAsync" },
    });

    expect(result.content).toContain(
      'import { formOptions } from "@tanstack/react-form"',
    );
    expect(result.content).not.toContain("revalidateLogic");
  });
});
