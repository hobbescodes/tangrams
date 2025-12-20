/**
 * OpenAPI standalone functions generation
 *
 * Generates standalone async fetch functions for OpenAPI operations.
 * These functions are imported by both operations.ts (for queryOptions/mutationOptions)
 * and collections.ts (for TanStack DB persistence handlers).
 */

import {
  createWriter,
  writeHeader,
  writeImport,
  writeSectionComment,
} from "@/utils/writer";

import type CodeBlockWriter from "code-block-writer";
import type { ValidatorLibrary } from "@/core/config";
import type { GeneratedFile } from "../types";
import type { ParsedOperation } from "./schema";

export interface OpenAPIFunctionsGenOptions {
  /** Relative import path to the client file */
  clientImportPath: string;
  /** Relative import path to the schema file */
  schemaImportPath: string;
  /** Validation library (needed for Effect's Standard Schema wrapper) */
  validatorLibrary?: ValidatorLibrary;
}

/**
 * Generate standalone fetch functions from OpenAPI spec
 */
export function generateOpenAPIFunctions(
  operations: ParsedOperation[],
  options: OpenAPIFunctionsGenOptions,
): GeneratedFile {
  const writer = createWriter();
  const isEffect = options.validatorLibrary === "effect";

  writeHeader(writer);

  // Effect needs Schema import for standardSchemaV1 wrapper
  if (isEffect) {
    writer.writeLine('import { Schema } from "effect"');
    writer.blankLine();
  }

  // Separate operations by type
  const queries = operations.filter((op) => ["get"].includes(op.method));
  const mutations = operations.filter((op) =>
    ["post", "put", "patch", "delete"].includes(op.method),
  );

  // Import client helpers (internal import)
  writer.writeLine(
    `import { getClient, buildPath, buildQuery } from "${options.clientImportPath}"`,
  );

  // Schema value imports (internal import)
  const { typeImports, schemaImports } = generateImports(operations);
  if (schemaImports.length > 0) {
    writer.blankLine();
    writeImport(writer, options.schemaImportPath, schemaImports, false);
  }

  // Type imports (always last, separated by blank line)
  if (typeImports.length > 0) {
    writer.blankLine();
    writeImport(writer, options.schemaImportPath, typeImports, true);
  }

  writer.blankLine();

  // Generate query functions for GET operations
  if (queries.length > 0) {
    writeSectionComment(writer, "Query Functions (GET operations)");
    for (const op of queries) {
      writeQueryFunction(writer, op, isEffect);
      writer.blankLine();
    }
  }

  // Generate mutation functions for POST/PUT/PATCH/DELETE operations
  if (mutations.length > 0) {
    writeSectionComment(
      writer,
      "Mutation Functions (POST/PUT/PATCH/DELETE operations)",
    );
    for (const op of mutations) {
      writeMutationFunction(writer, op, isEffect);
      writer.blankLine();
    }
  }

  return {
    filename: "functions.ts",
    content: writer.toString(),
  };
}

/**
 * Generate imports for types and schemas (sorted alphabetically)
 */
function generateImports(operations: ParsedOperation[]): {
  typeImports: string[];
  schemaImports: string[];
} {
  const typeImportsSet = new Set<string>();
  const schemaImportsSet = new Set<string>();

  for (const op of operations) {
    const baseName = toPascalCase(op.operationId);
    const hasParams = op.pathParams.length > 0 || op.queryParams.length > 0;

    // Response type and schema
    if (op.responseSchema) {
      typeImportsSet.add(`${baseName}Response`);
      schemaImportsSet.add(toSchemaName(`${baseName}Response`));
    }

    // Request body type
    if (op.requestBody) {
      typeImportsSet.add(`${baseName}Request`);
    }

    // Params type - only for GET operations (queries use the Params type, mutations use inline types)
    const isQuery = op.method === "get";
    if (hasParams && isQuery) {
      typeImportsSet.add(`${baseName}Params`);
    }
  }

  return {
    typeImports: [...typeImportsSet].sort(),
    schemaImports: [...schemaImportsSet].sort(),
  };
}

