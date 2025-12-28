import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Kind, OperationTypeNode, buildSchema } from "graphql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { supportedValidators } from "@/generators/emitters";
import { graphqlAdapter } from "./index";
import {
  isFileSchemaConfig,
  isUrlSchemaConfig,
  loadSchemaFromFiles,
} from "./schema";

import type { GraphQLSourceConfig } from "@/core/config";
import type { ValidatorLibrary } from "@/generators/emitters";
import type { GraphQLAdapterSchema, SchemaGenOptions } from "../types";

const fixturesDir = join(__dirname, "../../test/fixtures/graphql");

/**
 * Default schema generation options for tests
 */
const defaultSchemaOptions: SchemaGenOptions = {
  validator: "zod",
};

/**
 * Validator-specific patterns to check for in generated code
 */
const validatorPatterns: Record<
  ValidatorLibrary,
  {
    import: string;
    object: string;
    string: string;
    enum: string;
  }
> = {
  zod: {
    import: 'import * as z from "zod"',
    object: "z.object(",
    string: "z.string()",
    enum: "z.enum(",
  },
  valibot: {
    import: 'import * as v from "valibot"',
    object: "v.object(",
    string: "v.string()",
    enum: "v.picklist(",
  },
  arktype: {
    import: 'import { type } from "arktype"',
    object: "type({",
    string: '"string"',
    enum: "type.enumerated(",
  },
  effect: {
    import: 'import { Schema } from "effect"',
    object: "Schema.Struct(",
    string: "Schema.String",
    enum: "Schema.Union(Schema.Literal(",
  },
};

// Test schema for unit tests (doesn't require network)
const testSchemaSDL = `
  type Query {
    user(id: ID!): User
    users: [User!]!
  }
  
  type Mutation {
    createUser(name: String!): User!
  }
  
  type User {
    id: ID!
    name: String!
    email: String!
  }
`;

const testSchema = buildSchema(testSchemaSDL);

