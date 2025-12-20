/**
 * Runtime Validation Tests
 *
 * Tests that generated schemas actually work at runtime by:
 * 1. Generating schema code for each validator
 * 2. Writing to temp files
 * 3. Dynamically importing the modules
 * 4. Testing parse behavior with valid/invalid data
 *
 * Also tests TypeScript compilation of all generated artifacts:
 * - client.ts
 * - functions.ts
 * - schema.ts
 * - form/options.ts
 * - db/collections.ts
 *
 * Covers both OpenAPI and GraphQL schemas across all supported validators.
 */

import { exec } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { graphqlAdapter } from "@/adapters/graphql";
import { openapiAdapter } from "@/adapters/openapi";
import { supportedValidators } from "@/generators/emitters";

import type { SchemaGenOptions } from "@/adapters/types";
import type { GraphQLSourceConfig, OpenAPISourceConfig } from "@/core/config";
import type { ValidatorLibrary } from "@/generators/emitters";

const execAsync = promisify(exec);

// ============================================================================
// Test Configuration
// ============================================================================

const openapiFixturesDir = join(__dirname, "fixtures/openapi");
const graphqlFixturesDir = join(__dirname, "fixtures/graphql");
const cacheDir = join(
  __dirname,
  "../../node_modules/.cache/tangrams-test/runtime-validation",
);

// OpenAPI configs
const petstoreConfig: OpenAPISourceConfig = {
  name: "petstore",
  type: "openapi",
  generates: ["query", "form", "db"],
  spec: join(openapiFixturesDir, "petstore.json"),
};

const extendedConfig: OpenAPISourceConfig = {
  name: "petstore-extended",
  type: "openapi",
  generates: ["query"],
  spec: join(openapiFixturesDir, "petstore-extended.json"),
};

// GraphQL config
const graphqlConfig: GraphQLSourceConfig = {
  name: "test-api",
  type: "graphql",
  schema: { file: join(graphqlFixturesDir, "schema.graphql") },
  documents: join(graphqlFixturesDir, "user.graphql"),
  generates: ["query", "form", "db"],
  url: "https://api.example.com/graphql",
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a value is an ArkType error result
 */
function isArkTypeError(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    " arkKind" in value &&
    (value as Record<string, unknown>)[" arkKind"] === "errors"
  );
}

/**
 * Parse data using the appropriate validator API
 */
