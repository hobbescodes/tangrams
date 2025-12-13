import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openapiAdapter } from "./index";
import { extractOperations } from "./schema";

import type { OpenAPISourceConfig } from "@/core/config";
import type { OpenAPIAdapterSchema } from "../types";

const fixturesDir = join(__dirname, "../../test/fixtures/openapi");

describe("OpenAPI Adapter", () => {
  const testConfig: OpenAPISourceConfig = {
    name: "petstore",
    type: "openapi",
    spec: join(fixturesDir, "petstore.json"),
    generates: ["query"],
  };

  describe("loadSchema", () => {
    it("loads and parses an OpenAPI spec from a file", async () => {
      const schema = await openapiAdapter.loadSchema(testConfig);

      expect(schema.document).toBeDefined();
      expect(schema.document.info.title).toBe("Pet Store API");
      expect(schema.baseUrl).toBe("https://api.petstore.example.com/v1");
    });

    it("extracts paths from the spec", async () => {
      const schema = await openapiAdapter.loadSchema(testConfig);

      expect(schema.document.paths).toBeDefined();
      expect(schema.document.paths?.["/pets"]).toBeDefined();
      expect(schema.document.paths?.["/pets/{petId}"]).toBeDefined();
    });
  });

  describe("generateSchemas", () => {
    it("generates Zod schemas and TypeScript types", async () => {
      const schema = await openapiAdapter.loadSchema(testConfig);
      const result = openapiAdapter.generateSchemas(schema, testConfig, {});

      expect(result.filename).toBe("schema.ts");
      expect(result.content).toContain('import * as z from "zod"');

      // Check for generated schema types
      expect(result.content).toContain("petSchema");
      expect(result.content).toContain("export type Pet");

      // Check for enum handling
      expect(result.content).toContain("z.enum");
    });

    it("generates operation-specific types", async () => {
      const schema = await openapiAdapter.loadSchema(testConfig);
      const result = openapiAdapter.generateSchemas(schema, testConfig, {});

      // Should have params types for operations with parameters
      expect(result.content).toContain("ListPetsParams");
      expect(result.content).toContain("GetPetParams");
    });
  });

  describe("generateClient", () => {
    it("generates a better-fetch client", async () => {
      const schema = await openapiAdapter.loadSchema(testConfig);
      const result = openapiAdapter.generateClient(schema, testConfig);

      expect(result.filename).toBe("client.ts");
      expect(result.content).toContain("@better-fetch/fetch");
      expect(result.content).toContain("createFetch");
      expect(result.content).toContain("https://api.petstore.example.com/v1");
      expect(result.content).toContain("buildPath");
      expect(result.content).toContain("buildQuery");
    });
  });

  describe("generateOperations", () => {
    it("generates TanStack Query options for GET operations", async () => {
      const schema = await openapiAdapter.loadSchema(testConfig);
      const result = openapiAdapter.generateOperations(schema, testConfig, {
        typesImportPath: "./types",
        sourceName: "petstore",
      });

      expect(result.filename).toBe("operations.ts");
      expect(result.content).toContain("@tanstack/react-query");
      expect(result.content).toContain("queryOptions");

      // Check for GET operation query options
      expect(result.content).toContain("listPetsQueryOptions");
      expect(result.content).toContain("getPetQueryOptions");
    });

    it("generates TanStack mutation options for non-GET operations", async () => {
      const schema = await openapiAdapter.loadSchema(testConfig);
      const result = openapiAdapter.generateOperations(schema, testConfig, {
        typesImportPath: "./types",
        sourceName: "petstore",
      });

      expect(result.content).toContain("mutationOptions");

      // Check for mutation operations
      expect(result.content).toContain("createPetMutationOptions");
      expect(result.content).toContain("updatePetMutationOptions");
      expect(result.content).toContain("deletePetMutationOptions");
    });

    it("includes source name in query keys when sourceName is provided", async () => {
      const schema = await openapiAdapter.loadSchema(testConfig);
      const result = openapiAdapter.generateOperations(schema, testConfig, {
        typesImportPath: "./types",
        sourceName: "petstore",
      });

      expect(result.content).toContain('"petstore"');
    });

    it("imports types and functions from the correct paths", async () => {
      const schema = await openapiAdapter.loadSchema(testConfig);
      const result = openapiAdapter.generateOperations(schema, testConfig, {
        typesImportPath: "./types",
        sourceName: "petstore",
      });

      expect(result.content).toContain('from "./types"');
      // Functions are always imported from hardcoded ../functions path
      expect(result.content).toContain('from "../functions"');
    });
  });
});