describe("GraphQL Adapter", () => {
  const testConfig: GraphQLSourceConfig = {
    name: "test-api",
    type: "graphql",
    schema: { url: "http://localhost:4000/graphql" },
    documents: join(fixturesDir, "*.graphql"),
    generates: ["query"],
  };

  describe("adapter properties", () => {
    it("has type property set to graphql", () => {
      expect(graphqlAdapter.type).toBe("graphql");
    });
  });

  describe("generateClient", () => {
    it("generates a GraphQL client file", () => {
      const schema: GraphQLAdapterSchema = {
        schema: testSchema,
        documents: { operations: [], fragments: [] },
      };

      const result = graphqlAdapter.generateClient(schema, testConfig);

      expect(result.filename).toBe("client.ts");
      expect(result.content).toContain("GraphQLClient");
      expect(result.content).toContain("graphql-request");
      expect(result.content).toContain("http://localhost:4000/graphql");
      expect(result.content).toContain("getClient");
    });

    it("uses the schema URL from config", () => {
      const customConfig: GraphQLSourceConfig = {
        ...testConfig,
        schema: { url: "https://api.example.com/graphql" },
      };

      const schema: GraphQLAdapterSchema = {
        schema: testSchema,
        documents: { operations: [], fragments: [] },
      };

      const result = graphqlAdapter.generateClient(schema, customConfig);

      expect(result.content).toContain("https://api.example.com/graphql");
    });
  });

  describe("generateTypes", () => {
    it("generates TypeScript types from schema", () => {
      // Note: generateTypes only outputs types that are used by operations
      // Empty documents means no types are generated (by design)
      const schema: GraphQLAdapterSchema = {
        schema: testSchema,
        documents: { operations: [], fragments: [] },
      };

      const result = graphqlAdapter.generateTypes(schema, testConfig, {});

      expect(result.filename).toBe("types.ts");
      // With no operations, only the header is generated
      expect(result.content).toContain("/* eslint-disable */");
    });

    it("generates types for operations", () => {
      const schema: GraphQLAdapterSchema = {
        schema: testSchema,
        documents: {
          operations: [
            {
              name: "GetUser",
              operation: "query",
              node: {
                kind: Kind.OPERATION_DEFINITION,
                operation: OperationTypeNode.QUERY,
                name: { kind: Kind.NAME, value: "GetUser" },
                selectionSet: {
                  kind: Kind.SELECTION_SET,
                  selections: [],
                },
              },
              document: "query GetUser { user(id: 1) { id name } }",
            },
          ],
          fragments: [],
        },
      };

      const result = graphqlAdapter.generateTypes(schema, testConfig, {});

      // Should have operation-specific types
      expect(result.content).toContain("GetUser");
    });

    it("handles custom scalar mappings", () => {
      const schemaWithScalar = buildSchema(`
        scalar DateTime
        type Query { now: DateTime }
      `);

      const schema: GraphQLAdapterSchema = {
        schema: schemaWithScalar,
        documents: {
          operations: [
            {
              name: "GetNow",
              operation: "query",
              node: {
                kind: Kind.OPERATION_DEFINITION,
                operation: OperationTypeNode.QUERY,
                name: { kind: Kind.NAME, value: "GetNow" },
                selectionSet: {
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: { kind: Kind.NAME, value: "now" },
                    },
                  ],
                },
              },
              document: "query GetNow { now }",
            },
          ],
          fragments: [],
        },
      };

      const result = graphqlAdapter.generateTypes(schema, testConfig, {
        scalars: { DateTime: "Date" },
      });

      // DateTime should be mapped to Date in generated types
      expect(result.content).toContain("Date");
    });
  });

  describe("generateOperations", () => {
    it("generates query operations", () => {
      const schema: GraphQLAdapterSchema = {
        schema: testSchema,
        documents: {
          operations: [
            {
              name: "GetUsers",
              operation: "query",
              node: {
                kind: Kind.OPERATION_DEFINITION,
                operation: OperationTypeNode.QUERY,
                name: { kind: Kind.NAME, value: "GetUsers" },
                selectionSet: {
                  kind: Kind.SELECTION_SET,
                  selections: [],
                },
              },
              document: "query GetUsers { users { id name } }",
            },
          ],
          fragments: [],
        },
      };

      const result = graphqlAdapter.generateOperations(schema, testConfig, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "test",
      });

      expect(result.filename).toBe("options.ts");
      expect(result.content).toContain("queryOptions");
      expect(result.content).toContain("getUsersQueryOptions");
    });

    it("includes operation name in query key", () => {
      const schema: GraphQLAdapterSchema = {
        schema: testSchema,
        documents: {
          operations: [
            {
              name: "GetUsers",
              operation: "query",
              node: {
                kind: Kind.OPERATION_DEFINITION,
                operation: OperationTypeNode.QUERY,
                name: { kind: Kind.NAME, value: "GetUsers" },
                selectionSet: {
                  kind: Kind.SELECTION_SET,
                  selections: [],
                },
              },
              document: "query GetUsers { users { id name } }",
            },
          ],
          fragments: [],
        },
      };

      const result = graphqlAdapter.generateOperations(schema, testConfig, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "test",
      });

      // The query key should include the operation name
      expect(result.content).toContain("GetUsers");
    });
  });

  describe("generateClient with file-based schema", () => {
    it("generates a client with url from config for file-based schema", () => {
      const fileConfig: GraphQLSourceConfig = {
        name: "test-api",
        type: "graphql",
        schema: { file: "./schema.graphql" },
        url: "http://localhost:4000/graphql",
        documents: join(fixturesDir, "*.graphql"),
        generates: ["query"],
      };

      const schema: GraphQLAdapterSchema = {
        schema: testSchema,
        documents: { operations: [], fragments: [] },
      };

      const result = graphqlAdapter.generateClient(schema, fileConfig);

      expect(result.filename).toBe("client.ts");
      expect(result.content).toContain("http://localhost:4000/graphql");
      expect(result.content).not.toContain("YOUR_GRAPHQL_ENDPOINT");
    });

    it("generates a client with env var template", () => {
      const fileConfig: GraphQLSourceConfig = {
        name: "test-api",
        type: "graphql",
        schema: { file: "./schema.graphql" },
        url: "${API_URL}/graphql",
        documents: join(fixturesDir, "*.graphql"),
        generates: ["query"],
      };

      const schema: GraphQLAdapterSchema = {
        schema: testSchema,
        documents: { operations: [], fragments: [] },
      };

      const result = graphqlAdapter.generateClient(schema, fileConfig);

      expect(result.filename).toBe("client.ts");
      expect(result.content).toContain("${process.env.API_URL}/graphql");
      expect(result.content).toContain("`"); // Template literal
    });

    it("url overrides schema.url for URL-based schema", () => {
      const config: GraphQLSourceConfig = {
        name: "test-api",
        type: "graphql",
        schema: { url: "http://localhost:4000/graphql" },
        url: "${PROD_API_URL}",
        documents: join(fixturesDir, "*.graphql"),
        generates: ["query"],
      };

      const schema: GraphQLAdapterSchema = {
        schema: testSchema,
        documents: { operations: [], fragments: [] },
      };

      const result = graphqlAdapter.generateClient(schema, config);

      expect(result.content).toContain("${process.env.PROD_API_URL}");
      expect(result.content).not.toContain("http://localhost:4000/graphql");
    });
  });
});