async function parseWithValidator(
  validator: ValidatorLibrary,
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic module imports require any
  schemaModule: any,
  schemaName: string,
  data: unknown,
): Promise<{ success: boolean; data?: unknown; error?: unknown }> {
  const schema = schemaModule[schemaName];

  if (!schema) {
    throw new Error(`Schema ${schemaName} not found in module`);
  }

  try {
    switch (validator) {
      case "zod": {
        const result = schema.parse(data);
        return { success: true, data: result };
      }
      case "valibot": {
        const v = await import("valibot");
        const result = v.parse(schema, data);
        return { success: true, data: result };
      }
      case "arktype": {
        const result = schema(data);
        if (isArkTypeError(result)) {
          return { success: false, error: result };
        }
        return { success: true, data: result };
      }
      case "effect": {
        const { Schema } = await import("effect");
        const decodeResult = Schema.decodeUnknownEither(schema)(data);
        if (decodeResult._tag === "Left") {
          return { success: false, error: decodeResult.left };
        }
        return { success: true, data: decodeResult.right };
      }
    }
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * Generate OpenAPI schema file for a validator (for runtime parsing tests)
 */
async function generateOpenAPISchema(
  config: OpenAPISourceConfig,
  validator: ValidatorLibrary,
  filename: string,
): Promise<void> {
  const schema = await openapiAdapter.loadSchema(config);
  const schemaOptions: SchemaGenOptions = { validator };
  const result = openapiAdapter.generateSchemas(schema, config, schemaOptions);

  const validatorDir = join(cacheDir, validator);
  await mkdir(validatorDir, { recursive: true });

  const filePath = join(validatorDir, filename);
  await writeFile(filePath, result.content);
}

/**
 * Generate GraphQL schema file for a validator (for runtime parsing tests)
 */
async function generateGraphQLSchema(
  validator: ValidatorLibrary,
): Promise<void> {
  const schema = await graphqlAdapter.loadSchema(graphqlConfig);
  const schemaOptions: SchemaGenOptions = { validator };
  const result = graphqlAdapter.generateSchemas(
    schema,
    graphqlConfig,
    schemaOptions,
  );

  const validatorDir = join(cacheDir, validator);
  await mkdir(validatorDir, { recursive: true });

  const filePath = join(validatorDir, "graphql-schema.ts");
  await writeFile(filePath, result.content);
}

/**
 * Generate full OpenAPI artifact set for TypeScript compilation tests
 */
async function generateOpenAPIArtifacts(
  config: OpenAPISourceConfig,
  validator: ValidatorLibrary,
  baseDir: string,
): Promise<void> {
  const schema = await openapiAdapter.loadSchema(config);

  // Create directories
  await mkdir(join(baseDir, "form"), { recursive: true });
  await mkdir(join(baseDir, "db"), { recursive: true });
  await mkdir(join(baseDir, "query"), { recursive: true });

  // Generate client.ts
  const clientResult = openapiAdapter.generateClient(schema, config);
  await writeFile(join(baseDir, "client.ts"), clientResult.content);

  // Generate schema.ts
  const schemaResult = openapiAdapter.generateSchemas(schema, config, {
    validator,
  });
  await writeFile(join(baseDir, "schema.ts"), schemaResult.content);

  // Generate functions.ts
  const functionsResult = openapiAdapter.generateFunctions(schema, config, {
    clientImportPath: "./client",
    typesImportPath: "./schema",
    validatorLibrary: validator,
  });
  await writeFile(join(baseDir, "functions.ts"), functionsResult.content);

  // Generate form/options.ts
  const formResult = openapiAdapter.generateFormOptions(schema, config, {
    schemaImportPath: "../schema",
    sourceName: config.name,
    validatorLibrary: validator,
  });
  await writeFile(join(baseDir, "form/options.ts"), formResult.content);

  // Generate db/collections.ts
  const collectionsResult = openapiAdapter.generateCollections(schema, config, {
    typesImportPath: "../schema",
    sourceName: config.name,
  });
  await writeFile(
    join(baseDir, "db/collections.ts"),
    collectionsResult.content,
  );

  // Generate query/options.ts
  const queryResult = openapiAdapter.generateOperations(schema, config, {
    typesImportPath: "../schema",
    sourceName: config.name,
  });
  await writeFile(join(baseDir, "query/options.ts"), queryResult.content);
}

/**
 * Generate full GraphQL artifact set for TypeScript compilation tests
 */
async function generateGraphQLArtifacts(
  config: GraphQLSourceConfig,
  validator: ValidatorLibrary,
  baseDir: string,
): Promise<void> {
  const schema = await graphqlAdapter.loadSchema(config);

  // Create directories
  await mkdir(join(baseDir, "form"), { recursive: true });
  await mkdir(join(baseDir, "db"), { recursive: true });
  await mkdir(join(baseDir, "query"), { recursive: true });

  // Generate client.ts
  const clientResult = graphqlAdapter.generateClient(schema, config);
  await writeFile(join(baseDir, "client.ts"), clientResult.content);

  // Generate types.ts
  const typesResult = graphqlAdapter.generateTypes(schema, config, {});
  await writeFile(join(baseDir, "types.ts"), typesResult.content);

  // Generate schema.ts
  const schemaResult = graphqlAdapter.generateSchemas(schema, config, {
    validator,
  });
  await writeFile(join(baseDir, "schema.ts"), schemaResult.content);

  // Generate functions.ts
  const functionsResult = graphqlAdapter.generateFunctions(schema, config, {
    clientImportPath: "./client",
    typesImportPath: "./types",
  });
  await writeFile(join(baseDir, "functions.ts"), functionsResult.content);

  // Generate form/options.ts
  const formResult = graphqlAdapter.generateFormOptions(schema, config, {
    schemaImportPath: "../schema",
    sourceName: config.name,
    validatorLibrary: validator,
  });
  await writeFile(join(baseDir, "form/options.ts"), formResult.content);

  // Generate db/collections.ts
  const collectionsResult = graphqlAdapter.generateCollections(schema, config, {
    typesImportPath: "../types",
    sourceName: config.name,
  });
  await writeFile(
    join(baseDir, "db/collections.ts"),
    collectionsResult.content,
  );

  // Generate query/options.ts
  const queryResult = graphqlAdapter.generateOperations(schema, config, {
    typesImportPath: "../types",
    sourceName: config.name,
  });
  await writeFile(join(baseDir, "query/options.ts"), queryResult.content);
}

/**
 * Generate tsconfig.json for TypeScript compilation tests
 */
async function generateTsConfig(validatorDir: string): Promise<void> {
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "react-jsx",
    },
    include: ["openapi/**/*.ts", "graphql/**/*.ts"],
  };

  await writeFile(
    join(validatorDir, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2),
  );
}