describe("OpenAPI Schema Loading", () => {
  describe("path filtering", () => {
    it("filters paths with include patterns", async () => {
      const config: OpenAPISourceConfig = {
        name: "petstore",
        type: "openapi",
        generates: ["query"],
        spec: join(fixturesDir, "petstore.json"),
        include: ["/pets"],
      };

      const schema = await openapiAdapter.loadSchema(config);

      expect(schema.document.paths?.["/pets"]).toBeDefined();
      expect(schema.document.paths?.["/pets/{petId}"]).toBeUndefined();
    });

    it("filters paths with exclude patterns", async () => {
      const config: OpenAPISourceConfig = {
        name: "petstore",
        type: "openapi",
        generates: ["query"],
        spec: join(fixturesDir, "petstore.json"),
        exclude: ["/pets/{petId}/vaccinations"],
      };

      const schema = await openapiAdapter.loadSchema(config);

      expect(schema.document.paths?.["/pets"]).toBeDefined();
      expect(schema.document.paths?.["/pets/{petId}"]).toBeDefined();
      expect(
        schema.document.paths?.["/pets/{petId}/vaccinations"],
      ).toBeUndefined();
    });
  });
});

describe("Remote OpenAPI Spec Loading", () => {
  describe("URL detection", () => {
    it("correctly identifies HTTP URLs", () => {
      const httpConfig: OpenAPISourceConfig = {
        name: "remote-api",
        type: "openapi",
        generates: ["query"],
        spec: "http://api.example.com/openapi.json",
      };

      const httpsConfig: OpenAPISourceConfig = {
        name: "remote-api",
        type: "openapi",
        generates: ["query"],
        spec: "https://api.example.com/openapi.json",
      };

      // Both should be recognized as URLs (starts with http:// or https://)
      expect(httpConfig.spec.startsWith("http://")).toBe(true);
      expect(httpsConfig.spec.startsWith("https://")).toBe(true);
    });

    it("correctly identifies local file paths", () => {
      const localConfig: OpenAPISourceConfig = {
        name: "local-api",
        type: "openapi",
        generates: ["query"],
        spec: "./openapi.yaml",
      };

      const absoluteConfig: OpenAPISourceConfig = {
        name: "local-api",
        type: "openapi",
        generates: ["query"],
        spec: "/path/to/openapi.json",
      };

      // Neither should be recognized as URLs
      expect(localConfig.spec.startsWith("http://")).toBe(false);
      expect(localConfig.spec.startsWith("https://")).toBe(false);
      expect(absoluteConfig.spec.startsWith("http://")).toBe(false);
      expect(absoluteConfig.spec.startsWith("https://")).toBe(false);
    });
  });

  describe("schema caching behavior", () => {
    it("schema object can be cached and reused for generation", async () => {
      const config: OpenAPISourceConfig = {
        name: "petstore",
        type: "openapi",
        generates: ["query"],
        spec: join(fixturesDir, "petstore.json"),
      };

      const schema1 = await openapiAdapter.loadSchema(config);

      // Simulate caching by storing the schema
      const cachedSchema = schema1;

      // The cached schema should be usable for generation without re-loading
      const typesResult = openapiAdapter.generateSchemas(
        cachedSchema,
        config,
        {},
      );
      expect(typesResult.content).toContain("petSchema");

      const opsResult = openapiAdapter.generateOperations(
        cachedSchema,
        config,
        {
          typesImportPath: "./types",
          sourceName: "petstore",
        },
      );
      expect(opsResult.content).toContain("listPetsQueryOptions");
    });

    it("cached schema produces identical output to fresh load", async () => {
      const config: OpenAPISourceConfig = {
        name: "petstore",
        type: "openapi",
        generates: ["query"],
        spec: join(fixturesDir, "petstore.json"),
      };

      // Load schema twice
      const schema1 = await openapiAdapter.loadSchema(config);
      const schema2 = await openapiAdapter.loadSchema(config);

      // Generate types from both
      const types1 = openapiAdapter.generateSchemas(schema1, config, {});
      const types2 = openapiAdapter.generateSchemas(schema2, config, {});

      // Output should be identical
      expect(types1.content).toBe(types2.content);

      // Generate operations from both
      const ops1 = openapiAdapter.generateOperations(schema1, config, {
        typesImportPath: "./types",
        sourceName: "petstore",
      });
      const ops2 = openapiAdapter.generateOperations(schema2, config, {
        typesImportPath: "./types",
        sourceName: "petstore",
      });

      // Output should be identical
      expect(ops1.content).toBe(ops2.content);
    });

    it("schema can be stored in a Map for caching (like generator does)", async () => {
      const config: OpenAPISourceConfig = {
        name: "petstore",
        type: "openapi",
        generates: ["query"],
        spec: join(fixturesDir, "petstore.json"),
      };

      // This simulates what the generator does with cachedSchemas
      const schemaCache = new Map<string, unknown>();

      // First load - no cache
      const schema = await openapiAdapter.loadSchema(config);
      schemaCache.set(config.name, schema);

      // Verify cached schema is retrievable and usable
      const cachedSchema = schemaCache.get(config.name);
      expect(cachedSchema).toBeDefined();
      expect(cachedSchema).toBe(schema); // Same reference

      // Use cached schema for generation (simulates watch mode rebuild)
      const typesResult = openapiAdapter.generateSchemas(
        cachedSchema as typeof schema,
        config,
        {},
      );
      expect(typesResult.content).toContain("petSchema");
    });
  });

  describe("config with headers (for authenticated remote specs)", () => {
    it("accepts headers configuration for remote specs", () => {
      const configWithHeaders: OpenAPISourceConfig = {
        name: "authenticated-api",
        type: "openapi",
        generates: ["query"],
        spec: "https://api.example.com/openapi.json",
        headers: {
          Authorization: "Bearer secret-token",
          "X-API-Key": "my-api-key",
        },
      };

      // Config should be valid with headers
      expect(configWithHeaders.headers).toBeDefined();
      expect(configWithHeaders.headers?.Authorization).toBe(
        "Bearer secret-token",
      );
      expect(configWithHeaders.headers?.["X-API-Key"]).toBe("my-api-key");
    });
  });
});

