import { describe, expect, it } from "vitest";

import {
  getSafePropertyName,
  isValidIdentifier,
  toCamelCase,
  toDocumentName,
  toFragmentDocName,
  toFragmentSchemaName,
  toFragmentTypeName,
  toMutationOptionsName,
  toMutationResponseSchemaName,
  toMutationResponseTypeName,
  toMutationTypeName,
  toMutationVariablesSchemaName,
  toMutationVariablesTypeName,
  toPascalCase,
  toQueryOptionsName,
  toQueryResponseSchemaName,
  toQueryResponseTypeName,
  toQueryTypeName,
  toQueryVariablesSchemaName,
  toQueryVariablesTypeName,
  toSchemaName,
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

// ============================================================================
// Response Type Names (aliases)
// ============================================================================

describe("toQueryResponseTypeName", () => {
  it("is an alias for toQueryTypeName", () => {
    expect(toQueryResponseTypeName("GetPets")).toBe("GetPetsQuery");
    expect(toQueryResponseTypeName("GetPets")).toBe(toQueryTypeName("GetPets"));
  });
});

describe("toMutationResponseTypeName", () => {
  it("is an alias for toMutationTypeName", () => {
    expect(toMutationResponseTypeName("CreatePet")).toBe("CreatePetMutation");
    expect(toMutationResponseTypeName("CreatePet")).toBe(
      toMutationTypeName("CreatePet"),
    );
  });
});

// ============================================================================
// Schema Naming Utilities
// ============================================================================

describe("toSchemaName", () => {
  it("converts type name to schema variable name", () => {
    expect(toSchemaName("User")).toBe("userSchema");
  });

  it("handles complex names", () => {
    expect(toSchemaName("CreateUserRequest")).toBe("createUserRequestSchema");
  });

  it("handles already lowercase first char", () => {
    expect(toSchemaName("user")).toBe("userSchema");
  });
});

describe("toQueryVariablesSchemaName", () => {
  it("converts operation name to query variables schema name", () => {
    expect(toQueryVariablesSchemaName("GetPets")).toBe(
      "getPetsQueryVariablesSchema",
    );
  });

  it("handles complex names", () => {
    expect(toQueryVariablesSchemaName("ListAllUsers")).toBe(
      "listAllUsersQueryVariablesSchema",
    );
  });
});

describe("toMutationVariablesSchemaName", () => {
  it("converts operation name to mutation variables schema name", () => {
    expect(toMutationVariablesSchemaName("CreatePet")).toBe(
      "createPetMutationVariablesSchema",
    );
  });

  it("handles complex names", () => {
    expect(toMutationVariablesSchemaName("UpdateUserProfile")).toBe(
      "updateUserProfileMutationVariablesSchema",
    );
  });
});

describe("toQueryResponseSchemaName", () => {
  it("converts operation name to query response schema name", () => {
    expect(toQueryResponseSchemaName("GetPets")).toBe("getPetsQuerySchema");
  });

  it("handles complex names", () => {
    expect(toQueryResponseSchemaName("ListAllUsers")).toBe(
      "listAllUsersQuerySchema",
    );
  });
});

describe("toMutationResponseSchemaName", () => {
  it("converts operation name to mutation response schema name", () => {
    expect(toMutationResponseSchemaName("CreatePet")).toBe(
      "createPetMutationSchema",
    );
  });

  it("handles complex names", () => {
    expect(toMutationResponseSchemaName("DeleteUserAccount")).toBe(
      "deleteUserAccountMutationSchema",
    );
  });
});

describe("toFragmentSchemaName", () => {
  it("converts fragment name to fragment schema name", () => {
    expect(toFragmentSchemaName("PetFields")).toBe("petFieldsFragmentSchema");
  });

  it("handles lowercase input", () => {
    expect(toFragmentSchemaName("userFields")).toBe("userFieldsFragmentSchema");
  });
});

// ============================================================================
// Property Naming Utilities
// ============================================================================

describe("isValidIdentifier", () => {
  it("returns true for valid identifiers", () => {
    expect(isValidIdentifier("foo")).toBe(true);
    expect(isValidIdentifier("_foo")).toBe(true);
    expect(isValidIdentifier("$foo")).toBe(true);
    expect(isValidIdentifier("foo123")).toBe(true);
    expect(isValidIdentifier("FOO_BAR")).toBe(true);
  });

  it("returns false for invalid identifiers", () => {
    expect(isValidIdentifier("123foo")).toBe(false);
    expect(isValidIdentifier("foo-bar")).toBe(false);
    expect(isValidIdentifier("foo bar")).toBe(false);
    expect(isValidIdentifier("foo.bar")).toBe(false);
    expect(isValidIdentifier("")).toBe(false);
  });
});

describe("getSafePropertyName", () => {
  it("returns valid identifiers as-is", () => {
    expect(getSafePropertyName("foo")).toBe("foo");
    expect(getSafePropertyName("_foo")).toBe("_foo");
    expect(getSafePropertyName("foo123")).toBe("foo123");
  });

  it("quotes invalid identifiers", () => {
    expect(getSafePropertyName("foo-bar")).toBe('"foo-bar"');
    expect(getSafePropertyName("123foo")).toBe('"123foo"');
    expect(getSafePropertyName("foo bar")).toBe('"foo bar"');
  });
});
