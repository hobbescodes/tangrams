/**
 * Simple test GraphQL server for testing tangen
 */
import { buildSchema } from "graphql";

const schema = buildSchema(`
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
`);

// Mock data
const users = [
  {
    id: "1",
    name: "John Doe",
    email: "john@example.com",
    avatarUrl: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    name: "Jane Smith",
    email: "jane@example.com",
    avatarUrl: "https://example.com/avatar.jpg",
    createdAt: new Date().toISOString(),
  },
];

const posts = [
  {
    id: "1",
    title: "Hello World",
    content: "This is my first post",
    published: true,
    authorId: "1",
    createdAt: new Date().toISOString(),
    tags: ["intro", "hello"],
  },
];

// Resolvers
const root = {
  user: ({ id }: { id: string }) => users.find((u) => u.id === id),
  users: ({ limit, offset }: { limit?: number; offset?: number }) => {
    const start = offset ?? 0;
    const end = limit ? start + limit : undefined;
    return users.slice(start, end);
  },
  posts: ({ authorId }: { authorId?: string }) =>
    authorId ? posts.filter((p) => p.authorId === authorId) : posts,
  createUser: ({
    input,
  }: {
    input: { name: string; email: string; avatarUrl?: string };
  }) => {
    const user = {
      id: String(users.length + 1),
      ...input,
      avatarUrl: input.avatarUrl ?? null,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    return user;
  },
  updateUser: ({
    id,
    input,
  }: {
    id: string;
    input: { name?: string; email?: string; avatarUrl?: string };
  }) => {
    const user = users.find((u) => u.id === id);
    if (!user) return null;
    Object.assign(user, input);
    return user;
  },
  deleteUser: ({ id }: { id: string }) => {
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) return false;
    users.splice(index, 1);
    return true;
  },
  createPost: ({
    input,
  }: {
    input: {
      title: string;
      content: string;
      authorId: string;
      tags?: string[];
    };
  }) => {
    const post = {
      id: String(posts.length + 1),
      ...input,
      published: false,
      createdAt: new Date().toISOString(),
      tags: input.tags ?? [],
    };
    posts.push(post);
    return post;
  },
};

// Start server using Bun.serve
import { graphql } from "graphql";

const server = Bun.serve({
  port: 4000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/graphql" && req.method === "POST") {
      const body = (await req.json()) as {
        query: string;
        variables?: Record<string, unknown>;
      };
      const result = await graphql({
        schema,
        source: body.query,
        rootValue: root,
        variableValues: body.variables,
      });

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("GraphQL server running at /graphql", { status: 200 });
  },
});

console.log(
  `GraphQL server running at http://localhost:${server.port}/graphql`,
);