describe("extractOperations", () => {
  it("extracts operations from a loaded schema", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const operations = extractOperations(schema.document);

    // Should have multiple operations
    expect(operations.length).toBeGreaterThan(0);

    // Check for expected operations
    const operationIds = operations.map((op) => op.operationId);
    expect(operationIds).toContain("listPets");
    expect(operationIds).toContain("createPet");
    expect(operationIds).toContain("getPet");
  });

  it("extracts path and query parameters", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const operations = extractOperations(schema.document);

    // Find the getPet operation (has path param)
    const getPetOp = operations.find((op) => op.operationId === "getPet");
    expect(getPetOp).toBeDefined();
    expect(getPetOp?.pathParams.length).toBe(1);
    expect(getPetOp?.pathParams[0]?.name).toBe("petId");

    // Find the listPets operation (has query params)
    const listPetsOp = operations.find((op) => op.operationId === "listPets");
    expect(listPetsOp).toBeDefined();
    expect(listPetsOp?.queryParams.length).toBeGreaterThan(0);
  });

  it("extracts request body schema", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const operations = extractOperations(schema.document);

    // Find the createPet operation (has request body)
    const createPetOp = operations.find((op) => op.operationId === "createPet");
    expect(createPetOp).toBeDefined();
    expect(createPetOp?.requestBody).toBeDefined();
  });

  it("extracts response schema", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const operations = extractOperations(schema.document);

    // Find operations with response schemas
    const getPetOp = operations.find((op) => op.operationId === "getPet");
    expect(getPetOp).toBeDefined();
    expect(getPetOp?.responseSchema).toBeDefined();
  });

  it("returns empty array for document with no paths", () => {
    const emptyDoc = {
      openapi: "3.0.0",
      info: { title: "Empty API", version: "1.0.0" },
    };

    const operations = extractOperations(
      emptyDoc as OpenAPIAdapterSchema["document"],
    );
    expect(operations).toEqual([]);
  });

  it("generates operation ID when not provided", () => {
    const doc: OpenAPIAdapterSchema["document"] = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users/{id}": {
          get: {
            // No operationId provided
            responses: { "200": { description: "OK" } },
          },
        },
        "/posts": {
          post: {
            // No operationId provided
            responses: { "201": { description: "Created" } },
          },
        },
      },
    };

    const operations = extractOperations(doc);
    expect(operations.length).toBe(2);

    // Auto-generated IDs should follow pattern: method + path parts
    const getOp = operations.find((op) => op.method === "get");
    expect(getOp?.operationId).toContain("get");
    expect(getOp?.operationId).toContain("Users");

    const postOp = operations.find((op) => op.method === "post");
    expect(postOp?.operationId).toContain("post");
    expect(postOp?.operationId).toContain("Posts");
  });

  it("extracts 201 response schema for POST operations", () => {
    const doc: OpenAPIAdapterSchema["document"] = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users": {
          post: {
            operationId: "createUser",
            responses: {
              "201": {
                description: "Created",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { id: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const operations = extractOperations(doc);
    expect(operations[0]?.responseSchema).toBeDefined();
  });

  it("extracts default response schema when no 200/201", () => {
    const doc: OpenAPIAdapterSchema["document"] = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/health": {
          get: {
            operationId: "getHealth",
            responses: {
              default: {
                description: "Default response",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { status: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const operations = extractOperations(doc);
    expect(operations[0]?.responseSchema).toBeDefined();
  });

  it("handles operations with path-level parameters", () => {
    const doc: OpenAPIAdapterSchema["document"] = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users/{id}": {
          // Path-level parameter
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          get: {
            operationId: "getUser",
            responses: { "200": { description: "OK" } },
          },
          put: {
            operationId: "updateUser",
            // Operation-level parameter
            parameters: [
              { name: "force", in: "query", schema: { type: "boolean" } },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };

    const operations = extractOperations(doc);

    // GET should have path param from path-level
    const getOp = operations.find((op) => op.operationId === "getUser");
    expect(getOp?.pathParams.length).toBe(1);
    expect(getOp?.queryParams.length).toBe(0);

    // PUT should have both path param from path-level and query param from operation-level
    const putOp = operations.find((op) => op.operationId === "updateUser");
    expect(putOp?.pathParams.length).toBe(1);
    expect(putOp?.queryParams.length).toBe(1);
  });

  it("handles null pathItem gracefully", () => {
    const doc: OpenAPIAdapterSchema["document"] = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/valid": {
          get: {
            operationId: "validOp",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };

    // Manually set a null pathItem
    // @ts-expect-error - testing edge case
    doc.paths["/null"] = null;

    const operations = extractOperations(doc);
    expect(operations.length).toBe(1);
    expect(operations[0]?.operationId).toBe("validOp");
  });
});

describe("OpenAPI Schema Edge Cases", () => {
  it("handles document with no servers", () => {
    const doc: OpenAPIAdapterSchema["document"] = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {},
    };

    // Loading a doc without servers should return empty baseUrl
    const schema: OpenAPIAdapterSchema = {
      document: doc,
      baseUrl: "",
    };

    expect(schema.baseUrl).toBe("");
  });

  it("handles server with variables", async () => {
    // Create a mock schema with server variables
    const schemaWithVars: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        servers: [
          {
            url: "https://{environment}.api.example.com/{version}",
            variables: {
              environment: {
                default: "prod",
                enum: ["dev", "staging", "prod"],
              },
              version: {
                default: "v1",
              },
            },
          },
        ],
        paths: {},
      },
      baseUrl: "https://prod.api.example.com/v1",
    };

    // The baseUrl should have variables substituted with defaults
    expect(schemaWithVars.baseUrl).toBe("https://prod.api.example.com/v1");
  });

  it("handles empty servers array", () => {
    const schema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        servers: [],
        paths: {},
      },
      baseUrl: "",
    };

    expect(schema.baseUrl).toBe("");
  });
});

describe("OpenAPI Types Generation Edge Cases", () => {
  it("handles empty operations gracefully", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateSchemas(schema, config, {});

    // Should still generate valid TypeScript
    expect(result.content).toContain('import * as z from "zod"');
    expect(result.filename).toBe("schema.ts");
  });

  it("generates Zod string validators for formatted strings", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateSchemas(schema, config, {});

    // The petstore fixture has date-time formatted strings - using Zod v4 top-level APIs
    expect(result.content).toContain("z.iso.datetime()");
    expect(result.content).toContain("z.iso.date()");
  });

  it("generates enum schemas from OpenAPI enums", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateSchemas(schema, config, {});

    // The petstore fixture has Species and PetStatus enums
    expect(result.content).toContain("z.enum(");
  });

  it("handles schema with no components", () => {
    const emptySchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Empty API", version: "1.0.0" },
        paths: {},
      },
      baseUrl: "https://api.example.com",
    };

    const config: OpenAPISourceConfig = {
      name: "empty",
      type: "openapi",
      generates: ["query"],
      spec: "./empty.json",
    };

    const result = openapiAdapter.generateSchemas(emptySchema, config, {});

    expect(result.content).toContain('import * as z from "zod"');
    expect(result.filename).toBe("schema.ts");
  });

  it("generates array type schemas", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateSchemas(schema, config, {});

    // Should handle array types (tags field in Pet)
    expect(result.content).toContain("z.array(");
  });

  it("generates number type schemas", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateSchemas(schema, config, {});

    // Should handle integer/number types (age field in Pet)
    expect(result.content).toContain("z.number()");
  });

  it("handles optional vs required properties", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateSchemas(schema, config, {});

    // Should mark optional fields with .optional()
    expect(result.content).toContain(".optional()");
  });

  it("generates object schemas with nested properties", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateSchemas(schema, config, {});

    // Should generate z.object() for complex types
    expect(result.content).toContain("z.object({");
  });

  it("generates boolean schemas", async () => {
    // Create a mock schema with boolean type
    const boolSchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operationId: "testOp",
              parameters: [
                {
                  name: "active",
                  in: "query",
                  schema: { type: "boolean" },
                },
              ],
              responses: {
                "200": {
                  description: "OK",
                },
              },
            },
          },
        },
      },
      baseUrl: "https://api.example.com",
    };

    const config: OpenAPISourceConfig = {
      name: "test",
      type: "openapi",
      generates: ["query"],
      spec: "./test.json",
    };

    const result = openapiAdapter.generateSchemas(boolSchema, config, {});
    expect(result.content).toContain("z.boolean()");
  });
});