/**
 * Write a standalone async function for a GET operation
 */
function writeQueryFunction(
  writer: CodeBlockWriter,
  op: ParsedOperation,
  isEffect: boolean,
): void {
  const baseName = toPascalCase(op.operationId);
  const fnName = toCamelCase(op.operationId);
  const hasPathParams = op.pathParams.length > 0;
  const hasQueryParams = op.queryParams.length > 0;
  const hasParams = hasPathParams || hasQueryParams;
  const hasResponse = !!op.responseSchema;

  const paramsType = hasParams ? `${baseName}Params` : null;
  const responseType = hasResponse ? `${baseName}Response` : "unknown";
  const rawResponseSchema = hasResponse
    ? toSchemaName(`${baseName}Response`)
    : null;
  // Effect schemas need to be wrapped with Schema.standardSchemaV1() for Standard Schema compliance
  const responseSchema =
    rawResponseSchema && isEffect
      ? `Schema.standardSchemaV1(${rawResponseSchema})`
      : rawResponseSchema;

  // Build path expression
  let pathExpr: string;
  if (hasPathParams) {
    const pathParamNames = op.pathParams.map((p) => p.name);
    const pathParamsObj = pathParamNames
      .map((n) => `${n}: params.${n}`)
      .join(", ");
    pathExpr = `buildPath("${op.path}", { ${pathParamsObj} })`;
  } else {
    pathExpr = `"${op.path}"`;
  }

  // Build fetch options
  const fetchOptions = responseSchema ? `{ output: ${responseSchema} }` : "";

  // Generate the function
  if (hasQueryParams) {
    const queryParamNames = op.queryParams.map((p) => p.name);
    const queryParamsObj = queryParamNames
      .map((n) => `${n}: params?.${n}`)
      .join(", ");

    writer
      .write(`export const ${fnName} = async (params?: ${paramsType}) =>`)
      .block(() => {
        writer.writeLine("const $fetch = await getClient()");
        writer.writeLine(`const path = ${pathExpr}`);
        writer.writeLine(`const query = buildQuery({ ${queryParamsObj} })`);
        // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
        writer.writeLine("const url = query ? `${path}?${query}` : path");
        if (fetchOptions) {
          writer.writeLine(
            `const { data, error } = await $fetch<${responseType}>(url, ${fetchOptions})`,
          );
        } else {
          writer.writeLine(
            `const { data, error } = await $fetch<${responseType}>(url)`,
          );
        }
        writer.writeLine("if (error) throw error");
        writer.writeLine("return data");
      });
    return;
  }

  if (hasPathParams) {
    writer
      .write(`export const ${fnName} = async (params: ${paramsType}) =>`)
      .block(() => {
        writer.writeLine("const $fetch = await getClient()");
        writer.writeLine(`const path = ${pathExpr}`);
        if (fetchOptions) {
          writer.writeLine(
            `const { data, error } = await $fetch<${responseType}>(path, ${fetchOptions})`,
          );
        } else {
          writer.writeLine(
            `const { data, error } = await $fetch<${responseType}>(path)`,
          );
        }
        writer.writeLine("if (error) throw error");
        writer.writeLine("return data");
      });
    return;
  }

  writer.write(`export const ${fnName} = async () =>`).block(() => {
    writer.writeLine("const $fetch = await getClient()");
    if (fetchOptions) {
      writer.writeLine(
        `const { data, error } = await $fetch<${responseType}>(${pathExpr}, ${fetchOptions})`,
      );
    } else {
      writer.writeLine(
        `const { data, error } = await $fetch<${responseType}>(${pathExpr})`,
      );
    }
    writer.writeLine("if (error) throw error");
    writer.writeLine("return data");
  });
}

/**
 * Write a standalone async function for a POST/PUT/PATCH/DELETE operation
 */