/**
 * Run TypeScript type-check on generated files
 */
async function runTypeCheck(
  validatorDir: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(
      `npx tsc --project ${join(validatorDir, "tsconfig.json")}`,
      { cwd: validatorDir, timeout: 30000 },
    );
    return { success: true, output: stdout || stderr || "No output" };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    return {
      success: false,
      output: execError.stderr || execError.stdout || String(error),
    };
  }
}

// ============================================================================
// Test Data - OpenAPI Basic (petstore.json)
// ============================================================================

const validPet = {
  id: "pet-123",
  name: "Fido",
  species: "dog",
  status: "available",
  breed: "Golden Retriever",
  age: 3,
  tags: ["friendly", "trained"],
};

const invalidPetMissingRequired = {
  id: "pet-123",
  // missing: name, species, status
};

const invalidPetWrongEnum = {
  id: "pet-123",
  name: "Fido",
  species: "dragon",
  status: "available",
};

const invalidPetWrongType = {
  id: "pet-123",
  name: "Fido",
  species: "dog",
  status: "available",
  age: "three",
};

// ============================================================================
// Test Data - OpenAPI Extended (petstore-extended.json)
// ============================================================================

// String format test data
const stringFormats = {
  valid: {
    email: "test@example.com",
    url: "https://example.com/path",
    uuid: "550e8400-e29b-41d4-a716-446655440000",
    datetime: "2024-01-15T10:30:00Z",
    date: "2024-01-15",
    ipv4: "192.168.1.1",
    ipv6: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
  },
  invalid: {
    email: "not-an-email",
    url: "not-a-url",
    uuid: "not-a-uuid",
    datetime: "not-a-datetime",
    date: "not-a-date",
    ipv4: "999.999.999.999",
    ipv6: "not-an-ipv6",
  },
};

// Valid extended Pet with all format fields
const validExtendedPet = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Fido",
  email: "fido@example.com",
  website: "https://fido.example.com",
  ipAddress: "192.168.1.100",
  ipv6Address: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
  createdAt: "2024-01-15T10:30:00Z",
  birthDate: "2020-05-15",
  isActive: true,
  tags: ["friendly"],
};

// Nullable field test data
const petWithNullableFields = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Fido",
  age: null,
  weight: null,
};

// Composition test data (allOf - SearchCriteria)
const validSearchCriteria = {
  query: "fluffy cats",
  filters: {
    minAge: 1,
  },
};

const invalidSearchCriteria = {
  query: 123, // should be string
};

// Composition test data (oneOf - SearchResult)
const validSearchResultWithPets = {
  pets: [validExtendedPet],
};