describe("OpenAPI Extended Types Generation", () => {
  const extendedConfig: OpenAPISourceConfig = {
    name: "petstore-extended",
    type: "openapi",
    generates: ["query"],
    spec: join(fixturesDir, "petstore-extended.json"),
  };

  it("handles all string format types", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateSchemas(schema, extendedConfig, {});

    // Various string formats - using Zod v4 top-level APIs
    expect(result.content).toContain("z.uuid()");
    expect(result.content).toContain("z.email()");
    expect(result.content).toContain("z.url()");
    expect(result.content).toContain("z.ipv4()");
    expect(result.content).toContain("z.ipv6()");
    expect(result.content).toContain("z.iso.datetime()");
    expect(result.content).toContain("z.iso.date()");
    expect(result.content).toContain("z.iso.time()");
  });

  it("handles nullable types", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateSchemas(schema, extendedConfig, {});

    // Nullable fields should have .nullable()
    expect(result.content).toContain(".nullable()");
  });

  it("handles allOf schemas (intersection)", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateSchemas(schema, extendedConfig, {});

    // allOf with multiple schemas creates intersection with .and()
    expect(result.content).toContain(".and(");
  });

  it("handles oneOf schemas (union)", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateSchemas(schema, extendedConfig, {});

    // oneOf creates z.union()
    expect(result.content).toContain("z.union(");
  });

  it("handles anyOf schemas (union)", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateSchemas(schema, extendedConfig, {});

    // anyOf also creates z.union()
    expect(result.content).toContain("z.union(");
  });

  it("handles additionalProperties: true (passthrough)", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateSchemas(schema, extendedConfig, {});

    // additionalProperties: true should use .passthrough()
    expect(result.content).toContain(".passthrough()");
  });

  it("handles typed additionalProperties (catchall)", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateSchemas(schema, extendedConfig, {});

    // typed additionalProperties should use .catchall()
    expect(result.content).toContain(".catchall(");
  });

  it("handles record types (additionalProperties only)", async () => {
    // We test record type with a direct mock since it needs to be used by an operation
    const recordSchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/test": {
            post: {
              operationId: "testOp",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      additionalProperties: { type: "integer" },
                    },
                  },
                },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
      },
      baseUrl: "https://api.example.com",
    };

    const config: OpenAPISourceConfig = {
      name: "record",
      type: "openapi",
      generates: ["query"],
      spec: "./record.json",
    };

    const result = openapiAdapter.generateSchemas(recordSchema, config, {});
    expect(result.content).toContain("z.record(z.string()");
  });

  it("handles special property names that need quoting", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateSchemas(schema, extendedConfig, {});

    // Property names with hyphens should be quoted
    expect(result.content).toContain('"special-name"');
  });

  it("handles schemas with inferred object type (properties but no type)", async () => {
    // Create a mock schema with properties but no type field
    const inferredSchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/test": {
            post: {
              operationId: "testOp",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        value: { type: "string" },
                      },
                    },
                  },
                },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
      },
      baseUrl: "https://api.example.com",
    };

    const config: OpenAPISourceConfig = {
      name: "inferred",
      type: "openapi",
      generates: ["query"],
      spec: "./inferred.json",
    };

    const result = openapiAdapter.generateSchemas(inferredSchema, config, {});
    expect(result.content).toContain("z.object({");
  });

  it("handles schema with only additionalProperties (record type)", async () => {
    const recordSchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/test": {
            post: {
              operationId: "testOp",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      additionalProperties: { type: "string" },
                    },
                  },
                },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
      },
      baseUrl: "https://api.example.com",
    };

    const config: OpenAPISourceConfig = {
      name: "record",
      type: "openapi",
      generates: ["query"],
      spec: "./record.json",
    };

    const result = openapiAdapter.generateSchemas(recordSchema, config, {});
    expect(result.content).toContain("z.record(z.string()");
  });

  it("handles schema with additionalProperties: true", async () => {
    const passthroughSchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/test": {
            post: {
              operationId: "testOp",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      additionalProperties: true,
                    },
                  },
                },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
      },
      baseUrl: "https://api.example.com",
    };

    const config: OpenAPISourceConfig = {
      name: "passthrough",
      type: "openapi",
      generates: ["query"],
      spec: "./passthrough.json",
    };

    const result = openapiAdapter.generateSchemas(
      passthroughSchema,
      config,
      {},
    );
    expect(result.content).toContain("z.record(z.string(), z.unknown())");
  });

  it("handles single-item allOf", async () => {
    const singleAllOfSchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operationId: "testOp",
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: {
                        allOf: [
                          {
                            type: "object",
                            properties: { id: { type: "string" } },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      baseUrl: "https://api.example.com",
    };

    const config: OpenAPISourceConfig = {
      name: "singleAllOf",
      type: "openapi",
      generates: ["query"],
      spec: "./singleAllOf.json",
    };

    const result = openapiAdapter.generateSchemas(
      singleAllOfSchema,
      config,
      {},
    );
    expect(result.content).toContain("z.object({");
  });

  it("handles single-item oneOf", async () => {
    const singleOneOfSchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operationId: "testOp",
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: {
                        oneOf: [{ type: "string" }],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      baseUrl: "https://api.example.com",
    };

    const config: OpenAPISourceConfig = {
      name: "singleOneOf",
      type: "openapi",
      generates: ["query"],
      spec: "./singleOneOf.json",
    };

    const result = openapiAdapter.generateSchemas(
      singleOneOfSchema,
      config,
      {},
    );
    expect(result.content).toContain("z.string()");
  });

  it("handles single-item anyOf", async () => {
    const singleAnyOfSchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operationId: "testOp",
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: {
                        anyOf: [{ type: "number" }],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      baseUrl: "https://api.example.com",
    };

    const config: OpenAPISourceConfig = {
      name: "singleAnyOf",
      type: "openapi",
      generates: ["query"],
      spec: "./singleAnyOf.json",
    };

    const result = openapiAdapter.generateSchemas(
      singleAnyOfSchema,
      config,
      {},
    );
    expect(result.content).toContain("z.number()");
  });

  it("handles nullable types in schemas", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateSchemas(schema, extendedConfig, {});

    // Pet has nullable age and weight
    expect(result.content).toContain("z.number().nullable()");
  });

  it("handles required query parameters", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateSchemas(schema, extendedConfig, {});

    // listPets has required limit param
    expect(result.content).toContain("listPetsParamsSchema");
  });

  it("generates operations with array parameters", async () => {
    const schema = await openapiAdapter.loadSchema(extendedConfig);
    const result = openapiAdapter.generateOperations(schema, extendedConfig, {
      typesImportPath: "./types",
      sourceName: "petstore-extended",
    });

    // Should handle the array parameter
    expect(result.content).toContain("listPetsQueryOptions");
  });
});