describe("Schema Type Guards", () => {
  it("isUrlSchemaConfig returns true for URL config", () => {
    const config = { url: "http://localhost:4000/graphql" };
    expect(isUrlSchemaConfig(config)).toBe(true);
    expect(isFileSchemaConfig(config)).toBe(false);
  });

  it("isUrlSchemaConfig returns true for URL config with headers", () => {
    const config = {
      url: "http://localhost:4000/graphql",
      headers: { Authorization: "Bearer token" },
    };
    expect(isUrlSchemaConfig(config)).toBe(true);
  });

  it("isFileSchemaConfig returns true for file config (string)", () => {
    const config = { file: "./schema.graphql" };
    expect(isFileSchemaConfig(config)).toBe(true);
    expect(isUrlSchemaConfig(config)).toBe(false);
  });

  it("isFileSchemaConfig returns true for file config (array)", () => {
    const config = { file: ["./schema.graphql", "./types.graphql"] };
    expect(isFileSchemaConfig(config)).toBe(true);
  });
});

describe("generateSchemas", () => {
  const schemaWithInputs = buildSchema(`
    enum UserRole {
      ADMIN
      USER
    }

    input CreateUserInput {
      name: String!
      email: String!
      role: UserRole
    }

    type User {
      id: ID!
      name: String!
    }

    type Query {
      users: [User!]!
    }

    type Mutation {
      createUser(input: CreateUserInput!): User!
    }
  `);

  const testConfig: GraphQLSourceConfig = {
    name: "test-api",
    type: "graphql",
    schema: { url: "http://localhost:4000/graphql" },
    documents: "./src/**/*.graphql",
    generates: ["query"],
  };

  it("generates Zod schemas for input types", () => {
    const schema: GraphQLAdapterSchema = {
      schema: schemaWithInputs,
      documents: {
        operations: [
          {
            name: "CreateUser",
            operation: "mutation",
            node: {
              kind: Kind.OPERATION_DEFINITION,
              operation: OperationTypeNode.MUTATION,
              name: { kind: Kind.NAME, value: "CreateUser" },
              variableDefinitions: [
                {
                  kind: Kind.VARIABLE_DEFINITION,
                  variable: {
                    kind: Kind.VARIABLE,
                    name: { kind: Kind.NAME, value: "input" },
                  },
                  type: {
                    kind: Kind.NON_NULL_TYPE,
                    type: {
                      kind: Kind.NAMED_TYPE,
                      name: { kind: Kind.NAME, value: "CreateUserInput" },
                    },
                  },
                },
              ],
              selectionSet: { kind: Kind.SELECTION_SET, selections: [] },
            },
            document:
              "mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id } }",
          },
        ],
        fragments: [],
      },
    };

    const result = graphqlAdapter.generateSchemas(
      schema,
      testConfig,
      defaultSchemaOptions,
    );

    expect(result.filename).toBe("schema.ts");
    expect(result.content).toContain("import * as z from");
    expect(result.content).toContain("createUserInputSchema");
    expect(result.content).toContain("z.object({");
  });

  it("generates enum schemas", () => {
    const schema: GraphQLAdapterSchema = {
      schema: schemaWithInputs,
      documents: {
        operations: [
          {
            name: "CreateUser",
            operation: "mutation",
            node: {
              kind: Kind.OPERATION_DEFINITION,
              operation: OperationTypeNode.MUTATION,
              name: { kind: Kind.NAME, value: "CreateUser" },
              variableDefinitions: [
                {
                  kind: Kind.VARIABLE_DEFINITION,
                  variable: {
                    kind: Kind.VARIABLE,
                    name: { kind: Kind.NAME, value: "input" },
                  },
                  type: {
                    kind: Kind.NON_NULL_TYPE,
                    type: {
                      kind: Kind.NAMED_TYPE,
                      name: { kind: Kind.NAME, value: "CreateUserInput" },
                    },
                  },
                },
              ],
              selectionSet: { kind: Kind.SELECTION_SET, selections: [] },
            },
            document:
              "mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id } }",
          },
        ],
        fragments: [],
      },
    };

    const result = graphqlAdapter.generateSchemas(
      schema,
      testConfig,
      defaultSchemaOptions,
    );

    expect(result.content).toContain("userRoleSchema");
    expect(result.content).toContain('z.enum(["ADMIN", "USER"])');
  });
});

