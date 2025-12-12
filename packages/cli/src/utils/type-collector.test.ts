import { buildSchema, parse } from "graphql";
import { describe, expect, it } from "vitest";

import { collectUsedTypes } from "./type-collector";

import type { FragmentDefinitionNode } from "graphql";
import type { ParsedDocuments } from "@/core/documents";

/**
 * Helper to create ParsedDocuments from GraphQL source
 */
function createDocuments(source: string): ParsedDocuments {
  const document = parse(source);
  const operations: ParsedDocuments["operations"] = [];
  const fragments: ParsedDocuments["fragments"] = [];

  for (const definition of document.definitions) {
    if (definition.kind === "OperationDefinition") {
      const name = definition.name?.value;
      if (!name) throw new Error("Operations must be named");
      operations.push({
        name,
        operation: definition.operation as "query" | "mutation",
        node: definition,
        document: source,
      });
    } else if (definition.kind === "FragmentDefinition") {
      fragments.push({
        name: definition.name.value,
        typeName: definition.typeCondition.name.value,
        node: definition,
        document: source,
      });
    }
  }

  return { operations, fragments };
}

describe("collectUsedTypes", () => {
  describe("input types from variables", () => {
    it("collects input types used in mutation variables", () => {
      const schema = buildSchema(`
				type Query { dummy: String }
				type Mutation {
					createUser(input: CreateUserInput!): User!
				}
				type User { id: ID!, name: String! }
				input CreateUserInput {
					name: String!
					email: String!
				}
				input UnusedInput { foo: String }
			`);

      const documents = createDocuments(`
				mutation CreateUser($input: CreateUserInput!) {
					createUser(input: $input) { id name }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.usedTypes.has("CreateUserInput")).toBe(true);
      expect(result.usedTypes.has("UnusedInput")).toBe(false);
      expect(result.warnings).toEqual([]);
    });

    it("collects transitive input type dependencies", () => {
      const schema = buildSchema(`
				type Query { dummy: String }
				type Mutation {
					createUser(input: CreateUserInput!): User!
				}
				type User { id: ID! }
				input CreateUserInput {
					name: String!
					address: AddressInput!
				}
				input AddressInput {
					street: String!
					city: String!
				}
			`);

      const documents = createDocuments(`
				mutation CreateUser($input: CreateUserInput!) {
					createUser(input: $input) { id }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.usedTypes.has("CreateUserInput")).toBe(true);
      expect(result.usedTypes.has("AddressInput")).toBe(true);
    });

    it("handles circular input type references without infinite loop", () => {
      const schema = buildSchema(`
				type Query { dummy: String }
				type Mutation {
					createNode(input: NodeInput!): Node!
				}
				type Node { id: ID! }
				input NodeInput {
					name: String!
					children: [NodeInput!]
				}
			`);

      const documents = createDocuments(`
				mutation CreateNode($input: NodeInput!) {
					createNode(input: $input) { id }
				}
			`);

      // Should not hang or throw
      const result = collectUsedTypes(schema, documents);

      expect(result.usedTypes.has("NodeInput")).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("enums from variables", () => {
    it("collects enums used directly in variable types", () => {
      const schema = buildSchema(`
				type Query {
					usersByRole(role: UserRole!): [User!]!
				}
				type User { id: ID!, role: UserRole! }
				enum UserRole { ADMIN, USER, GUEST }
				enum UnusedEnum { FOO, BAR }
			`);

      const documents = createDocuments(`
				query UsersByRole($role: UserRole!) {
					usersByRole(role: $role) { id }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.usedTypes.has("UserRole")).toBe(true);
      expect(result.usedTypes.has("UnusedEnum")).toBe(false);
    });

    it("collects enums used in input type fields", () => {
      const schema = buildSchema(`
				type Query { dummy: String }
				type Mutation {
					createUser(input: CreateUserInput!): User!
				}
				type User { id: ID! }
				input CreateUserInput {
					name: String!
					role: UserRole!
				}
				enum UserRole { ADMIN, USER, GUEST }
			`);

      const documents = createDocuments(`
				mutation CreateUser($input: CreateUserInput!) {
					createUser(input: $input) { id }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.usedTypes.has("CreateUserInput")).toBe(true);
      expect(result.usedTypes.has("UserRole")).toBe(true);
    });
  });

  describe("enums from return types", () => {
    it("collects enums selected in query return types", () => {
      const schema = buildSchema(`
				type Query {
					user(id: ID!): User
				}
				type User {
					id: ID!
					role: UserRole!
				}
				enum UserRole { ADMIN, USER, GUEST }
			`);

      const documents = createDocuments(`
				query GetUser($id: ID!) {
					user(id: $id) { id role }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.usedTypes.has("UserRole")).toBe(true);
    });

    it("does not collect enums that are not selected", () => {
      const schema = buildSchema(`
				type Query {
					user(id: ID!): User
				}
				type User {
					id: ID!
					name: String!
					role: UserRole!
				}
				enum UserRole { ADMIN, USER, GUEST }
			`);

      const documents = createDocuments(`
				query GetUser($id: ID!) {
					user(id: $id) { id name }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      // role is not selected, so UserRole should not be included
      expect(result.usedTypes.has("UserRole")).toBe(false);
    });

    it("collects enums from nested selections", () => {
      const schema = buildSchema(`
				type Query {
					post(id: ID!): Post
				}
				type Post {
					id: ID!
					author: User!
				}
				type User {
					id: ID!
					role: UserRole!
				}
				enum UserRole { ADMIN, USER, GUEST }
			`);

      const documents = createDocuments(`
				query GetPost($id: ID!) {
					post(id: $id) {
						id
						author {
							id
							role
						}
					}
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.usedTypes.has("UserRole")).toBe(true);
    });

    it("collects enums from fragment selections", () => {
      const schema = buildSchema(`
				type Query {
					user(id: ID!): User
				}
				type User {
					id: ID!
					role: UserRole!
				}
				enum UserRole { ADMIN, USER, GUEST }
			`);

      const documents = createDocuments(`
				fragment UserFields on User {
					id
					role
				}
				query GetUser($id: ID!) {
					user(id: $id) { ...UserFields }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.usedTypes.has("UserRole")).toBe(true);
    });
  });

  describe("warnings", () => {
    it("warns when variable references unknown type", () => {
      const schema = buildSchema(`
				type Query { dummy: String }
			`);

      const documents = createDocuments(`
				query GetUser($input: UnknownInput!) {
					dummy
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.warnings).toContain(
        'Operation "GetUser" references unknown type "UnknownInput"',
      );
    });

    it("warns when fragment is on unknown type", () => {
      const schema = buildSchema(`
				type Query { dummy: String }
			`);

      const documents: ParsedDocuments = {
        operations: [],
        fragments: [
          {
            name: "UnknownFields",
            typeName: "UnknownType",
            node: parse(`fragment UnknownFields on UnknownType { id }`)
              .definitions[0] as FragmentDefinitionNode,
            document: "fragment UnknownFields on UnknownType { id }",
          },
        ],
      };

      const result = collectUsedTypes(schema, documents);

      expect(result.warnings).toContain(
        'Fragment "UnknownFields" is defined on unknown type "UnknownType"',
      );
    });

    it("does not warn for built-in scalars", () => {
      const schema = buildSchema(`
				type Query {
					user(id: ID!): User
				}
				type User { id: ID!, name: String! }
			`);

      const documents = createDocuments(`
				query GetUser($id: ID!) {
					user(id: $id) { id name }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.warnings).toEqual([]);
    });
  });

  describe("complex scenarios", () => {
    it("handles multiple operations with overlapping types", () => {
      const schema = buildSchema(`
				type Query {
					user(id: ID!): User
				}
				type Mutation {
					createUser(input: CreateUserInput!): User!
					updateUser(id: ID!, input: UpdateUserInput!): User
				}
				type User { id: ID!, name: String! }
				input CreateUserInput { name: String! }
				input UpdateUserInput { name: String }
				input UnusedInput { foo: String }
			`);

      const documents = createDocuments(`
				query GetUser($id: ID!) {
					user(id: $id) { id name }
				}
				mutation CreateUser($input: CreateUserInput!) {
					createUser(input: $input) { id name }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.usedTypes.has("CreateUserInput")).toBe(true);
      expect(result.usedTypes.has("UpdateUserInput")).toBe(false);
      expect(result.usedTypes.has("UnusedInput")).toBe(false);
    });

    it("handles deeply nested transitive dependencies", () => {
      const schema = buildSchema(`
				type Query { dummy: String }
				type Mutation {
					create(input: Level1Input!): Result!
				}
				type Result { ok: Boolean! }
				input Level1Input {
					level2: Level2Input!
				}
				input Level2Input {
					level3: Level3Input!
				}
				input Level3Input {
					value: String!
					status: Status!
				}
				enum Status { ACTIVE, INACTIVE }
			`);

      const documents = createDocuments(`
				mutation Create($input: Level1Input!) {
					create(input: $input) { ok }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      expect(result.usedTypes.has("Level1Input")).toBe(true);
      expect(result.usedTypes.has("Level2Input")).toBe(true);
      expect(result.usedTypes.has("Level3Input")).toBe(true);
      expect(result.usedTypes.has("Status")).toBe(true);
    });

    it("collects types from unused fragments that are defined", () => {
      const schema = buildSchema(`
				type Query {
					user(id: ID!): User
				}
				type User {
					id: ID!
					role: UserRole!
				}
				enum UserRole { ADMIN, USER, GUEST }
			`);

      // Fragment is defined but not used in any operation
      const documents = createDocuments(`
				fragment UserWithRole on User {
					id
					role
				}
				query GetUser($id: ID!) {
					user(id: $id) { id }
				}
			`);

      const result = collectUsedTypes(schema, documents);

      // Fragment is defined, so its types should be collected
      // even though no operation uses the fragment
      expect(result.usedTypes.has("UserRole")).toBe(true);
    });
  });
});