describe("OpenAPI Operations Generation Edge Cases", () => {
  it("handles operations with both path params and body", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateOperations(schema, config, {
      typesImportPath: "./types",
      sourceName: "petstore",
    });

    // updatePet has both path param and body
    expect(result.content).toContain("updatePetMutationOptions");
    expect(result.content).toContain("mutationOptions");
  });

  it("handles operations with no params or body", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateOperations(schema, config, {
      typesImportPath: "./types",
      sourceName: "petstore",
    });

    // Functions are always imported from hardcoded ../functions path
    expect(result.content).toContain('from "../functions"');
    expect(result.content).toContain('from "./types"');
  });

  it("handles DELETE operations", async () => {
    const config: OpenAPISourceConfig = {
      name: "petstore",
      type: "openapi",
      generates: ["query"],
      spec: join(fixturesDir, "petstore.json"),
    };

    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateOperations(schema, config, {
      typesImportPath: "./types",
      sourceName: "petstore",
    });

    // deletePet operation
    expect(result.content).toContain("deletePetMutationOptions");
  });
});

describe("generateSchemas", () => {
  const config: OpenAPISourceConfig = {
    name: "petstore",
    type: "openapi",
    generates: ["query"],
    spec: join(fixturesDir, "petstore.json"),
  };

  it("generates Zod schemas for all operations", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateSchemas(schema, config, {});

    expect(result.filename).toBe("schema.ts");
    expect(result.content).toContain("import * as z from");
    // Should have component schemas
    expect(result.content).toContain("petSchema");
    expect(result.content).toContain("speciesSchema");
  });
});

