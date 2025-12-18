import { Kind, OperationTypeNode, buildSchema, parse } from "graphql";
import { describe, expect, it } from "vitest";

import { generateGraphQLZodSchemas } from "./graphql";

import type {
  FragmentDefinitionNode,
  OperationDefinitionNode,
  VariableDefinitionNode,
} from "graphql";
import type {
  ParsedDocuments,
  ParsedFragment,
  ParsedOperation,
} from "@/core/documents";

// Helper to parse a GraphQL operation and create a ParsedOperation
function parseOperation(
  operationSource: string,
  operationType: "query" | "mutation" = "query",
): ParsedOperation {
  const doc = parse(operationSource);
  const opDef = doc.definitions[0] as OperationDefinitionNode;
  return {
    name: opDef.name?.value ?? "Anonymous",
    operation: operationType,
    node: opDef,
    document: operationSource,
  };
}

// Helper to parse a fragment
function parseFragment(fragmentSource: string): ParsedFragment {
  const doc = parse(fragmentSource);
  const fragDef = doc.definitions[0] as FragmentDefinitionNode;
  return {
    name: fragDef.name.value,
    typeName: fragDef.typeCondition.name.value,
    node: fragDef,
    document: fragmentSource,
  };
}

describe("GraphQL Zod Generator", () => {
  const testSchema = buildSchema(`
		scalar DateTime
		scalar JSON

		enum UserRole {
			ADMIN
			USER
			GUEST
		}

		enum Status {
			ACTIVE
			INACTIVE
		}

		input CreateUserInput {
			name: String!
			email: String!
			role: UserRole
			metadata: JSON
		}

		input UpdateUserInput {
			name: String
			email: String
			role: UserRole
		}

		input AddressInput {
			street: String!
			city: String!
			country: String!
		}

		input NestedInput {
			user: CreateUserInput!
			addresses: [AddressInput!]!
		}

		type User {
			id: ID!
			name: String!
			email: String!
			role: UserRole!
		}

		type Query {
			users: [User!]!
			user(id: ID!): User
		}

		type Mutation {
			createUser(input: CreateUserInput!): User!
			updateUser(id: ID!, input: UpdateUserInput!): User
			createNested(input: NestedInput!): User!
		}
	`);

  function createVariableDef(
    name: string,
    typeName: string,
    required = true,
  ): VariableDefinitionNode {
    if (required) {
      return {
        kind: Kind.VARIABLE_DEFINITION,
        variable: {
          kind: Kind.VARIABLE,
          name: { kind: Kind.NAME, value: name },
        },
        type: {
          kind: Kind.NON_NULL_TYPE,
          type: {
            kind: Kind.NAMED_TYPE,
            name: { kind: Kind.NAME, value: typeName },
          },
        },
      };
    }
    return {
      kind: Kind.VARIABLE_DEFINITION,
      variable: {
        kind: Kind.VARIABLE,
        name: { kind: Kind.NAME, value: name },
      },
      type: {
        kind: Kind.NAMED_TYPE,
        name: { kind: Kind.NAME, value: typeName },
      },
    };
  }

  function createMutationOperation(
    name: string,
    variables: VariableDefinitionNode[],
  ): ParsedOperation {
    return {
      name,
      operation: "mutation",
      node: {
        kind: Kind.OPERATION_DEFINITION,
        operation: OperationTypeNode.MUTATION,
        name: { kind: Kind.NAME, value: name },
        variableDefinitions: variables,
        selectionSet: { kind: Kind.SELECTION_SET, selections: [] },
      },
      document: `mutation ${name} { ... }`,
    };
  }

  function createDocuments(operations: ParsedOperation[]): ParsedDocuments {
    return { operations, fragments: [] };
  }

  describe("generateGraphQLZodSchemas", () => {
    it("generates Zod schemas for mutation input types", () => {
      const documents = createDocuments([
        createMutationOperation("CreateUser", [
          createVariableDef("input", "CreateUserInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(testSchema, documents);

      expect(result.content).toContain("import * as z from");
      expect(result.content).toContain("export const createUserInputSchema");
      expect(result.content).toContain("z.object({");
      expect(result.content).toContain("name: z.string()");
      expect(result.content).toContain("email: z.string()");
    });

    it("generates Zod schemas for enums", () => {
      const documents = createDocuments([
        createMutationOperation("CreateUser", [
          createVariableDef("input", "CreateUserInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(testSchema, documents);

      expect(result.content).toContain("userRoleSchema");
      expect(result.content).toContain('z.enum(["ADMIN", "USER", "GUEST"])');
    });

    it("handles optional fields correctly", () => {
      const documents = createDocuments([
        createMutationOperation("CreateUser", [
          createVariableDef("input", "CreateUserInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(testSchema, documents);

      // role is optional in CreateUserInput - uses .nullish() for compatibility
      expect(result.content).toContain("role: userRoleSchema.nullish()");
    });

    it("handles scalar mappings", () => {
      const documents = createDocuments([
        createMutationOperation("CreateUser", [
          createVariableDef("input", "CreateUserInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(testSchema, documents);

      // JSON scalar should map to z.unknown() with .nullish() for optional fields
      expect(result.content).toContain("metadata: z.unknown().nullish()");
    });

    it("allows custom scalar mappings", () => {
      const documents = createDocuments([
        createMutationOperation("CreateUser", [
          createVariableDef("input", "CreateUserInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(testSchema, documents, {
        scalars: { JSON: "z.record(z.string(), z.any())" },
      });

      expect(result.content).toContain("z.record(z.string(), z.any())");
    });

    it("generates schemas for nested input types", () => {
      const documents = createDocuments([
        createMutationOperation("CreateNested", [
          createVariableDef("input", "NestedInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(testSchema, documents);

      // Should generate both NestedInput and its dependencies
      expect(result.content).toContain("nestedInputSchema");
      expect(result.content).toContain("createUserInputSchema");
      expect(result.content).toContain("addressInputSchema");
    });

    it("handles arrays in input types", () => {
      const documents = createDocuments([
        createMutationOperation("CreateNested", [
          createVariableDef("input", "NestedInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(testSchema, documents);

      // NestedInput has addresses: [AddressInput!]!
      expect(result.content).toContain("z.array(addressInputSchema)");
    });

    it("generates empty output when no operations provided", () => {
      const documents = createDocuments([]);

      const result = generateGraphQLZodSchemas(testSchema, documents);

      expect(result.content).toContain("import * as z from");
      // No schemas generated
      expect(result.content).not.toContain("export const");
    });

    it("generates schemas for multiple mutations", () => {
      const documents = createDocuments([
        createMutationOperation("CreateUser", [
          createVariableDef("input", "CreateUserInput"),
        ]),
        createMutationOperation("UpdateUser", [
          createVariableDef("id", "ID"),
          createVariableDef("input", "UpdateUserInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(testSchema, documents);

      expect(result.content).toContain("createUserInputSchema");
      expect(result.content).toContain("updateUserInputSchema");
    });

    it("warns about unknown types", () => {
      const documents = createDocuments([
        createMutationOperation("UnknownMutation", [
          createVariableDef("input", "NonExistentInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(testSchema, documents);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("Unknown type");
    });

    it("warns about unknown scalar types", () => {
      const schemaWithUnknownScalar = buildSchema(`
				scalar CustomScalar
				
				input TestInput {
					value: CustomScalar!
				}

				type Query {
					test: String
				}

				type Mutation {
					test(input: TestInput!): String
				}
			`);

      const documents = createDocuments([
        createMutationOperation("Test", [
          createVariableDef("input", "TestInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(
        schemaWithUnknownScalar,
        documents,
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("Unknown scalar type");
      expect(result.content).toContain("z.unknown()"); // fallback
    });

    it("handles Boolean and Int scalar types", () => {
      const schemaWithScalars = buildSchema(`
				input FilterInput {
					active: Boolean!
					limit: Int
					offset: Float
				}

				type Query {
					test: String
				}

				type Mutation {
					filter(input: FilterInput!): String
				}
			`);

      const documents = createDocuments([
        createMutationOperation("Filter", [
          createVariableDef("input", "FilterInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(schemaWithScalars, documents);

      expect(result.content).toContain("active: z.boolean()");
      // Optional fields use .nullish() for compatibility between input/output semantics
      expect(result.content).toContain("limit: z.number().int().nullish()");
      expect(result.content).toContain("offset: z.number().nullish()");
    });

    it("handles DateTime scalar type", () => {
      const schemaWithDateTime = buildSchema(`
				scalar DateTime

				input EventInput {
					name: String!
					startDate: DateTime!
				}

				type Query {
					test: String
				}

				type Mutation {
					createEvent(input: EventInput!): String
				}
			`);

      const documents = createDocuments([
        createMutationOperation("CreateEvent", [
          createVariableDef("input", "EventInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(schemaWithDateTime, documents);

      expect(result.content).toContain("z.iso.datetime()");
    });

    it("handles list types with nullable inner types", () => {
      const schemaWithLists = buildSchema(`
				input TagsInput {
					names: [String]!
				}

				type Query {
					test: String
				}

				type Mutation {
					setTags(input: TagsInput!): String
				}
			`);

      const documents = createDocuments([
        createMutationOperation("SetTags", [
          createVariableDef("input", "TagsInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(schemaWithLists, documents);

      // [String]! = required array of nullable strings
      // The array is required (no .nullish()), but items use .nullish() for compatibility
      expect(result.content).toContain("z.array(z.string().nullish())");
    });

    it("handles ID scalar type in input fields", () => {
      const schemaWithID = buildSchema(`
				input GetByIdInput {
					id: ID!
				}

				type Query {
					test: String
				}

				type Mutation {
					getById(input: GetByIdInput!): String
				}
			`);

      const documents = createDocuments([
        createMutationOperation("GetById", [
          createVariableDef("input", "GetByIdInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(schemaWithID, documents);

      expect(result.content).toContain("id: z.string()");
    });

    it("handles list types with non-nullable inner types", () => {
      const schemaWithLists = buildSchema(`
				input TagsInput {
					names: [String!]!
				}

				type Query {
					test: String
				}

				type Mutation {
					setTags(input: TagsInput!): String
				}
			`);

      const documents = createDocuments([
        createMutationOperation("SetTags", [
          createVariableDef("input", "TagsInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(schemaWithLists, documents);

      // [String!]! = required array of required strings
      // No .nullable() on items, no .optional() on the field
      expect(result.content).toContain("names: z.array(z.string())");
      expect(result.content).not.toContain("z.array(z.string()).nullable()");
      expect(result.content).not.toContain("z.array(z.string()).optional()");
    });

    it("handles optional list types", () => {
      const schemaWithLists = buildSchema(`
				input TagsInput {
					names: [String!]
				}

				type Query {
					test: String
				}

				type Mutation {
					setTags(input: TagsInput!): String
				}
			`);

      const documents = createDocuments([
        createMutationOperation("SetTags", [
          createVariableDef("input", "TagsInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(schemaWithLists, documents);

      // [String!] = optional array of required strings
      // The array field uses .nullish() for compatibility, items are required
      expect(result.content).toContain("names: z.array(z.string()).nullish()");
    });
  });

  describe("query response types", () => {
    const querySchema = buildSchema(`
      enum Status {
        ACTIVE
        INACTIVE
      }

      type User {
        id: ID!
        name: String!
        email: String!
        status: Status!
      }

      type Post {
        id: ID!
        title: String!
        author: User!
      }

      type Query {
        user(id: ID!): User
        users: [User!]!
        post(id: ID!): Post
      }

      type Mutation {
        createUser(name: String!): User!
      }
    `);

    it("generates query response schemas", () => {
      const op = parseOperation(`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
            email
          }
        }
      `);
      const documents: ParsedDocuments = { operations: [op], fragments: [] };

      const result = generateGraphQLZodSchemas(querySchema, documents);

      expect(result.content).toContain("getUserQuerySchema");
      expect(result.content).toContain("GetUserQuery");
    });

    it("generates query variable schemas", () => {
      const op = parseOperation(`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
          }
        }
      `);
      const documents: ParsedDocuments = { operations: [op], fragments: [] };

      const result = generateGraphQLZodSchemas(querySchema, documents);

      expect(result.content).toContain("getUserQueryVariablesSchema");
      expect(result.content).toContain("GetUserQueryVariables");
    });

    it("generates mutation response schemas", () => {
      const op = parseOperation(
        `
        mutation CreateUser($name: String!) {
          createUser(name: $name) {
            id
            name
          }
        }
      `,
        "mutation",
      );
      const documents: ParsedDocuments = { operations: [op], fragments: [] };

      const result = generateGraphQLZodSchemas(querySchema, documents);

      expect(result.content).toContain("createUserMutationSchema");
      expect(result.content).toContain("CreateUserMutation");
    });

    it("generates mutation variable schemas", () => {
      const op = parseOperation(
        `
        mutation CreateUser($name: String!) {
          createUser(name: $name) {
            id
          }
        }
      `,
        "mutation",
      );
      const documents: ParsedDocuments = { operations: [op], fragments: [] };

      const result = generateGraphQLZodSchemas(querySchema, documents);

      expect(result.content).toContain("createUserMutationVariablesSchema");
      expect(result.content).toContain("CreateUserMutationVariables");
    });

    it("handles nullable query results", () => {
      const op = parseOperation(`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
          }
        }
      `);
      const documents: ParsedDocuments = { operations: [op], fragments: [] };

      const result = generateGraphQLZodSchemas(querySchema, documents);

      // user field returns User which is nullable - uses .nullish() for compatibility
      expect(result.content).toContain(".nullish()");
    });

    it("handles list query results", () => {
      const op = parseOperation(`
        query GetUsers {
          users {
            id
            name
          }
        }
      `);
      const documents: ParsedDocuments = { operations: [op], fragments: [] };

      const result = generateGraphQLZodSchemas(querySchema, documents);

      expect(result.content).toContain("z.array(");
    });

    it("handles nested object selections", () => {
      const op = parseOperation(`
        query GetPost($id: ID!) {
          post(id: $id) {
            id
            title
            author {
              id
              name
            }
          }
        }
      `);
      const documents: ParsedDocuments = { operations: [op], fragments: [] };

      const result = generateGraphQLZodSchemas(querySchema, documents);

      // Should have nested author object
      expect(result.content).toContain("author:");
    });
  });

  describe("fragment handling", () => {
    const fragmentSchema = buildSchema(`
      type User {
        id: ID!
        name: String!
        email: String!
      }

      type Query {
        user(id: ID!): User
      }
    `);

    it("generates fragment schemas", () => {
      const fragment = parseFragment(`
        fragment UserFields on User {
          id
          name
          email
        }
      `);
      const op = parseOperation(`
        query GetUser($id: ID!) {
          user(id: $id) {
            ...UserFields
          }
        }
      `);
      const documents: ParsedDocuments = {
        operations: [op],
        fragments: [fragment],
      };

      const result = generateGraphQLZodSchemas(fragmentSchema, documents);

      expect(result.content).toContain("userFieldsFragmentSchema");
      expect(result.content).toContain("UserFieldsFragment");
    });

    it("uses fragment spread in operation schemas", () => {
      const fragment = parseFragment(`
        fragment UserFields on User {
          id
          name
        }
      `);
      const op = parseOperation(`
        query GetUser($id: ID!) {
          user(id: $id) {
            ...UserFields
          }
        }
      `);
      const documents: ParsedDocuments = {
        operations: [op],
        fragments: [fragment],
      };

      const result = generateGraphQLZodSchemas(fragmentSchema, documents);

      // Operation should reference fragment schema
      expect(result.content).toContain("userFieldsFragmentSchema.shape");
    });
  });

  describe("type exports", () => {
    it("exports TypeScript types inferred from schemas", () => {
      const schema = buildSchema(`
        enum Role { ADMIN USER }
        input CreateUserInput { name: String! role: Role }
        type User { id: ID! name: String! }
        type Query { user: User }
        type Mutation { createUser(input: CreateUserInput!): User! }
      `);

      const op = parseOperation(
        `
        mutation CreateUser($input: CreateUserInput!) {
          createUser(input: $input) { id name }
        }
      `,
        "mutation",
      );
      const documents: ParsedDocuments = { operations: [op], fragments: [] };

      const result = generateGraphQLZodSchemas(schema, documents);

      // Should have type exports section
      expect(result.content).toContain("// TypeScript Types");
      expect(result.content).toContain("z.infer<typeof");
      expect(result.content).toContain("export type Role");
      expect(result.content).toContain("export type CreateUserInput");
    });
  });
});