const validSearchResultWithError = {
  error: "Something went wrong",
};

// Note: anyOf (FlexibleResponse) is defined in the spec but not used by any operation,
// so it's not generated. The oneOf tests above cover union behavior.

// ============================================================================
// Test Data - GraphQL
// ============================================================================

// GraphQL input types
const validCreateUserInput = {
  name: "John Doe",
  email: "john@example.com",
  avatarUrl: "https://example.com/avatar.png",
};

const validCreateUserInputMinimal = {
  name: "Jane Doe",
  email: "jane@example.com",
  // avatarUrl is optional
};

const invalidCreateUserInputMissingEmail = {
  name: "John Doe",
  // missing required email
};

const validUpdateUserInput = {
  name: "Updated Name",
  // all fields optional
};

const validUpdateUserInputEmpty = {
  // all fields optional, can be empty
};

// Note: GraphQL enums like UserRole are only generated if referenced by operations in documents

// ============================================================================
// Tests
// ============================================================================

describe("Runtime Validation", () => {
  // Setup: generate all schemas and artifacts for all validators
  beforeAll(async () => {
    await mkdir(cacheDir, { recursive: true });

    // Generate all schemas in parallel (for runtime parsing tests)
    await Promise.all(
      supportedValidators.flatMap((validator) => [
        generateOpenAPISchema(petstoreConfig, validator, "petstore-schema.ts"),
        generateOpenAPISchema(extendedConfig, validator, "extended-schema.ts"),
        generateGraphQLSchema(validator),
      ]),
    );

    // Generate full artifact sets in parallel (for TypeScript compilation tests)
    await Promise.all(
      supportedValidators.flatMap((validator) => [
        generateOpenAPIArtifacts(
          petstoreConfig,
          validator,
          join(cacheDir, validator, "openapi"),
        ),
        generateGraphQLArtifacts(
          graphqlConfig,
          validator,
          join(cacheDir, validator, "graphql"),
        ),
        generateTsConfig(join(cacheDir, validator)),
      ]),
    );
  });

  // Cleanup: remove temp files
  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  // ==========================================================================
  // OpenAPI Basic Tests (petstore.json)
  // ==========================================================================

  describe("OpenAPI Basic", () => {
    describe.each(
      supportedValidators,
    )("%s validator", (validator: ValidatorLibrary) => {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic module imports require any
      let schemaModule: any;

      beforeAll(async () => {
        const filePath = join(cacheDir, validator, "petstore-schema.ts");
        schemaModule = await import(filePath);
      });

      describe("Pet schema", () => {
        it("parses valid Pet object", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            validPet,
          );
          expect(result.success).toBe(true);
          expect(result.data).toBeDefined();
        });

        it("rejects Pet with missing required fields", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            invalidPetMissingRequired,
          );
          expect(result.success).toBe(false);
        });

        it("rejects Pet with invalid enum value", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            invalidPetWrongEnum,
          );
          expect(result.success).toBe(false);
        });

        it("rejects Pet with wrong type", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            invalidPetWrongType,
          );
          expect(result.success).toBe(false);
        });
      });

      describe("Enum schema", () => {
        it("parses valid enum value", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "speciesSchema",
            "dog",
          );
          expect(result.success).toBe(true);
          expect(result.data).toBe("dog");
        });

        it("rejects invalid enum value", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "speciesSchema",
            "dragon",
          );
          expect(result.success).toBe(false);
        });
      });

      describe("Array handling", () => {
        it("parses array of valid items", async () => {
          const pets = [validPet, { ...validPet, id: "pet-456" }];
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "listPetsResponseSchema",
            pets,
          );
          expect(result.success).toBe(true);
          expect(result.data).toHaveLength(2);
        });

        it("rejects array with invalid item", async () => {
          const pets = [validPet, invalidPetMissingRequired];
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "listPetsResponseSchema",
            pets,
          );
          expect(result.success).toBe(false);
        });
      });

      describe("Optional fields", () => {
        it("parses object with only required fields", async () => {
          const minimalPet = {
            id: "pet-789",
            name: "Whiskers",
            species: "cat",
            status: "pending",
          };
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            minimalPet,
          );
          expect(result.success).toBe(true);
        });

        it("parses object with null optional fields", async () => {
          const petWithNulls = {
            id: "pet-101",
            name: "Goldie",
            species: "fish",
            status: "available",
            breed: null,
            age: null,
            ownerId: null,
            tags: null,
          };
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            petWithNulls,
          );
          expect(result.success).toBe(true);
        });
      });
    });
  });

  // ==========================================================================
  // OpenAPI Extended Tests (petstore-extended.json)
  // ==========================================================================

  describe("OpenAPI Extended", () => {
    describe.each(
      supportedValidators,
    )("%s validator", (validator: ValidatorLibrary) => {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic module imports require any
      let schemaModule: any;

      beforeAll(async () => {
        const filePath = join(cacheDir, validator, "extended-schema.ts");
        schemaModule = await import(filePath);
      });

      describe("String formats", () => {
        it("validates email format", async () => {
          const valid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, email: stringFormats.valid.email },
          );
          expect(valid.success).toBe(true);

          const invalid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, email: stringFormats.invalid.email },
          );
          expect(invalid.success).toBe(false);
        });

        it("validates URL format", async () => {
          const valid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, website: stringFormats.valid.url },
          );
          expect(valid.success).toBe(true);

          const invalid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, website: stringFormats.invalid.url },
          );
          expect(invalid.success).toBe(false);
        });

        it("validates UUID format", async () => {
          const valid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, id: stringFormats.valid.uuid },
          );
          expect(valid.success).toBe(true);

          const invalid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, id: stringFormats.invalid.uuid },
          );
          expect(invalid.success).toBe(false);
        });

        it("validates datetime format", async () => {
          const valid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, createdAt: stringFormats.valid.datetime },
          );
          expect(valid.success).toBe(true);

          const invalid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            {
              ...validExtendedPet,
              createdAt: stringFormats.invalid.datetime,
            },
          );
          expect(invalid.success).toBe(false);
        });

        it("validates date format", async () => {
          const valid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, birthDate: stringFormats.valid.date },
          );
          expect(valid.success).toBe(true);

          const invalid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, birthDate: stringFormats.invalid.date },
          );
          expect(invalid.success).toBe(false);
        });

        it("validates IPv4 format", async () => {
          const valid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, ipAddress: stringFormats.valid.ipv4 },
          );
          expect(valid.success).toBe(true);

          const invalid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, ipAddress: stringFormats.invalid.ipv4 },
          );
          expect(invalid.success).toBe(false);
        });

        it("validates IPv6 format", async () => {
          const valid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, ipv6Address: stringFormats.valid.ipv6 },
          );
          expect(valid.success).toBe(true);

          const invalid = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...validExtendedPet, ipv6Address: stringFormats.invalid.ipv6 },
          );
          expect(invalid.success).toBe(false);
        });
      });

      describe("Nullable types", () => {
        it("accepts null for nullable integer", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            petWithNullableFields,
          );
          expect(result.success).toBe(true);
        });

        it("accepts value for nullable integer", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...petWithNullableFields, age: 5 },
          );
          expect(result.success).toBe(true);
        });

        it("accepts null for nullable number", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...petWithNullableFields, weight: null },
          );
          expect(result.success).toBe(true);
        });

        it("accepts value for nullable number", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            { ...petWithNullableFields, weight: 15.5 },
          );
          expect(result.success).toBe(true);
        });
      });

      describe("Composition types", () => {
        describe("allOf (intersection)", () => {
          it("validates object matching all schemas", async () => {
            const result = await parseWithValidator(
              validator,
              schemaModule,
              "searchCriteriaSchema",
              validSearchCriteria,
            );
            expect(result.success).toBe(true);
          });

          it("rejects object with wrong type", async () => {
            const result = await parseWithValidator(
              validator,
              schemaModule,
              "searchCriteriaSchema",
              invalidSearchCriteria,
            );
            expect(result.success).toBe(false);
          });
        });

        describe("oneOf (union)", () => {
          it("validates first union member (pets result)", async () => {
            const result = await parseWithValidator(
              validator,
              schemaModule,
              "searchResultSchema",
              validSearchResultWithPets,
            );
            expect(result.success).toBe(true);
          });

          it("validates second union member (error result)", async () => {
            const result = await parseWithValidator(
              validator,
              schemaModule,
              "searchResultSchema",
              validSearchResultWithError,
            );
            expect(result.success).toBe(true);
          });
        });

        // Note: anyOf (FlexibleResponse) is defined in the spec but not used by any operation,
        // so it's not generated. The oneOf tests above cover union behavior.
      });

      describe("Edge cases", () => {
        it("handles special property names (hyphens)", async () => {
          const petWithSpecialName = {
            ...validExtendedPet,
            "special-name": "test-value",
          };
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "petSchema",
            petWithSpecialName,
          );
          expect(result.success).toBe(true);
        });
      });
    });
  });

  // ==========================================================================
  // GraphQL Tests
  // ==========================================================================

  describe("GraphQL", () => {
    describe.each(
      supportedValidators,
    )("%s validator", (validator: ValidatorLibrary) => {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic module imports require any
      let schemaModule: any;

      beforeAll(async () => {
        const filePath = join(cacheDir, validator, "graphql-schema.ts");
        schemaModule = await import(filePath);
      });

      describe("Input types", () => {
        it("validates CreateUserInput with all fields", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "createUserInputSchema",
            validCreateUserInput,
          );
          expect(result.success).toBe(true);
        });

        it("validates CreateUserInput with only required fields", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "createUserInputSchema",
            validCreateUserInputMinimal,
          );
          expect(result.success).toBe(true);
        });

        it("rejects CreateUserInput missing required field", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "createUserInputSchema",
            invalidCreateUserInputMissingEmail,
          );
          expect(result.success).toBe(false);
        });

        it("validates UpdateUserInput with partial fields", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "updateUserInputSchema",
            validUpdateUserInput,
          );
          expect(result.success).toBe(true);
        });

        it("validates UpdateUserInput with no fields (all optional)", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "updateUserInputSchema",
            validUpdateUserInputEmpty,
          );
          expect(result.success).toBe(true);
        });
      });

      // Note: GraphQL enums like UserRole are only generated if referenced by operations in documents

      describe("Mutation variables", () => {
        it("validates CreateUser mutation variables", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "createUserMutationVariablesSchema",
            { input: validCreateUserInput },
          );
          expect(result.success).toBe(true);
        });

        it("validates UpdateUser mutation variables", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "updateUserMutationVariablesSchema",
            { id: "user-123", input: validUpdateUserInput },
          );
          expect(result.success).toBe(true);
        });

        it("validates DeleteUser mutation variables", async () => {
          const result = await parseWithValidator(
            validator,
            schemaModule,
            "deleteUserMutationVariablesSchema",
            { id: "user-123" },
          );
          expect(result.success).toBe(true);
        });
      });
    });
  });

  // ==========================================================================
  // TypeScript Compilation Tests
  // ==========================================================================

  describe("TypeScript Compilation", () => {
    describe.each(
      supportedValidators,
    )("%s validator", (validator: ValidatorLibrary) => {
      it("all generated files pass TypeScript type-check", async () => {
        const validatorDir = join(cacheDir, validator);
        const result = await runTypeCheck(validatorDir);

        if (!result.success) {
          // Include tsc output in test failure for debugging
          expect.fail(`TypeScript errors:\n${result.output}`);
        }

        expect(result.success).toBe(true);
      }, 30000); // 30 second timeout for tsc
    });
  });
});