function writeMutationFunction(
  writer: CodeBlockWriter,
  op: ParsedOperation,
  isEffect: boolean,
): void {
  const baseName = toPascalCase(op.operationId);
  const fnName = toCamelCase(op.operationId);
  const hasPathParams = op.pathParams.length > 0;
  const hasBody = !!op.requestBody;
  const hasResponse = !!op.responseSchema;

  const requestType = hasBody ? `${baseName}Request` : null;
  const responseType = hasResponse ? `${baseName}Response` : "unknown";
  const rawResponseSchema = hasResponse
    ? toSchemaName(`${baseName}Response`)
    : null;
  // Effect schemas need to be wrapped with Schema.standardSchemaV1() for Standard Schema compliance
  const responseSchema =
    rawResponseSchema && isEffect
      ? `Schema.standardSchemaV1(${rawResponseSchema})`
      : rawResponseSchema;

  // Build fetch options
  const writeFetchOptions = (w: CodeBlockWriter, includeBody: boolean) => {
    w.write("{").newLine();
    w.indent(() => {
      w.writeLine(`method: "${op.method.toUpperCase()}",`);
      if (responseSchema) {
        w.writeLine(`output: ${responseSchema},`);
      }
      if (includeBody) {
        w.writeLine("body,");
      }
    });
    w.write("}");
  };

  // Generate the function body based on params/body combinations
  if (hasPathParams && hasBody) {
    const pathParamNames = op.pathParams.map((p) => p.name);
    const pathParamsObj = pathParamNames.join(", ");
    const paramsList = pathParamNames
      .map((n) => `${n}: string`)
      .concat([`body: ${requestType}`]);

    writer
      .write(
        `export const ${fnName} = async ({ ${pathParamNames.join(", ")}, body }: { ${paramsList.join("; ")} }) =>`,
      )
      .block(() => {
        writer.writeLine("const $fetch = await getClient()");
        writer.writeLine(
          `const path = buildPath("${op.path}", { ${pathParamsObj} })`,
        );
        writer.write(
          `const { data, error } = await $fetch<${responseType}>(path, `,
        );
        writeFetchOptions(writer, true);
        writer.write(")").newLine();
        writer.writeLine("if (error) throw error");
        writer.writeLine("return data");
      });
    return;
  }

  if (hasPathParams) {
    const pathParamNames = op.pathParams.map((p) => p.name);
    const pathParamsObj = pathParamNames.join(", ");
    const paramsList = pathParamNames.map((n) => `${n}: string`);

    writer
      .write(
        `export const ${fnName} = async ({ ${pathParamNames.join(", ")} }: { ${paramsList.join("; ")} }) =>`,
      )
      .block(() => {
        writer.writeLine("const $fetch = await getClient()");
        writer.writeLine(
          `const path = buildPath("${op.path}", { ${pathParamsObj} })`,
        );
        writer.write(
          `const { data, error } = await $fetch<${responseType}>(path, `,
        );
        writeFetchOptions(writer, false);
        writer.write(")").newLine();
        writer.writeLine("if (error) throw error");
        writer.writeLine("return data");
      });
    return;
  }

  if (hasBody) {
    writer
      .write(
        `export const ${fnName} = async ({ body }: { body: ${requestType} }) =>`,
      )
      .block(() => {
        writer.writeLine("const $fetch = await getClient()");
        writer.write(
          `const { data, error } = await $fetch<${responseType}>("${op.path}", `,
        );
        writeFetchOptions(writer, true);
        writer.write(")").newLine();
        writer.writeLine("if (error) throw error");
        writer.writeLine("return data");
      });
    return;
  }

  writer.write(`export const ${fnName} = async () =>`).block(() => {
    writer.writeLine("const $fetch = await getClient()");
    writer.write(
      `const { data, error } = await $fetch<${responseType}>("${op.path}", `,
    );
    writeFetchOptions(writer, false);
    writer.write(")").newLine();
    writer.writeLine("if (error) throw error");
    writer.writeLine("return data");
  });
}

/**
 * Convert a string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

/**
 * Convert a string to camelCase
 */
function toCamelCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toLowerCase());
}

/**
 * Convert a type name to a Zod schema variable name
 */
function toSchemaName(typeName: string): string {
  const camelCase = typeName.charAt(0).toLowerCase() + typeName.slice(1);
  return `${camelCase}Schema`;
}
