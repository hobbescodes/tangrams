/**
 * GraphQL operations generation
 *
 * Generates queryOptions and mutationOptions that import standalone
 * fetch functions from functions.ts.
 */

import {
  toCamelCase,
  toMutationOptionsName,
  toMutationVariablesTypeName,
  toQueryOptionsName,
  toQueryVariablesTypeName,
} from "@/utils/naming";
import {
  createWriter,
  writeHeader,
  writeImport,
  writeSectionComment,
} from "@/utils/writer";

import type CodeBlockWriter from "code-block-writer";
import type { ParsedDocuments, ParsedOperation } from "@/core/documents";

export interface OperationsGeneratorOptions {
  documents: ParsedDocuments;
  typesImportPath: string;
  /** The source name to include in query/mutation keys */
  sourceName: string;
}

/** Hardcoded import path for functions (always ../functions from query/) */
const FUNCTIONS_IMPORT_PATH = "../functions";

/**
 * Generate the operations file with queryOptions and mutationOptions
 */
export function generateGraphQLOperations(
  options: OperationsGeneratorOptions,
): string {
  const { documents, typesImportPath, sourceName } = options;
  const { operations } = documents;

  const writer = createWriter();

  writeHeader(writer);

  // Determine what imports we need
  const hasQueries = operations.some((op) => op.operation === "query");
  const hasMutations = operations.some((op) => op.operation === "mutation");

  // External imports (sorted alphabetically)
  const tanstackImports: string[] = [];
  if (hasMutations) tanstackImports.push("mutationOptions");
  if (hasQueries) tanstackImports.push("queryOptions");

  if (tanstackImports.length > 0) {
    writeImport(writer, "@tanstack/react-query", tanstackImports);
  }

  // Internal imports (sorted alphabetically)
  const functionImports = getFunctionImports(operations);
  if (functionImports.length > 0) {
    writer.blankLine();
    writeImport(writer, FUNCTIONS_IMPORT_PATH, functionImports);
  }

  // Type imports (sorted alphabetically, always last with blank line)
  const typeImports = generateVariableTypeImports(operations);
  if (typeImports.length > 0) {
    writer.blankLine();
    writeImport(writer, typesImportPath, typeImports, true);
  }

  writer.blankLine();

  // Generate operations
  writeSectionComment(writer, "Operations");
  for (const operation of operations) {
    if (operation.operation === "query") {
      writeQueryOptions(writer, operation, sourceName);
    } else {
      writeMutationOptions(writer, operation, sourceName);
    }
    writer.blankLine();
  }

  return writer.toString();
}

/**
 * Get function import names for all operations
 */
function getFunctionImports(operations: ParsedOperation[]): string[] {
  return operations.map((op) => toCamelCase(op.name));
}

/**
 * Generate type imports for variable types only (sorted alphabetically)
 */
function generateVariableTypeImports(operations: ParsedOperation[]): string[] {
  const imports: string[] = [];

  for (const op of operations) {
    const hasVariables =
      op.node.variableDefinitions && op.node.variableDefinitions.length > 0;

    if (hasVariables) {
      if (op.operation === "query") {
        imports.push(toQueryVariablesTypeName(op.name));
      } else if (op.operation === "mutation") {
        imports.push(toMutationVariablesTypeName(op.name));
      }
    }
  }

  return imports.sort();
}

/**
 * Write queryOptions for a query operation
 */
function writeQueryOptions(
  writer: CodeBlockWriter,
  operation: ParsedOperation,
  sourceName: string,
): void {
  const optionsFnName = toQueryOptionsName(operation.name);
  const fetchFnName = toCamelCase(operation.name);
  const variablesType = toQueryVariablesTypeName(operation.name);

  const hasVariables =
    operation.node.variableDefinitions &&
    operation.node.variableDefinitions.length > 0;

  // Check if all variables are optional
  const allOptional =
    hasVariables &&
    operation.node.variableDefinitions?.every(
      (v) => v.type.kind !== "NonNullType",
    );

  if (!hasVariables) {
    writer.write(`export const ${optionsFnName} = () =>`).newLine();
    writer
      .indent()
      .write("queryOptions(")
      .inlineBlock(() => {
        writer.writeLine(`queryKey: ["${sourceName}", "${operation.name}"],`);
        writer.writeLine(`queryFn: () => ${fetchFnName}(),`);
      })
      .write(")");
    return;
  }

  const variableParam = allOptional
    ? `variables?: ${variablesType}`
    : `variables: ${variablesType}`;

  writer
    .write(`export const ${optionsFnName} = (${variableParam}) =>`)
    .newLine();
  writer
    .indent()
    .write("queryOptions(")
    .inlineBlock(() => {
      writer.writeLine(
        `queryKey: ["${sourceName}", "${operation.name}", variables],`,
      );
      writer.writeLine(`queryFn: () => ${fetchFnName}(variables),`);
    })
    .write(")");
}

/**
 * Write mutationOptions for a mutation operation
 */
function writeMutationOptions(
  writer: CodeBlockWriter,
  operation: ParsedOperation,
  sourceName: string,
): void {
  const optionsFnName = toMutationOptionsName(operation.name);
  const fetchFnName = toCamelCase(operation.name);
  const variablesType = toMutationVariablesTypeName(operation.name);

  const hasVariables =
    operation.node.variableDefinitions &&
    operation.node.variableDefinitions.length > 0;

  writer.write(`export const ${optionsFnName} = () =>`).newLine();
  writer
    .indent()
    .write("mutationOptions(")
    .inlineBlock(() => {
      writer.writeLine(`mutationKey: ["${sourceName}", "${operation.name}"],`);
      if (!hasVariables) {
        writer.writeLine(`mutationFn: () => ${fetchFnName}(),`);
      } else {
        writer.writeLine(
          `mutationFn: (variables: ${variablesType}) => ${fetchFnName}(variables),`,
        );
      }
    })
    .write(")");
}