describe("Multi-Validator Schema Generation", () => {
  const schemaWithInputs = buildSchema(`
    enum UserRole {
      ADMIN
      USER
    }

    input CreateUserInput {
      name: String!
      email: String!
      role: UserRole
    }

    type User {
      id: ID!
      name: String!
    }

    type Query {
      users: [User!]!
    }

    type Mutation {
      createUser(input: CreateUserInput!): User!
    }
  `);

  const testConfig: GraphQLSourceConfig = {
    name: "test-api",
    type: "graphql",
    schema: { url: "http://localhost:4000/graphql" },
    documents: "./src/**/*.graphql",
    generates: ["query"],
  };

  // Create a test schema with operations that use the input types
  const createTestSchema = (): GraphQLAdapterSchema => ({
    schema: schemaWithInputs,
    documents: {
      operations: [
        {
          name: "CreateUser",
          operation: "mutation",
          node: {
            kind: Kind.OPERATION_DEFINITION,
            operation: OperationTypeNode.MUTATION,
            name: { kind: Kind.NAME, value: "CreateUser" },
            variableDefinitions: [
              {
                kind: Kind.VARIABLE_DEFINITION,
                variable: {
                  kind: Kind.VARIABLE,
                  name: { kind: Kind.NAME, value: "input" },
                },
                type: {
                  kind: Kind.NON_NULL_TYPE,
                  type: {
                    kind: Kind.NAMED_TYPE,
                    name: { kind: Kind.NAME, value: "CreateUserInput" },
                  },
                },
              },
            ],
            selectionSet: { kind: Kind.SELECTION_SET, selections: [] },
          },
          document:
            "mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id } }",
        },
      ],
      fragments: [],
    },
  });

  describe.each(
    supportedValidators,
  )("generateSchemas with %s validator", (validator) => {
    const schemaOptions: SchemaGenOptions = { validator };
    const patterns = validatorPatterns[validator];

    it("generates correct import statement", () => {
      const schema = createTestSchema();
      const result = graphqlAdapter.generateSchemas(
        schema,
        testConfig,
        schemaOptions,
      );

      expect(result.content).toContain(patterns.import);
    });

    it("generates schema exports", () => {
      const schema = createTestSchema();
      const result = graphqlAdapter.generateSchemas(
        schema,
        testConfig,
        schemaOptions,
      );

      // All validators should export the same schema names
      expect(result.content).toContain("export const createUserInputSchema");
      expect(result.content).toContain("export type CreateUserInput");
    });

    it("generates object schemas for input types", () => {
      const schema = createTestSchema();
      const result = graphqlAdapter.generateSchemas(
        schema,
        testConfig,
        schemaOptions,
      );

      expect(result.content).toContain(patterns.object);
    });

    it("generates enum schemas", () => {
      const schema = createTestSchema();
      const result = graphqlAdapter.generateSchemas(
        schema,
        testConfig,
        schemaOptions,
      );

      expect(result.content).toContain("export const userRoleSchema");
      expect(result.content).toContain(patterns.enum);
    });
  });
});

