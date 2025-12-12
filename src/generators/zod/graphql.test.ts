import { Kind, OperationTypeNode, buildSchema } from "graphql";
import { describe, expect, it } from "vitest";

import { generateGraphQLZodSchemas } from "./graphql";

import type { VariableDefinitionNode } from "graphql";
import type { ParsedDocuments, ParsedOperation } from "@/core/documents";

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

      // role is optional in CreateUserInput
      expect(result.content).toContain("role: userRoleSchema.optional()");
    });

    it("handles scalar mappings", () => {
      const documents = createDocuments([
        createMutationOperation("CreateUser", [
          createVariableDef("input", "CreateUserInput"),
        ]),
      ]);

      const result = generateGraphQLZodSchemas(testSchema, documents);

      // JSON scalar should map to z.unknown()
      expect(result.content).toContain("metadata: z.unknown().optional()");
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
      expect(result.content).toContain("limit: z.number().int().optional()");
      expect(result.content).toContain("offset: z.number().optional()");
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

      // List type generates z.array() with nullable wrapper
      expect(result.content).toContain("z.array(z.string()).nullable()");
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
  });
});
