/**
 * TanStack Form options generator
 * Generates formOptions exports for mutations
 *
 * This generator is mostly validator-agnostic because TanStack Form uses the
 * Standard Schema protocol, which is supported by Zod, Valibot, and ArkType.
 *
 * Note: Effect Schema requires special handling - schemas must be wrapped with
 * Schema.standardSchemaV1() to be Standard Schema compliant.
 */

import { toCamelCase, toPascalCase, toSchemaName } from "@/utils/naming";
import { createWriter, writeHeader, writeImport } from "@/utils/writer";

import type CodeBlockWriter from "code-block-writer";
import type { FormOverridesConfig } from "@/core/config";
import type { ValidatorLibrary } from "./emitters/types";

/**
 * Derive the TypeScript type name from a schema variable name.
 * e.g., "createPetRequestSchema" -> "CreatePetRequest"
 */
function schemaNameToTypeName(schemaName: string): string {
  // Remove "Schema" suffix and ensure PascalCase
  const withoutSuffix = schemaName.replace(/Schema$/, "");
  return toPascalCase(withoutSuffix);
}

/**
 * Information about a mutation operation for form generation
 */
export interface MutationOperation {
  /** Operation ID / name */
  operationId: string;
  /** The Zod schema variable name for the request body */
  requestSchemaName: string;
}

/**
 * Options for form options code generation
 */
export interface FormOptionsGenOptions {
  /** Import path for the schema file */
  schemaImportPath: string;
  /** Form overrides from config (validator, validationLogic) */
  formOverrides?: FormOverridesConfig;
  /** The validator library being used (needed for Effect's Standard Schema wrapper) */
  validatorLibrary?: ValidatorLibrary;
}

/**
 * Result of form options generation
 */
export interface FormOptionsResult {
  /** Generated code content */
  content: string;
  /** Warnings during generation */
  warnings: string[];
}

/**
 * Generate TanStack Form options code for mutations
 */
export function generateFormOptionsCode(
  mutations: MutationOperation[],
  options: FormOptionsGenOptions,
): FormOptionsResult {
  const warnings: string[] = [];

  if (mutations.length === 0) {
    return {
      content: generateEmptyFormFile(),
      warnings: [
        "No mutations found with request bodies to generate form options for.",
      ],
    };
  }

  // Get validator config (default to onSubmitAsync)
  const validator = options.formOverrides?.validator ?? "onSubmitAsync";
  const validationLogic = options.formOverrides?.validationLogic;
  const isOnDynamic = validator === "onDynamic";
  const isEffect = options.validatorLibrary === "effect";

  // Warn if validationLogic is set but validator isn't onDynamic
  if (validationLogic && !isOnDynamic) {
    warnings.push(
      `validationLogic is only used with "onDynamic" validator (current: "${validator}"). The validationLogic config will be ignored.`,
    );
  }

  const writer = createWriter();

  writeHeader(writer);

  // Effect Schema import (needed for Standard Schema wrapper)
  if (isEffect) {
    writeImport(writer, "effect", ["Schema"]);
    writer.blankLine();
  }

  // External imports (sorted alphabetically)
  if (isOnDynamic) {
    writeImport(writer, "@tanstack/react-form", [
      "formOptions",
      "revalidateLogic",
    ]);
  } else {
    writeImport(writer, "@tanstack/react-form", ["formOptions"]);
  }

  // Collect all schema imports and their corresponding type imports (sorted alphabetically)
  const schemaImports = mutations.map((m) => m.requestSchemaName);
  const typeImports = mutations.map((m) =>
    schemaNameToTypeName(m.requestSchemaName),
  );

  // Internal imports (schema values)
  if (schemaImports.length > 0) {
    writer.blankLine();
    writeImport(writer, options.schemaImportPath, schemaImports);
  }

  // Type imports (always last with blank line)
  if (typeImports.length > 0) {
    writer.blankLine();
    writeImport(writer, options.schemaImportPath, typeImports, true);
  }

  writer.blankLine();

  // Generate form options for each mutation
  for (const mutation of mutations) {
    writeFormOptions(
      writer,
      mutation,
      validator,
      isOnDynamic,
      validationLogic,
      isEffect,
    );
    writer.blankLine();
  }

  return {
    content: writer.toString(),
    warnings,
  };
}

/**
 * Write form options for a single mutation
 */
function writeFormOptions(
  writer: CodeBlockWriter,
  mutation: MutationOperation,
  validator: string,
  isOnDynamic: boolean,
  validationLogic: FormOverridesConfig["validationLogic"] | undefined,
  isEffect: boolean,
): void {
  const formOptionsName = `${toCamelCase(mutation.operationId)}FormOptions`;
  const typeName = schemaNameToTypeName(mutation.requestSchemaName);

  // For Effect Schema, we need to wrap the schema with Schema.standardSchemaV1()
  // to make it Standard Schema compliant for TanStack Form
  const schemaExpression = isEffect
    ? `Schema.standardSchemaV1(${mutation.requestSchemaName})`
    : mutation.requestSchemaName;

  writer
    .write(`export const ${formOptionsName} = formOptions(`)
    .inlineBlock(() => {
      writer.writeLine(`defaultValues: {} as ${typeName},`);

      // Add validationLogic for onDynamic
      if (isOnDynamic) {
        const mode = validationLogic?.mode ?? "submit";
        const modeAfterSubmission =
          validationLogic?.modeAfterSubmission ?? "change";
        writer.writeLine(
          `validationLogic: revalidateLogic({ mode: "${mode}", modeAfterSubmission: "${modeAfterSubmission}" }),`,
        );
      }

      writer
        .write("validators: ")
        .inlineBlock(() => {
          writer.writeLine(`${validator}: ${schemaExpression},`);
        })
        .write(",");
    })
    .write(")");
}

/**
 * Generate an empty form file when no mutations are found
 */
function generateEmptyFormFile(): string {
  const writer = createWriter();

  writeHeader(writer);
  writer.writeLine(
    "// No mutations with request bodies found to generate form options for.",
  );
  writer.writeLine(
    "// Add mutations to your schema/documents to generate form options.",
  );

  return writer.toString();
}

/**
 * Filter OpenAPI operations to only mutations (POST, PUT, PATCH) with request bodies
 */
export function filterOpenAPIMutations(
  operations: Array<{
    operationId: string;
    method: string;
    requestBody?: unknown;
  }>,
): string[] {
  const mutationMethods = new Set(["post", "put", "patch"]);

  return operations
    .filter((op) => mutationMethods.has(op.method) && op.requestBody)
    .map((op) => op.operationId);
}

/**
 * Filter GraphQL operations to only mutations
 */
export function filterGraphQLMutations(
  operations: Array<{
    name: string;
    operation: "query" | "mutation" | "subscription";
  }>,
): string[] {
  return operations
    .filter((op) => op.operation === "mutation")
    .map((op) => op.name);
}

/**
 * Get the request schema name for an OpenAPI operation
 */
export function getOpenAPIRequestSchemaName(operationId: string): string {
  return toSchemaName(`${toPascalCase(operationId)}Request`);
}

/**
 * Get the request schema name for a GraphQL mutation
 * GraphQL mutations use input types from variables, so we need to look at the variable definitions
 */
export function getGraphQLInputSchemaName(inputTypeName: string): string {
  return toSchemaName(inputTypeName);
}