describe("generateFormOptions", () => {
  const schemaWithInputs = buildSchema(`
    input CreateUserInput {
      name: String!
      email: String!
    }

    type User {
      id: ID!
      name: String!
    }

    type Query {
      users: [User!]!
    }

    type Mutation {
      createUser(input: CreateUserInput!): User!
    }
  `);

  const testConfig: GraphQLSourceConfig = {
    name: "test-api",
    type: "graphql",
    schema: { url: "http://localhost:4000/graphql" },
    documents: "./src/**/*.graphql",
    generates: ["form"],
  };

  it("generates form options for mutations", () => {
    const schema: GraphQLAdapterSchema = {
      schema: schemaWithInputs,
      documents: {
        operations: [
          {
            name: "CreateUser",
            operation: "mutation",
            node: {
              kind: Kind.OPERATION_DEFINITION,
              operation: OperationTypeNode.MUTATION,
              name: { kind: Kind.NAME, value: "CreateUser" },
              variableDefinitions: [
                {
                  kind: Kind.VARIABLE_DEFINITION,
                  variable: {
                    kind: Kind.VARIABLE,
                    name: { kind: Kind.NAME, value: "input" },
                  },
                  type: {
                    kind: Kind.NON_NULL_TYPE,
                    type: {
                      kind: Kind.NAMED_TYPE,
                      name: { kind: Kind.NAME, value: "CreateUserInput" },
                    },
                  },
                },
              ],
              selectionSet: { kind: Kind.SELECTION_SET, selections: [] },
            },
            document:
              "mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id } }",
          },
        ],
        fragments: [],
      },
    };

    const result = graphqlAdapter.generateFormOptions(schema, testConfig, {
      schemaImportPath: "../../query/test-api/types",
      sourceName: "test-api",
    });

    expect(result.filename).toBe("options.ts");
    expect(result.content).toContain(
      'import { formOptions } from "@tanstack/react-form"',
    );
    expect(result.content).toContain("createUserFormOptions");
    expect(result.content).toContain("defaultValues:");
    expect(result.content).toContain("validators:");
  });

  it("returns empty file when no mutations with variables", () => {
    const schema: GraphQLAdapterSchema = {
      schema: schemaWithInputs,
      documents: {
        operations: [
          {
            name: "GetUsers",
            operation: "query",
            node: {
              kind: Kind.OPERATION_DEFINITION,
              operation: OperationTypeNode.QUERY,
              name: { kind: Kind.NAME, value: "GetUsers" },
              selectionSet: { kind: Kind.SELECTION_SET, selections: [] },
            },
            document: "query GetUsers { users { id } }",
          },
        ],
        fragments: [],
      },
    };

    const result = graphqlAdapter.generateFormOptions(schema, testConfig, {
      schemaImportPath: "../../query/test-api/types",
      sourceName: "test-api",
    });

    expect(result.filename).toBe("options.ts");
    expect(result.content).toContain("No mutations");
    expect(result.warnings?.length).toBeGreaterThan(0);
  });

  it("handles mutations without variables", () => {
    const schemaSimple = buildSchema(`
      type Query {
        test: String
      }

      type Mutation {
        triggerAction: Boolean!
      }
    `);

    const schema: GraphQLAdapterSchema = {
      schema: schemaSimple,
      documents: {
        operations: [
          {
            name: "TriggerAction",
            operation: "mutation",
            node: {
              kind: Kind.OPERATION_DEFINITION,
              operation: OperationTypeNode.MUTATION,
              name: { kind: Kind.NAME, value: "TriggerAction" },
              selectionSet: { kind: Kind.SELECTION_SET, selections: [] },
            },
            document: "mutation TriggerAction { triggerAction }",
          },
        ],
        fragments: [],
      },
    };

    const result = graphqlAdapter.generateFormOptions(schema, testConfig, {
      schemaImportPath: "../../query/test-api/types",
      sourceName: "test-api",
    });

    // Mutations without variables don't get form options
    expect(result.content).toContain("No mutations");
  });
});

describe("loadSchemaFromFiles", () => {
  const testDir = join(tmpdir(), "tangrams-graphql-test");

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("loads schema from a single file", async () => {
    const schemaPath = join(testDir, "schema.graphql");
    await writeFile(
      schemaPath,
      `
      type Query {
        hello: String
      }
    `,
    );

    const schema = await loadSchemaFromFiles(schemaPath);
    expect(schema).toBeDefined();
    expect(schema.getQueryType()).toBeDefined();
  });

  it("loads and merges schema from multiple files via glob", async () => {
    // Create base schema
    await writeFile(
      join(testDir, "base.graphql"),
      `
      type Query {
        hello: String
      }
    `,
    );

    // Create extension
    await writeFile(
      join(testDir, "user.graphql"),
      `
      extend type Query {
        user(id: ID!): User
      }
      
      type User {
        id: ID!
        name: String!
      }
    `,
    );

    const schema = await loadSchemaFromFiles(`${testDir}/*.graphql`);
    expect(schema).toBeDefined();
    expect(schema.getQueryType()).toBeDefined();
    expect(schema.getType("User")).toBeDefined();
  });

  it("loads schema from array of patterns", async () => {
    await writeFile(
      join(testDir, "schema.graphql"),
      `
      type Query {
        hello: String
      }
    `,
    );

    const schema = await loadSchemaFromFiles([join(testDir, "schema.graphql")]);
    expect(schema).toBeDefined();
  });

  it("throws error when no files match pattern", async () => {
    await expect(
      loadSchemaFromFiles(join(testDir, "nonexistent/*.graphql")),
    ).rejects.toThrow();
  });
});

