import { describe, expect, it } from "vitest";

import {
  toCamelCase,
  toDocumentName,
  toFragmentDocName,
  toFragmentTypeName,
  toMutationOptionsName,
  toMutationTypeName,
  toMutationVariablesTypeName,
  toPascalCase,
  toQueryOptionsName,
  toQueryTypeName,
  toQueryVariablesTypeName,
} from "./naming";

describe("toPascalCase", () => {
  it("converts kebab-case to PascalCase", () => {
    expect(toPascalCase("get-user")).toBe("GetUser");
  });

  it("converts snake_case to PascalCase", () => {
    expect(toPascalCase("get_user")).toBe("GetUser");
  });

  it("converts camelCase to PascalCase", () => {
    expect(toPascalCase("getUser")).toBe("GetUser");
  });

  it("handles already PascalCase strings", () => {
    expect(toPascalCase("GetUser")).toBe("GetUser");
  });

  it("handles single word", () => {
    expect(toPascalCase("user")).toBe("User");
  });

  it("handles multiple separators", () => {
    expect(toPascalCase("get-user_data")).toBe("GetUserData");
  });
});

describe("toCamelCase", () => {
  it("converts PascalCase to camelCase", () => {
    expect(toCamelCase("GetUser")).toBe("getUser");
  });

  it("converts kebab-case to camelCase", () => {
    expect(toCamelCase("get-user")).toBe("getUser");
  });

  it("converts snake_case to camelCase", () => {
    expect(toCamelCase("get_user")).toBe("getUser");
  });

  it("handles already camelCase strings", () => {
    expect(toCamelCase("getUser")).toBe("getUser");
  });

  it("handles single word", () => {
    expect(toCamelCase("User")).toBe("user");
  });
});

describe("toQueryOptionsName", () => {
  it("converts operation name to queryOptions function name", () => {
    expect(toQueryOptionsName("GetUser")).toBe("getUserQueryOptions");
  });

  it("handles already camelCase input", () => {
    expect(toQueryOptionsName("getUser")).toBe("getUserQueryOptions");
  });

  it("handles complex names", () => {
    expect(toQueryOptionsName("ListAllUsers")).toBe("listAllUsersQueryOptions");
  });
});

describe("toMutationOptionsName", () => {
  it("converts operation name to mutationOptions function name", () => {
    expect(toMutationOptionsName("CreateUser")).toBe(
      "createUserMutationOptions",
    );
  });

  it("handles complex names", () => {
    expect(toMutationOptionsName("UpdateUserProfile")).toBe(
      "updateUserProfileMutationOptions",
    );
  });
});

describe("toDocumentName", () => {
  it("converts operation name to document constant name", () => {
    expect(toDocumentName("GetUser")).toBe("GetUserDocument");
  });

  it("converts camelCase to PascalCase document name", () => {
    expect(toDocumentName("getUser")).toBe("GetUserDocument");
  });
});

describe("toFragmentDocName", () => {
  it("converts fragment name to fragment document constant name", () => {
    expect(toFragmentDocName("UserFields")).toBe("UserFieldsFragmentDoc");
  });

  it("handles lowercase input", () => {
    expect(toFragmentDocName("userFields")).toBe("UserFieldsFragmentDoc");
  });
});

describe("toQueryTypeName", () => {
  it("converts operation name to query type name", () => {
    expect(toQueryTypeName("GetUser")).toBe("GetUserQuery");
  });

  it("handles complex names", () => {
    expect(toQueryTypeName("ListAllActiveUsers")).toBe(
      "ListAllActiveUsersQuery",
    );
  });
});

describe("toMutationTypeName", () => {
  it("converts operation name to mutation type name", () => {
    expect(toMutationTypeName("CreateUser")).toBe("CreateUserMutation");
  });

  it("handles complex names", () => {
    expect(toMutationTypeName("DeleteUserAccount")).toBe(
      "DeleteUserAccountMutation",
    );
  });
});

describe("toQueryVariablesTypeName", () => {
  it("converts operation name to query variables type name", () => {
    expect(toQueryVariablesTypeName("GetUser")).toBe("GetUserQueryVariables");
  });

  it("handles complex names", () => {
    expect(toQueryVariablesTypeName("SearchUsers")).toBe(
      "SearchUsersQueryVariables",
    );
  });
});

describe("toMutationVariablesTypeName", () => {
  it("converts operation name to mutation variables type name", () => {
    expect(toMutationVariablesTypeName("CreateUser")).toBe(
      "CreateUserMutationVariables",
    );
  });

  it("handles complex names", () => {
    expect(toMutationVariablesTypeName("BulkUpdateUsers")).toBe(
      "BulkUpdateUsersMutationVariables",
    );
  });
});

describe("toFragmentTypeName", () => {
  it("converts fragment name to fragment type name", () => {
    expect(toFragmentTypeName("UserFields")).toBe("UserFieldsFragment");
  });

  it("handles lowercase input", () => {
    expect(toFragmentTypeName("postData")).toBe("PostDataFragment");
  });
});
