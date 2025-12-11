import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import consola from "consola";

import { generateClient } from "../generators/client";
import { generateOperations } from "../generators/operations";
import { generateTypes } from "../generators/types";
import { loadDocuments } from "./documents";
import { introspectSchema } from "./introspection";

import type { TangenConfig } from "./config";

/**
 * Main generation orchestrator
 */
export async function generate(config: TangenConfig): Promise<void> {
  const {
    schema: schemaConfig,
    client: clientConfig,
    output,
    scalars,
  } = config;

  // Step 1: Introspect schema
  consola.info(`Introspecting schema from ${schemaConfig.url}...`);
  const schema = await introspectSchema({
    url: schemaConfig.url,
    headers: schemaConfig.headers,
  });
  consola.success("Schema introspection complete");

  // Step 2: Load user documents
  consola.info("Loading GraphQL documents...");
  const documents = await loadDocuments(config.documents);
  consola.success(
    `Found ${documents.operations.length} operations and ${documents.fragments.length} fragments`,
  );

  // Step 3: Ensure output directory exists
  const outputDir = join(process.cwd(), output.dir);
  await mkdir(outputDir, { recursive: true });

  // Step 4: Generate client
  consola.info("Generating client...");
  const clientCode = generateClient({
    url: schemaConfig.url,
    headers: clientConfig?.headers,
  });
  const clientPath = join(outputDir, output.client);
  await writeFile(clientPath, clientCode, "utf-8");
  consola.success(`Generated ${output.client}`);

  // Step 5: Generate types
  consola.info("Generating types...");
  const typesCode = generateTypes({
    schema,
    documents,
    scalars,
  });
  const typesPath = join(outputDir, output.types);
  await writeFile(typesPath, typesCode, "utf-8");
  consola.success(`Generated ${output.types}`);

  // Step 6: Generate operations
  consola.info("Generating operations...");
  const operationsPath = join(outputDir, output.operations);

  // Calculate relative import paths
  const operationsDir = dirname(operationsPath);
  const clientImportPath = `./${relative(operationsDir, clientPath).replace(/\.ts$/, "")}`;
  const typesImportPath = `./${relative(operationsDir, typesPath).replace(/\.ts$/, "")}`;

  const operationsCode = generateOperations({
    documents,
    clientImportPath,
    typesImportPath,
  });
  await writeFile(operationsPath, operationsCode, "utf-8");
  consola.success(`Generated ${output.operations}`);

  consola.box({
    title: "Generation Complete",
    message: `Files generated in ${output.dir}:\n  - ${output.client}\n  - ${output.types}\n  - ${output.operations}`,
  });
}