describe("GraphQL Collection Discovery", () => {
  const config: GraphQLSourceConfig = {
    name: "test-api",
    type: "graphql",
    schema: { file: join(fixturesDir, "schema.graphql") },
    documents: join(fixturesDir, "user.graphql"),
    generates: ["query", "db"],
  };

  describe("discoverCollectionEntities", () => {
    it("discovers entities from queries returning list types", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.discoverCollectionEntities(schema, config);

      expect(result.entities.length).toBeGreaterThan(0);

      // Should discover User entity from users query
      const userEntity = result.entities.find((e) => e.name === "User");
      expect(userEntity).toBeDefined();
      expect(userEntity?.typeName).toBe("User");
    });

    it("auto-detects id field as key field for GraphQL types", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.discoverCollectionEntities(schema, config);

      const userEntity = result.entities.find((e) => e.name === "User");
      expect(userEntity?.keyField).toBe("id");
      expect(userEntity?.keyFieldType).toBe("string");
    });

    it("discovers list query from documents", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.discoverCollectionEntities(schema, config);

      const userEntity = result.entities.find((e) => e.name === "User");
      expect(userEntity?.listQuery.operationName).toBe("ListUsers");
      expect(userEntity?.listQuery.queryKey).toEqual(["User"]);
    });

    it("discovers CRUD mutations by naming convention", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.discoverCollectionEntities(schema, config);

      const userEntity = result.entities.find((e) => e.name === "User");
      expect(userEntity?.mutations).toBeDefined();

      // Should have insert mutation (CreateUser)
      const insertMutation = userEntity?.mutations.find(
        (m) => m.type === "insert",
      );
      expect(insertMutation).toBeDefined();
      expect(insertMutation?.operationName).toBe("CreateUser");

      // Should have update mutation (UpdateUser)
      const updateMutation = userEntity?.mutations.find(
        (m) => m.type === "update",
      );
      expect(updateMutation).toBeDefined();
      expect(updateMutation?.operationName).toBe("UpdateUser");

      // Should have delete mutation (DeleteUser)
      const deleteMutation = userEntity?.mutations.find(
        (m) => m.type === "delete",
      );
      expect(deleteMutation).toBeDefined();
      expect(deleteMutation?.operationName).toBe("DeleteUser");
    });

    it("supports keyField override via config", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.discoverCollectionEntities(schema, config, {
        User: { keyField: "email" },
      });

      const userEntity = result.entities.find((e) => e.name === "User");
      expect(userEntity?.keyField).toBe("email");
    });

    it("returns warning when configured keyField not found", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.discoverCollectionEntities(schema, config, {
        User: { keyField: "nonExistentField" },
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("nonExistentField"))).toBe(
        true,
      );
    });
  });

  describe("generateCollections", () => {
    it("generates collection options code", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.generateCollections(schema, config, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "test-api",
      });

      expect(result.filename).toBe("collections.ts");
      expect(result.content).toContain("queryCollectionOptions");
      expect(result.content).toContain("@tanstack/query-db-collection");
    });

    it("imports QueryClient type and createCollection", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.generateCollections(schema, config, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "test-api",
      });

      expect(result.content).toContain("QueryClient");
      expect(result.content).toContain("@tanstack/react-query");
      expect(result.content).toContain("createCollection");
      expect(result.content).toContain("@tanstack/react-db");
    });

    it("does not import unused entity types from types file", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.generateCollections(schema, config, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "test-api",
      });

      // Entity types (like User) should NOT be imported when not used
      // Only params/variables types are imported (for on-demand mode)
      expect(result.content).not.toContain("import type { User }");
    });

    it("imports client functions from hardcoded ../functions path", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.generateCollections(schema, config, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "test-api",
      });

      expect(result.content).toContain('from "../functions"');
      expect(result.content).toContain("listUsers");
    });

    it("generates collection with queryKey, queryFn, and getKey", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.generateCollections(schema, config, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "test-api",
      });

      expect(result.content).toContain("queryKey:");
      expect(result.content).toContain("queryFn:");
      expect(result.content).toContain("getKey:");
    });

    it("generates persistence handlers (onInsert, onUpdate, onDelete) when mutations available", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.generateCollections(schema, config, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "test-api",
      });

      expect(result.content).toContain("onInsert:");
      expect(result.content).toContain("onUpdate:");
      expect(result.content).toContain("onDelete:");
      expect(result.content).toContain("transaction.mutations");
    });

    it("exports named collection options factory", async () => {
      const schema = await graphqlAdapter.loadSchema(config);
      const result = graphqlAdapter.generateCollections(schema, config, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "test-api",
      });

      expect(result.content).toContain("export const userCollectionOptions");
      expect(result.content).toContain("(queryClient: QueryClient)");
      expect(result.content).toContain("createCollection(");
    });
  });

  describe("on-demand mode collection generation", () => {
    const hasuraConfig: GraphQLSourceConfig = {
      name: "hasura-api",
      type: "graphql",
      schema: { file: join(fixturesDir, "hasura-style-schema.graphql") },
      documents: join(fixturesDir, "hasura-style-operations.graphql"),
      generates: ["query", "db"],
    };

    it("discovers filter capabilities from Hasura-style schema", async () => {
      const schema = await graphqlAdapter.loadSchema(hasuraConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        hasuraConfig,
      );

      const productEntity = result.entities.find((e) => e.name === "Product");
      expect(productEntity).toBeDefined();
      expect(productEntity?.filterCapabilities).toBeDefined();
      expect(productEntity?.filterCapabilities?.hasFiltering).toBe(true);
      expect(productEntity?.filterCapabilities?.filterStyle).toBe("hasura");
    });

    it("discovers sort capabilities from Hasura-style schema", async () => {
      const schema = await graphqlAdapter.loadSchema(hasuraConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        hasuraConfig,
      );

      const productEntity = result.entities.find((e) => e.name === "Product");
      expect(productEntity?.sortCapabilities).toBeDefined();
      expect(productEntity?.sortCapabilities?.hasSorting).toBe(true);
      expect(productEntity?.sortCapabilities?.sortParam).toBe("order_by");
    });

    it("discovers pagination capabilities from Hasura-style schema", async () => {
      const schema = await graphqlAdapter.loadSchema(hasuraConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        hasuraConfig,
      );

      const productEntity = result.entities.find((e) => e.name === "Product");
      expect(productEntity?.paginationCapabilities).toBeDefined();
      expect(productEntity?.paginationCapabilities?.style).toBe("offset");
      expect(productEntity?.paginationCapabilities?.limitParam).toBe("limit");
      expect(productEntity?.paginationCapabilities?.offsetParam).toBe("offset");
    });

    it("applies syncMode override from config", async () => {
      const schema = await graphqlAdapter.loadSchema(hasuraConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        hasuraConfig,
        {
          Product: { syncMode: "on-demand" },
        },
      );

      const productEntity = result.entities.find((e) => e.name === "Product");
      expect(productEntity?.syncMode).toBe("on-demand");
    });

    it("applies predicateMapping override from config", async () => {
      const schema = await graphqlAdapter.loadSchema(hasuraConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        hasuraConfig,
        {
          Product: { predicateMapping: "prisma" },
        },
      );

      const productEntity = result.entities.find((e) => e.name === "Product");
      expect(productEntity?.predicateMapping).toBe("prisma");
    });

    it("generates on-demand collection with predicate translator", async () => {
      const schema = await graphqlAdapter.loadSchema(hasuraConfig);
      const result = graphqlAdapter.generateCollections(schema, hasuraConfig, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "hasura-api",
        collectionOverrides: {
          Product: { syncMode: "on-demand" },
        },
      });

      // Should import predicate utilities
      expect(result.content).toContain("parseLoadSubsetOptions");
      expect(result.content).toContain("LoadSubsetOptions");

      // Should generate translator function
      expect(result.content).toContain("function translateProductPredicates");

      // Should set syncMode
      expect(result.content).toContain('syncMode: "on-demand"');

      // Should use translator in queryFn
      expect(result.content).toContain("ctx.meta?.loadSubsetOptions");
      expect(result.content).toContain("translateProductPredicates");
    });

    it("generates hasura predicate translator by default", async () => {
      const schema = await graphqlAdapter.loadSchema(hasuraConfig);
      const result = graphqlAdapter.generateCollections(schema, hasuraConfig, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "hasura-api",
        collectionOverrides: {
          Product: { syncMode: "on-demand" },
        },
      });

      // Should have Hasura style filter handling
      expect(result.content).toContain("Hasura GraphQL variables");
      expect(result.content).toContain("_eq: filter.value");
      expect(result.content).toContain("_and: whereConditions");
    });

    it("generates prisma predicate translator when configured", async () => {
      const schema = await graphqlAdapter.loadSchema(hasuraConfig);
      const result = graphqlAdapter.generateCollections(schema, hasuraConfig, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "hasura-api",
        collectionOverrides: {
          Product: { syncMode: "on-demand", predicateMapping: "prisma" },
        },
      });

      // Should have Prisma style filter handling
      expect(result.content).toContain("Prisma GraphQL variables");
      expect(result.content).toContain("equals: filter.value");
      expect(result.content).toContain("AND: whereConditions");
    });

    it("does not generate predicate translator for full sync mode", async () => {
      const schema = await graphqlAdapter.loadSchema(hasuraConfig);
      const result = graphqlAdapter.generateCollections(schema, hasuraConfig, {
        typesImportPath: "./types",
        functionsImportPath: "../functions",
        sourceName: "hasura-api",
      });

      // Should NOT have predicate imports or translator
      expect(result.content).not.toContain("parseLoadSubsetOptions");
      expect(result.content).not.toContain("translateProductPredicates");
      expect(result.content).not.toContain('syncMode: "on-demand"');
    });
  });

  describe("custom scalar validation", () => {
    const scalarTestConfig: GraphQLSourceConfig = {
      name: "test-api",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/**/*.graphql",
      generates: ["query"],
    };

    const schemaWithCustomScalar = buildSchema(`
      scalar Cursor
      scalar DateTime

      type Query {
        items(after: Cursor): [Item!]!
      }

      type Item {
        id: ID!
        createdAt: DateTime!
      }
    `);

    const testSchemaWithScalar: GraphQLAdapterSchema = {
      schema: schemaWithCustomScalar,
      documents: {
        operations: [
          {
            name: "ListItems",
            operation: "query",
            node: {
              kind: Kind.OPERATION_DEFINITION,
              operation: OperationTypeNode.QUERY,
              name: { kind: Kind.NAME, value: "ListItems" },
              variableDefinitions: [
                {
                  kind: Kind.VARIABLE_DEFINITION,
                  variable: {
                    kind: Kind.VARIABLE,
                    name: { kind: Kind.NAME, value: "after" },
                  },
                  type: {
                    kind: Kind.NAMED_TYPE,
                    name: { kind: Kind.NAME, value: "Cursor" },
                  },
                },
              ],
              selectionSet: {
                kind: Kind.SELECTION_SET,
                selections: [],
              },
            },
            document:
              "query ListItems($after: Cursor) { items(after: $after) { id } }",
          },
        ],
        fragments: [],
      },
    };

    it("accepts valid zod scalar expressions", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "zod",
          scalars: { Cursor: "z.string()", DateTime: "z.string()" },
        }),
      ).not.toThrow();
    });

    it("accepts valid valibot scalar expressions", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "valibot",
          scalars: { Cursor: "v.string()", DateTime: "v.string()" },
        }),
      ).not.toThrow();
    });

    it("accepts valid arktype scalar expressions", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "arktype",
          scalars: { Cursor: 'type("string")', DateTime: 'type("string")' },
        }),
      ).not.toThrow();
    });

    it("accepts valid effect scalar expressions", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "effect",
          scalars: { Cursor: "Schema.String", DateTime: "Schema.String" },
        }),
      ).not.toThrow();
    });

    it("throws error for invalid zod scalar with helpful message", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "zod",
          scalars: { Cursor: "string" },
        }),
      ).toThrow(/Invalid scalar mapping for "Cursor": received "string"/);
    });

    it("suggests correct zod expression in error message", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "zod",
          scalars: { Cursor: "string" },
        }),
      ).toThrow(/Did you mean "z\.string\(\)"\?/);
    });

    it("throws error for invalid valibot scalar", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "valibot",
          scalars: { Cursor: "string" },
        }),
      ).toThrow(/Invalid scalar mapping for "Cursor": received "string"/);
    });

    it("suggests correct valibot expression in error message", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "valibot",
          scalars: { Cursor: "string" },
        }),
      ).toThrow(/Did you mean "v\.string\(\)"\?/);
    });

    it("throws error for invalid arktype scalar", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "arktype",
          scalars: { Cursor: "string" },
        }),
      ).toThrow(/Invalid scalar mapping for "Cursor": received "string"/);
    });

    it("suggests correct arktype expression in error message", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "arktype",
          scalars: { Cursor: "string" },
        }),
      ).toThrow(/Did you mean "type\("string"\)"\?/);
    });

    it("throws error for invalid effect scalar", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "effect",
          scalars: { Cursor: "string" },
        }),
      ).toThrow(/Invalid scalar mapping for "Cursor": received "string"/);
    });

    it("suggests correct effect expression in error message", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "effect",
          scalars: { Cursor: "string" },
        }),
      ).toThrow(/Did you mean "Schema\.String"\?/);
    });

    it("includes validator name in error message", () => {
      expect(() =>
        graphqlAdapter.generateSchemas(testSchemaWithScalar, scalarTestConfig, {
          validator: "zod",
          scalars: { Cursor: "Date" },
        }),
      ).toThrow(/For zod, scalar values must be valid zod expressions/);
    });
  });
});