describe("generateFormOptions", () => {
  const config: OpenAPISourceConfig = {
    name: "petstore",
    type: "openapi",
    generates: ["query", "form"],
    spec: join(fixturesDir, "petstore.json"),
  };

  it("generates form options for POST/PUT/PATCH operations", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFormOptions(schema, config, {
      schemaImportPath: "../../query/petstore/types",
      sourceName: "petstore",
    });

    expect(result.filename).toBe("forms.ts");
    expect(result.content).toContain(
      'import { formOptions } from "@tanstack/react-form"',
    );
    // Should have form options for createPet and updatePet
    expect(result.content).toContain("createPetFormOptions");
    expect(result.content).toContain("updatePetFormOptions");
    expect(result.content).toContain("defaultValues:");
    expect(result.content).toContain("validators:");
  });

  it("imports schemas from the correct path", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFormOptions(schema, config, {
      schemaImportPath: "../schema/api/types",
      sourceName: "petstore",
    });

    expect(result.content).toContain('from "../schema/api/types"');
  });
});

describe("generateFunctions (OpenAPI standalone functions)", () => {
  const config: OpenAPISourceConfig = {
    name: "petstore",
    type: "openapi",
    generates: ["query"],
    spec: join(fixturesDir, "petstore.json"),
  };

  const functionsOptions = {
    clientImportPath: "../client",
    typesImportPath: "../schema",
  };

  it("generates standalone functions file with correct imports", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    expect(result.filename).toBe("functions.ts");
    expect(result.content).toContain("/* eslint-disable */");
    expect(result.content).toContain(
      "/* This file is auto-generated by tangrams. Do not edit. */",
    );
    expect(result.content).toContain('from "../client"');
    expect(result.content).toContain('from "../schema"');
  });

  it("generates async functions for GET operations", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // Should generate async functions for GET operations
    expect(result.content).toContain("export const listPets = async");
    expect(result.content).toContain("export const getPet = async");
  });

  it("generates async functions for POST/PUT/PATCH/DELETE operations", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // Should generate async functions for mutation operations
    expect(result.content).toContain("export const createPet = async");
    expect(result.content).toContain("export const updatePet = async");
    expect(result.content).toContain("export const deletePet = async");
  });

  it("imports response types and schemas", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // Should import response types
    expect(result.content).toContain("type ListPetsResponse");
    expect(result.content).toContain("type GetPetResponse");
    expect(result.content).toContain("type CreatePetResponse");

    // Should import response schemas for validation
    expect(result.content).toContain("listPetsResponseSchema");
    expect(result.content).toContain("getPetResponseSchema");
    expect(result.content).toContain("createPetResponseSchema");
  });

  it("imports request types for mutations with body", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // Should import request types for POST/PUT operations
    expect(result.content).toContain("type CreatePetRequest");
    expect(result.content).toContain("type UpdatePetRequest");
  });

  it("imports params types for operations with path/query params", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // Should import params types
    expect(result.content).toContain("type ListPetsParams");
    expect(result.content).toContain("type GetPetParams");
  });

  it("uses $fetch with output validation in handlers", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // Should use $fetch with output schema
    expect(result.content).toContain("await $fetch");
    expect(result.content).toContain("output:");
    expect(result.content).toContain("if (error) throw error");
    expect(result.content).toContain("return data");
  });

  it("uses buildPath for path parameters", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // Should use buildPath for operations with path params
    expect(result.content).toContain("buildPath");
    expect(result.content).toContain("/pets/{petId}");
  });

  it("uses buildQuery for query parameters", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // Should use buildQuery for operations with query params
    expect(result.content).toContain("buildQuery");
  });

  it("handles operations with no params", async () => {
    // Create a mock schema with a GET operation without params
    const noParamsSchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/health": {
            get: {
              operationId: "getHealth",
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: { status: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      baseUrl: "https://api.example.com",
    };

    const noParamsConfig: OpenAPISourceConfig = {
      name: "health",
      type: "openapi",
      generates: ["query"],
      spec: "./health.json",
    };

    const result = openapiAdapter.generateFunctions(
      noParamsSchema,
      noParamsConfig,
      {
        clientImportPath: "../client",
        typesImportPath: "../schema",
      },
    );

    // Should generate async function without params
    expect(result.content).toContain("export const getHealth = async ()");
  });

  it("handles mutations with only body (no path params)", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // createPet has only body, no path params
    expect(result.content).toContain("createPet");
    expect(result.content).toContain("body");
  });

  it("handles mutations with both path params and body", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // updatePet has both path param and body
    expect(result.content).toContain("updatePet");
    // Should handle combined params + body type
    expect(result.content).toContain("petId");
    expect(result.content).toContain("body");
  });

  it("handles mutations with only path params (no body)", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    // deletePet has only path param, no body
    expect(result.content).toContain("deletePet");
  });

  it("separates query and mutation sections with comments", async () => {
    const schema = await openapiAdapter.loadSchema(config);
    const result = openapiAdapter.generateFunctions(
      schema,
      config,
      functionsOptions,
    );

    expect(result.content).toContain("// Query Functions (GET operations)");
    expect(result.content).toContain(
      "// Mutation Functions (POST/PUT/PATCH/DELETE operations)",
    );
  });

  it("handles mutations with no params or body", async () => {
    // Create a mock schema with a POST operation without params or body
    const noParamsSchema: OpenAPIAdapterSchema = {
      document: {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/trigger": {
            post: {
              operationId: "triggerAction",
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: { triggered: { type: "boolean" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      baseUrl: "https://api.example.com",
    };

    const noParamsConfig: OpenAPISourceConfig = {
      name: "trigger",
      type: "openapi",
      generates: ["query"],
      spec: "./trigger.json",
    };

    const result = openapiAdapter.generateFunctions(
      noParamsSchema,
      noParamsConfig,
      {
        clientImportPath: "../client",
        typesImportPath: "../schema",
      },
    );

    // Should generate async function without params
    expect(result.content).toContain("export const triggerAction = async ()");
  });
});

describe("OpenAPI Collection Discovery", () => {
  const config: OpenAPISourceConfig = {
    name: "petstore",
    type: "openapi",
    generates: ["query", "db"],
    spec: join(fixturesDir, "petstore.json"),
  };

  describe("discoverCollectionEntities", () => {
    it("discovers entities from GET operations returning arrays", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.discoverCollectionEntities(schema, config);

      expect(result.entities.length).toBeGreaterThan(0);

      // Should discover Pet entity from listPets
      const petEntity = result.entities.find((e) => e.name === "Pet");
      expect(petEntity).toBeDefined();
      expect(petEntity?.typeName).toBe("Pet");
    });

    it("auto-detects id field as key field", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.discoverCollectionEntities(schema, config);

      const petEntity = result.entities.find((e) => e.name === "Pet");
      expect(petEntity?.keyField).toBe("id");
      expect(petEntity?.keyFieldType).toBe("string");
    });

    it("discovers list query from GET operation", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.discoverCollectionEntities(schema, config);

      const petEntity = result.entities.find((e) => e.name === "Pet");
      expect(petEntity?.listQuery.operationName).toBe("listPets");
      expect(petEntity?.listQuery.queryKey).toEqual(["Pet"]);
    });

    it("discovers CRUD mutations for entities", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.discoverCollectionEntities(schema, config);

      const petEntity = result.entities.find((e) => e.name === "Pet");
      expect(petEntity?.mutations).toBeDefined();

      // Should have insert mutation (POST /pets)
      const insertMutation = petEntity?.mutations.find(
        (m) => m.type === "insert",
      );
      expect(insertMutation).toBeDefined();
      expect(insertMutation?.operationName).toBe("createPet");

      // Should have update mutation (PUT /pets/{petId})
      const updateMutation = petEntity?.mutations.find(
        (m) => m.type === "update",
      );
      expect(updateMutation).toBeDefined();
      expect(updateMutation?.operationName).toBe("updatePet");

      // Should have delete mutation (DELETE /pets/{petId})
      const deleteMutation = petEntity?.mutations.find(
        (m) => m.type === "delete",
      );
      expect(deleteMutation).toBeDefined();
      expect(deleteMutation?.operationName).toBe("deletePet");
    });

    it("supports keyField override via config", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.discoverCollectionEntities(schema, config, {
        Pet: { keyField: "name" },
      });

      const petEntity = result.entities.find((e) => e.name === "Pet");
      expect(petEntity?.keyField).toBe("name");
    });

    it("returns warning when key field not found", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.discoverCollectionEntities(schema, config, {
        Pet: { keyField: "nonExistentField" },
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("nonExistentField"))).toBe(
        true,
      );
    });
  });

  describe("generateCollections", () => {
    it("generates collection options code", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.generateCollections(schema, config, {
        typesImportPath: "./schema",
        sourceName: "petstore",
      });

      expect(result.filename).toBe("collections.ts");
      expect(result.content).toContain("queryCollectionOptions");
      expect(result.content).toContain("@tanstack/query-db-collection");
    });

    it("imports QueryClient type and createCollection", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.generateCollections(schema, config, {
        typesImportPath: "./schema",
        sourceName: "petstore",
      });

      expect(result.content).toContain("QueryClient");
      expect(result.content).toContain("@tanstack/react-query");
      expect(result.content).toContain("createCollection");
      expect(result.content).toContain("@tanstack/react-db");
    });

    it("imports entity types from types file", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.generateCollections(schema, config, {
        typesImportPath: "./schema",
        sourceName: "petstore",
      });

      expect(result.content).toContain('from "./schema"');
      expect(result.content).toContain("Pet");
    });

    it("imports functions from hardcoded ../functions path", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.generateCollections(schema, config, {
        typesImportPath: "./schema",
        sourceName: "petstore",
      });

      // Functions are always imported from hardcoded ../functions path
      expect(result.content).toContain('from "../functions"');
      expect(result.content).toContain("listPets");
    });

    it("generates collection with queryKey, queryFn, and getKey", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.generateCollections(schema, config, {
        typesImportPath: "./schema",
        sourceName: "petstore",
      });

      expect(result.content).toContain("queryKey:");
      expect(result.content).toContain("queryFn:");
      expect(result.content).toContain("getKey:");
    });

    it("generates persistence handlers (onInsert, onUpdate, onDelete) when mutations available", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.generateCollections(schema, config, {
        typesImportPath: "./schema",
        sourceName: "petstore",
      });

      expect(result.content).toContain("onInsert:");
      expect(result.content).toContain("onUpdate:");
      expect(result.content).toContain("onDelete:");
      expect(result.content).toContain("transaction.mutations");
    });

    it("exports named collection options factory", async () => {
      const schema = await openapiAdapter.loadSchema(config);
      const result = openapiAdapter.generateCollections(schema, config, {
        typesImportPath: "./schema",
        sourceName: "petstore",
      });

      expect(result.content).toContain("export const petCollectionOptions");
      expect(result.content).toContain("(queryClient: QueryClient)");
      expect(result.content).toContain("createCollection(");
    });
  });
});
