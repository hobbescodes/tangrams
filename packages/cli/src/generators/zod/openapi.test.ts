import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";

import { extractOperations } from "@/adapters/openapi/schema";
import { generateOpenAPIZodSchemas } from "./openapi";

import type { OpenAPIV3 } from "openapi-types";

describe("OpenAPI Zod Generator", () => {
  describe("generateOpenAPIZodSchemas", () => {
    it("generates Zod schemas for all operations", async () => {
      const document = (await SwaggerParser.dereference(
        "src/test/fixtures/openapi/petstore.json",
      )) as OpenAPIV3.Document;
      const operations = extractOperations(document);

      const result = generateOpenAPIZodSchemas(document, operations);

      // Should generate schemas
      expect(result.content).toContain("import * as z from");
      expect(result.content).toContain("export const");

      // Should generate input schemas (request body references component schemas)
      expect(result.content).toContain("createPetInputSchema");
      expect(result.content).toContain("updatePetInputSchema");

      // Should generate component schemas (enums)
      expect(result.content).toContain("speciesSchema");
      expect(result.content).toContain("petStatusSchema");
    });

    it("generates correct Zod types for enums", async () => {
      const document = (await SwaggerParser.dereference(
        "src/test/fixtures/openapi/petstore.json",
      )) as OpenAPIV3.Document;
      const operations = extractOperations(document);

      const result = generateOpenAPIZodSchemas(document, operations);

      // Should generate enum schemas
      expect(result.content).toContain(
        'z.enum(["dog", "cat", "bird", "fish", "other"])',
      );
      expect(result.content).toContain(
        'z.enum(["available", "pending", "adopted"])',
      );
    });

    it("generates correct Zod types for objects with required fields", async () => {
      const document = (await SwaggerParser.dereference(
        "src/test/fixtures/openapi/petstore.json",
      )) as OpenAPIV3.Document;
      const operations = extractOperations(document);

      const result = generateOpenAPIZodSchemas(document, operations);

      // CreatePetInput has name and species as required
      expect(result.content).toContain("name: z.string()");
      expect(result.content).toContain("speciesSchema");
    });

    it("handles string format types", async () => {
      const document = (await SwaggerParser.dereference(
        "src/test/fixtures/openapi/petstore.json",
      )) as OpenAPIV3.Document;
      const operations = extractOperations(document);

      const result = generateOpenAPIZodSchemas(document, operations);

      // Should use z.iso.date() for date format
      expect(result.content).toContain("z.iso.date()");
      // Should use z.iso.datetime() for date-time format
      expect(result.content).toContain("z.iso.datetime()");
    });

    it("handles arrays correctly", async () => {
      const document = (await SwaggerParser.dereference(
        "src/test/fixtures/openapi/petstore.json",
      )) as OpenAPIV3.Document;
      const operations = extractOperations(document);

      const result = generateOpenAPIZodSchemas(document, operations);

      // Tags is an array of strings
      expect(result.content).toContain("z.array(z.string())");
    });

    it("filters operations by operationIds", async () => {
      const document = (await SwaggerParser.dereference(
        "src/test/fixtures/openapi/petstore.json",
      )) as OpenAPIV3.Document;
      const operations = extractOperations(document);

      const result = generateOpenAPIZodSchemas(document, operations, {
        operationIds: ["createPet"],
      });

      // Should generate the input schema for createPet
      expect(result.content).toContain("createPetInputSchema");
      // Should not generate updatePetInput since we filtered to createPet only
      expect(result.content).not.toContain("updatePetInputSchema");
    });
  });
});
