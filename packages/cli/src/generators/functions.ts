/**
 * GraphQL standalone functions generation
 *
 * Generates standalone async fetch functions for GraphQL operations.
 * These functions are imported by both options.ts (for queryOptions/mutationOptions)
 * and collections.ts (for TanStack DB persistence handlers).
 */

import { getFragmentDependencies } from "@/core/documents";
import {
  toCamelCase,
  toDocumentName,
  toFragmentDocName,
  toMutationTypeName,
  toMutationVariablesTypeName,
  toQueryTypeName,
  toQueryVariablesTypeName,
} from "@/utils/naming";
import {
  createWriter,
  writeHeader,
  writeImport,
  writeSectionComment,
} from "@/utils/writer";

import type CodeBlockWriter from "code-block-writer";
import type {
  ParsedDocuments,
  ParsedFragment,
  ParsedOperation,
} from "@/core/documents";

export interface FunctionsGeneratorOptions {
  documents: ParsedDocuments;
  clientImportPath: string;
  typesImportPath: string;
}

/**
 * Generate the functions file with standalone fetch functions
 */
export function generateFunctions(options: FunctionsGeneratorOptions): string {
  const { documents, clientImportPath, typesImportPath } = options;
  const { operations, fragments } = documents;

  const writer = createWriter();

  writeHeader(writer);

  // Internal imports
  writer.writeLine(`import { getClient } from "${clientImportPath}"`);

  // Type imports (sorted alphabetically, always last with blank line)
  const typeImports = generateTypeImports(operations);
  if (typeImports.length > 0) {
    writer.blankLine();
    writeImport(writer, typesImportPath, typeImports, true);
  }

  writer.blankLine();

  // Fragment documents
  if (fragments.length > 0) {
    writeSectionComment(writer, "Fragment Documents");
    for (const fragment of fragments) {
      writeFragmentDocument(writer, fragment);
      writer.blankLine();
    }
  }

  // Operation documents
  writeSectionComment(writer, "Documents");
  for (const operation of operations) {
    const fragmentDeps = getFragmentDependencies(operation, fragments);
    writeOperationDocument(writer, operation, fragmentDeps);
    writer.blankLine();
  }

  // Standalone functions
  writeSectionComment(writer, "Functions");
  for (const operation of operations) {
    if (operation.operation === "query") {
      writeQueryFunction(writer, operation);
    } else {
      writeMutationFunction(writer, operation);
    }
    writer.blankLine();
  }

  return writer.toString();
}

/**
 * Generate type imports for all operations (response and variable types, sorted alphabetically)
 */
function generateTypeImports(operations: ParsedOperation[]): string[] {
  const imports: string[] = [];

  for (const op of operations) {
    const hasVariables =
      op.node.variableDefinitions && op.node.variableDefinitions.length > 0;

    if (op.operation === "query") {
      imports.push(toQueryTypeName(op.name));
      if (hasVariables) {
        imports.push(toQueryVariablesTypeName(op.name));
      }
    } else if (op.operation === "mutation") {
      imports.push(toMutationTypeName(op.name));
      if (hasVariables) {
        imports.push(toMutationVariablesTypeName(op.name));
      }
    }
  }

  return imports.sort();
}

/**
 * Write a fragment document constant
 */
function writeFragmentDocument(
  writer: CodeBlockWriter,
  fragment: ParsedFragment,
): void {
  const docName = toFragmentDocName(fragment.name);
  writer.writeLine(`const ${docName} = /* GraphQL */ \``);
  writer.writeLine(fragment.document);
  writer.write("`");
}

/**
 * Write an operation document constant with fragment dependencies
 */
function writeOperationDocument(
  writer: CodeBlockWriter,
  operation: ParsedOperation,
  fragmentDeps: ParsedFragment[],
): void {
  const docName = toDocumentName(operation.name);

  writer.writeLine(`const ${docName} = /* GraphQL */ \``);
  writer.writeLine(operation.document);

  if (fragmentDeps.length === 0) {
    writer.write("`");
  } else {
    // Build the document with fragment interpolation using template literals
    const fragmentInterpolations = fragmentDeps
      .map((f) => `\${${toFragmentDocName(f.name)}}`)
      .join("");
    writer.write(`${fragmentInterpolations}\``);
  }
}

/**
 * Write a standalone async function for a query operation
 */
function writeQueryFunction(
  writer: CodeBlockWriter,
  operation: ParsedOperation,
): void {
  const fnName = toCamelCase(operation.name);
  const docName = toDocumentName(operation.name);
  const queryType = toQueryTypeName(operation.name);
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
    writer.write(`export const ${fnName} = async () =>`).newLine();
    writer
      .indent()
      .write(`(await getClient()).request<${queryType}>(${docName})`);
    return;
  }

  const variableParam = allOptional
    ? `variables?: ${variablesType}`
    : `variables: ${variablesType}`;

  writer
    .write(`export const ${fnName} = async (${variableParam}) =>`)
    .newLine();
  writer
    .indent()
    .write(
      `(await getClient()).request<${queryType}>(${docName}, variables ?? undefined)`,
    );
}

/**
 * Write a standalone async function for a mutation operation
 */
function writeMutationFunction(
  writer: CodeBlockWriter,
  operation: ParsedOperation,
): void {
  const fnName = toCamelCase(operation.name);
  const docName = toDocumentName(operation.name);
  const mutationType = toMutationTypeName(operation.name);
  const variablesType = toMutationVariablesTypeName(operation.name);

  const hasVariables =
    operation.node.variableDefinitions &&
    operation.node.variableDefinitions.length > 0;

  if (!hasVariables) {
    writer.write(`export const ${fnName} = async () =>`).newLine();
    writer
      .indent()
      .write(`(await getClient()).request<${mutationType}>(${docName})`);
    return;
  }

  writer
    .write(`export const ${fnName} = async (variables: ${variablesType}) =>`)
    .newLine();
  writer
    .indent()
    .write(
      `(await getClient()).request<${mutationType}>(${docName}, variables)`,
    );
}
