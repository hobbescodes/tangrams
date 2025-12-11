/**
 * GraphQL schema definition for testing
 * Extracted from test/server.ts
 */
export const schemaSDL = `
  type Query {
    user(id: ID!): User
    users(limit: Int, offset: Int): [User!]!
    posts(authorId: ID): [Post!]!
  }

  type Mutation {
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User
    deleteUser(id: ID!): Boolean!
    createPost(input: CreatePostInput!): Post!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    avatarUrl: String
    createdAt: DateTime!
    posts: [Post!]!
  }

  type Post {
    id: ID!
    title: String!
    content: String!
    published: Boolean!
    author: User!
    createdAt: DateTime!
    tags: [String!]!
  }

  input CreateUserInput {
    name: String!
    email: String!
    avatarUrl: String
  }

  input UpdateUserInput {
    name: String
    email: String
    avatarUrl: String
  }

  input CreatePostInput {
    title: String!
    content: String!
    authorId: ID!
    tags: [String!]
  }

  enum UserRole {
    ADMIN
    USER
    GUEST
  }

  scalar DateTime
`;

/**
 * Build a GraphQL schema from the SDL
 */
import { buildSchema } from "graphql";

export const testSchema = buildSchema(schemaSDL);
