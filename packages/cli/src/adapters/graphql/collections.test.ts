import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { graphqlAdapter } from "./index";

import type { GraphQLSourceConfig } from "@/core/config";

const fixturesDir = join(__dirname, "../../test/fixtures/graphql");

describe("GraphQL Collection Discovery", () => {
  describe("Connection pattern (wrapped responses)", () => {
    const connectionConfig: GraphQLSourceConfig = {
      name: "api",
      type: "graphql",
      schema: { file: join(fixturesDir, "connection-schema.graphql") },
      documents: join(fixturesDir, "connection-operations.graphql"),
      generates: ["db"],
    };

    it("discovers entities from queries returning Connection types", async () => {
      const schema = await graphqlAdapter.loadSchema(connectionConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        connectionConfig,
      );

      expect(result.entities.length).toBeGreaterThan(0);

      // Should discover Pet entity from GetPets query
      const petEntity = result.entities.find((e) => e.name === "Pet");
      expect(petEntity).toBeDefined();
      expect(petEntity?.typeName).toBe("Pet");
    });

    it("detects selectorPath for wrapped responses", async () => {
      const schema = await graphqlAdapter.loadSchema(connectionConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        connectionConfig,
      );

      const petEntity = result.entities.find((e) => e.name === "Pet");
      expect(petEntity?.listQuery.selectorPath).toBe("pets.data");
    });

    it("discovers User entity with correct selectorPath", async () => {
      const schema = await graphqlAdapter.loadSchema(connectionConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        connectionConfig,
      );

      const userEntity = result.entities.find((e) => e.name === "User");
      expect(userEntity).toBeDefined();
      expect(userEntity?.listQuery.selectorPath).toBe("users.data");
    });

    it("discovers CRUD mutations for entities", async () => {
      const schema = await graphqlAdapter.loadSchema(connectionConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        connectionConfig,
      );

      const petEntity = result.entities.find((e) => e.name === "Pet");
      expect(petEntity?.mutations).toBeDefined();

      // Should have insert mutation
      const insertMutation = petEntity?.mutations.find(
        (m) => m.type === "insert",
      );
      expect(insertMutation).toBeDefined();
      expect(insertMutation?.operationName).toBe("CreatePet");

      // Should have update mutation
      const updateMutation = petEntity?.mutations.find(
        (m) => m.type === "update",
      );
      expect(updateMutation).toBeDefined();
      expect(updateMutation?.operationName).toBe("UpdatePet");

      // Should have delete mutation
      const deleteMutation = petEntity?.mutations.find(
        (m) => m.type === "delete",
      );
      expect(deleteMutation).toBeDefined();
      expect(deleteMutation?.operationName).toBe("DeletePet");
    });

    it("supports selectorPath override via config", async () => {
      const schema = await graphqlAdapter.loadSchema(connectionConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        connectionConfig,
        {
          Pet: { selectorPath: "pets.items" },
        },
      );

      const petEntity = result.entities.find((e) => e.name === "Pet");
      expect(petEntity?.listQuery.selectorPath).toBe("pets.items");
    });
  });

  describe("Direct array responses", () => {
    const directArrayConfig: GraphQLSourceConfig = {
      name: "api",
      type: "graphql",
      schema: { file: join(fixturesDir, "schema.graphql") },
      documents: join(fixturesDir, "user.graphql"),
      generates: ["db"],
    };

    it("discovers entities from queries returning direct arrays", async () => {
      const schema = await graphqlAdapter.loadSchema(directArrayConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        directArrayConfig,
      );

      // Should discover User entity
      const userEntity = result.entities.find((e) => e.name === "User");
      expect(userEntity).toBeDefined();
    });

    it("has selectorPath matching the response key for direct array responses", async () => {
      const schema = await graphqlAdapter.loadSchema(directArrayConfig);
      const result = graphqlAdapter.discoverCollectionEntities(
        schema,
        directArrayConfig,
      );

      const userEntity = result.entities.find((e) => e.name === "User");
      // Direct arrays should have selectorPath equal to the response key (field name)
      // because GraphQL responses are always { fieldName: data }, not just data
      expect(userEntity?.listQuery.selectorPath).toBe("users");
    });
  });

  describe("generateCollections", () => {
    const connectionConfig: GraphQLSourceConfig = {
      name: "api",
      type: "graphql",
      schema: { file: join(fixturesDir, "connection-schema.graphql") },
      documents: join(fixturesDir, "connection-operations.graphql"),
      generates: ["db"],
    };

    it("generates queryFn with selectorPath for wrapped responses", async () => {
      const schema = await graphqlAdapter.loadSchema(connectionConfig);
      const result = graphqlAdapter.generateCollections(
        schema,
        connectionConfig,
        {
          typesImportPath: "./schema",
          sourceName: "api",
        },
      );

      // Should generate response selector in queryFn
      expect(result.content).toContain("const response = await getPets()");
      expect(result.content).toContain("return response.pets.data");
    });

    it("generates collection options with correct imports", async () => {
      const schema = await graphqlAdapter.loadSchema(connectionConfig);
      const result = graphqlAdapter.generateCollections(
        schema,
        connectionConfig,
        {
          typesImportPath: "./schema",
          sourceName: "api",
        },
      );

      expect(result.filename).toBe("collections.ts");
      expect(result.content).toContain("queryCollectionOptions");
      expect(result.content).toContain("@tanstack/query-db-collection");
      expect(result.content).toContain("createCollection");
      expect(result.content).toContain("@tanstack/react-db");
    });

    it("generates correct mutation handlers", async () => {
      const schema = await graphqlAdapter.loadSchema(connectionConfig);
      const result = graphqlAdapter.generateCollections(
        schema,
        connectionConfig,
        {
          typesImportPath: "./schema",
          sourceName: "api",
        },
      );

      // Should have onInsert with input parameter
      expect(result.content).toContain("onInsert:");
      expect(result.content).toContain("createPet({ input: m.modified })");

      // Should have onUpdate with id and input
      expect(result.content).toContain("onUpdate:");
      expect(result.content).toContain(
        "updatePet({ id: m.original.id, input: m.changes })",
      );

      // Should have onDelete with id
      expect(result.content).toContain("onDelete:");
      expect(result.content).toContain("deletePet({ id: m.key })");
    });
  });
});
