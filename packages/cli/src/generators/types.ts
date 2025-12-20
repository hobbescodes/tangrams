import {
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
} from "graphql";

import { createWriter, writeHeader, writeSectionComment } from "@/utils/writer";
import {
  toFragmentTypeName,
  toMutationTypeName,
  toMutationVariablesTypeName,
  toQueryTypeName,
  toQueryVariablesTypeName,
} from "../utils/naming";
import { resolveScalars } from "../utils/scalars";
import { collectUsedTypes } from "../utils/type-collector";

import type {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLSchema,
  GraphQLType,
  GraphQLUnionType,
} from "graphql";
import type {
  ParsedDocuments,
  ParsedFragment,
  ParsedOperation,
} from "../core/documents";

export interface TypeGeneratorOptions {
  schema: GraphQLSchema;
  documents: ParsedDocuments;
  scalars?: Record<string, string>;
}

export interface TypeGeneratorResult {
  /** Generated TypeScript code */
  code: string;
  /** Warnings about type references (e.g., unknown types) */
  warnings: string[];
}

/**
 * Context object passed to type generation functions
 */
interface GeneratorContext {
  schema: GraphQLSchema;
  allFragments: ParsedFragment[];
  scalars: Record<string, string>;
  warnings: string[];
}

/**
 * Generate TypeScript types from schema and operations
 */
export function generateTypes(
  options: TypeGeneratorOptions,
): TypeGeneratorResult {
  const { schema, documents, scalars: userScalars } = options;
  const scalars = resolveScalars(userScalars);

  // Collect only the types that are actually used by the documents
  const { usedTypes, warnings: collectionWarnings } = collectUsedTypes(
    schema,
    documents,
  );

  // Create context for generation
  const ctx: GeneratorContext = {
    schema,
    allFragments: documents.fragments,
    scalars,
    warnings: [...collectionWarnings],
  };

  const writer = createWriter();

  writeHeader(writer);

  // Generate schema types (enums, input types) - only those that are used
  const schemaTypes = generateSchemaTypes(schema, scalars, usedTypes);
  if (schemaTypes) {
    writeSectionComment(writer, "Schema Types");
    writer.writeLine(schemaTypes);
    writer.blankLine();
  }

  // Generate fragment types
  if (documents.fragments.length > 0) {
    writeSectionComment(writer, "Fragment Types");
    for (const fragment of documents.fragments) {
      const fragmentType = generateFragmentType(ctx, fragment);
      writer.writeLine(fragmentType);
      writer.blankLine();
    }
  }

  // Generate operation types (query/mutation return types and variables)
  if (documents.operations.length > 0) {
    writeSectionComment(writer, "Operation Types");
    for (const operation of documents.operations) {
      const operationTypes = generateOperationTypes(ctx, operation);
      writer.writeLine(operationTypes);
      writer.blankLine();
    }
  }

  return {
    code: writer.toString(),
    warnings: ctx.warnings,
  };
}

/**
 * Generate schema-level types (enums, input types)
 * Only generates types that are in the usedTypes set
 */
function generateSchemaTypes(
  schema: GraphQLSchema,
  scalars: Record<string, string>,
  usedTypes: Set<string>,
): string {
  const typeMap = schema.getTypeMap();

  // Separate enums and input types, then sort alphabetically
  const enums: GraphQLEnumType[] = [];
  const inputTypes: GraphQLInputObjectType[] = [];

  for (const [name, type] of Object.entries(typeMap)) {
    // Skip built-in types
    if (name.startsWith("__")) continue;

    // Skip types not used by documents
    if (!usedTypes.has(name)) continue;

    if (isEnumType(type)) {
      enums.push(type);
    } else if (isInputObjectType(type)) {
      inputTypes.push(type);
    }
  }

  // Sort alphabetically for predictable output
  enums.sort((a, b) => a.name.localeCompare(b.name));
  inputTypes.sort((a, b) => a.name.localeCompare(b.name));

  const parts: string[] = [];

  // Generate enums first
  for (const enumType of enums) {
    parts.push(generateEnumType(enumType));
  }

  // Generate input types
  for (const inputType of inputTypes) {
    parts.push(generateInputType(inputType, scalars));
  }

  return parts.join("\n\n");
}

/**
 * Generate a TypeScript enum from GraphQL enum
 */
function generateEnumType(type: GraphQLEnumType): string {
  const values = type.getValues();
  const enumValues = values.map((v) => `  ${v.name} = "${v.name}"`).join(",\n");

  return `export enum ${type.name} {\n${enumValues}\n}`;
}

/**
 * Generate a TypeScript type from GraphQL input type
 *
 * Optional input fields use `| null | undefined` to be compatible with both:
 * - Fragment types that use `| null` for nullable fields
 * - TypeScript optional parameters that accept `undefined`
 */
function generateInputType(
  type: GraphQLInputObjectType,
  scalars: Record<string, string>,
): string {
  const fields = type.getFields();
  const fieldDefs = Object.values(fields)
    .map((field) => {
      const tsType = graphqlTypeToTS(field.type, scalars);
      // Optional fields accept both null and undefined for compatibility
      const optional = !isNonNullType(field.type) ? "?" : "";
      const nullish = !isNonNullType(field.type) ? " | null" : "";
      return `  ${field.name}${optional}: ${tsType}${nullish}`;
    })
    .join("\n");

  return `export type ${type.name} = {\n${fieldDefs}\n}`;
}

/**
 * Generate TypeScript type for a fragment
 */
function generateFragmentType(
  ctx: GeneratorContext,
  fragment: ParsedFragment,
): string {
  const typeName = toFragmentTypeName(fragment.name);
  const parentType = ctx.schema.getType(fragment.typeName);

  // Support fragments on both object types and interface types
  if (
    !parentType ||
    (!isObjectType(parentType) && !isInterfaceType(parentType))
  ) {
    return `export type ${typeName} = unknown // Unable to resolve type ${fragment.typeName}`;
  }

  const { fields, spreadFragments, inlineFragments } =
    extractSelectionFieldsWithSpreads(
      fragment.node.selectionSet,
      parentType,
      ctx,
    );

  // If fragment is on an interface and has inline fragments, generate union type
  if (isInterfaceType(parentType) && inlineFragments.length > 0) {
    const unionMembers = inlineFragments.map((inlineFrag) => {
      let memberType = `{\n    __typename: "${inlineFrag.typeName}"`;

      // Include common interface fields
      if (fields) {
        memberType += `\n${fields}`;
      }

      // Include fragment-specific fields
      if (inlineFrag.fields) {
        memberType += `\n${inlineFrag.fields}`;
      }

      memberType += "\n  }";

      // Handle fragment spreads within inline fragments
      if (inlineFrag.spreadFragments.length > 0) {
        const spreadTypes = inlineFrag.spreadFragments
          .map((f) => toFragmentTypeName(f))
          .join(" & ");
        return `${spreadTypes} & ${memberType}`;
      }

      return memberType;
    });

    // Handle top-level fragment spreads
    if (spreadFragments.length > 0) {
      const spreadTypes = spreadFragments
        .map((f) => toFragmentTypeName(f))
        .join(" & ");
      return `export type ${typeName} = ${spreadTypes} & (${unionMembers.join(" | ")})`;
    }

    return `export type ${typeName} = ${unionMembers.join(" | ")}`;
  }

  // If there are fragment spreads, use intersection type
  if (spreadFragments.length > 0) {
    const spreadTypes = spreadFragments
      .map((f) => toFragmentTypeName(f))
      .join(" & ");
    if (fields) {
      return `export type ${typeName} = ${spreadTypes} & {\n${fields}\n}`;
    }
    return `export type ${typeName} = ${spreadTypes}`;
  }

  return `export type ${typeName} = {\n${fields}\n}`;
}

/**
 * Generate TypeScript types for an operation (return type and variables)
 */
function generateOperationTypes(
  ctx: GeneratorContext,
  operation: ParsedOperation,
): string {
  const parts: string[] = [];

  // Variables type
  const variablesTypeName =
    operation.operation === "query"
      ? toQueryVariablesTypeName(operation.name)
      : toMutationVariablesTypeName(operation.name);

  const variables = operation.node.variableDefinitions;
  if (variables && variables.length > 0) {
    const varFields = variables
      .map((v) => {
        const tsType = graphqlTypeToTS(v.type, ctx.scalars);
        const optional = v.type.kind !== "NonNullType" ? "?" : "";
        return `  ${v.variable.name.value}${optional}: ${tsType}`;
      })
      .join("\n");
    parts.push(`export type ${variablesTypeName} = {\n${varFields}\n}`);
  } else {
    parts.push(`export type ${variablesTypeName} = Record<string, never>`);
  }

  // Return type
  const returnTypeName =
    operation.operation === "query"
      ? toQueryTypeName(operation.name)
      : toMutationTypeName(operation.name);

  const rootType =
    operation.operation === "query"
      ? ctx.schema.getQueryType()
      : ctx.schema.getMutationType();

  if (!rootType) {
    parts.push(
      `export type ${returnTypeName} = unknown // No ${operation.operation} type in schema`,
    );
    return parts.join("\n\n");
  }

  const { fields } = extractSelectionFieldsWithSpreads(
    operation.node.selectionSet,
    rootType,
    ctx,
  );

  parts.push(`export type ${returnTypeName} = {\n${fields}\n}`);

  return parts.join("\n\n");
}

interface InlineFragmentResult {
  typeName: string;
  fields: string;
  spreadFragments: string[];
}

interface SelectionResult {
  fields: string;
  spreadFragments: string[];
  inlineFragments: InlineFragmentResult[];
}

/**
 * Extract TypeScript field definitions from a GraphQL selection set
 * Also returns fragment spread names for intersection types and inline fragments
 */
function extractSelectionFieldsWithSpreads(
  selectionSet: { selections: readonly unknown[] } | undefined,
  parentType: GraphQLObjectType | GraphQLInterfaceType,
  ctx: GeneratorContext,
  indent = "  ",
): SelectionResult {
  if (!selectionSet)
    return { fields: "", spreadFragments: [], inlineFragments: [] };

  const fields: string[] = [];
  const spreadFragments: string[] = [];
  const inlineFragments: InlineFragmentResult[] = [];
  const parentFields = parentType.getFields();

  for (const selection of selectionSet.selections) {
    const sel = selection as {
      kind: string;
      name?: { value: string };
      alias?: { value: string };
      selectionSet?: { selections: readonly unknown[] };
      typeCondition?: { name: { value: string } };
    };

    if (sel.kind === "Field") {
      const fieldName = sel.name?.value; // Schema field name (for type lookup)
      const outputName = sel.alias?.value ?? fieldName; // Use alias if present
      if (!fieldName || !outputName) continue;

      // Handle __typename (can be aliased, though rare)
      if (fieldName === "__typename") {
        fields.push(`${indent}${outputName}: "${parentType.name}"`);
        continue;
      }

      const schemaField = parentFields[fieldName];
      if (!schemaField) continue;

      const fieldType = schemaField.type;
      const tsType = generateFieldType(
        fieldType,
        sel.selectionSet,
        ctx,
        indent,
      );

      const optional = !isNonNullType(fieldType) ? " | null" : "";
      fields.push(`${indent}${outputName}: ${tsType}${optional}`);
    }

    if (sel.kind === "FragmentSpread") {
      const fragmentName = sel.name?.value;
      if (fragmentName) {
        spreadFragments.push(fragmentName);
      }
    }

    if (
      sel.kind === "InlineFragment" &&
      sel.typeCondition &&
      sel.selectionSet
    ) {
      const typeName = sel.typeCondition.name.value;
      const fragmentType = ctx.schema.getType(typeName);

      if (
        fragmentType &&
        (isObjectType(fragmentType) || isInterfaceType(fragmentType))
      ) {
        const fragmentResult = extractSelectionFieldsWithSpreads(
          sel.selectionSet,
          fragmentType,
          ctx,
          indent,
        );

        inlineFragments.push({
          typeName,
          fields: fragmentResult.fields,
          spreadFragments: fragmentResult.spreadFragments,
        });
      }
    }
  }

  return { fields: fields.join("\n"), spreadFragments, inlineFragments };
}

/**
 * Generate TypeScript type for a field
 */
function generateFieldType(
  type: GraphQLOutputType,
  selectionSet: { selections: readonly unknown[] } | undefined,
  ctx: GeneratorContext,
  indent: string,
): string {
  // Unwrap NonNull
  if (isNonNullType(type)) {
    return generateFieldType(type.ofType, selectionSet, ctx, indent);
  }

  // Handle lists
  if (isListType(type)) {
    const innerType = generateFieldType(type.ofType, selectionSet, ctx, indent);
    return `Array<${innerType}>`;
  }

  // Handle scalars
  if (isScalarType(type)) {
    return ctx.scalars[type.name] ?? "unknown";
  }

  // Handle enums
  if (isEnumType(type)) {
    return type.name;
  }

  // Handle union types
  if (isUnionType(type) && selectionSet) {
    return generateUnionType(type, selectionSet, ctx, indent);
  }

  // Handle interface types
  if (isInterfaceType(type) && selectionSet) {
    return generateInterfaceType(type, selectionSet, ctx, indent);
  }

  // Handle object types with nested selections
  if (isObjectType(type) && selectionSet) {
    const { fields, spreadFragments } = extractSelectionFieldsWithSpreads(
      selectionSet,
      type,
      ctx,
      `${indent}  `,
    );

    // If there are fragment spreads, generate intersection type
    if (spreadFragments.length > 0) {
      const spreadTypes = spreadFragments
        .map((f) => toFragmentTypeName(f))
        .join(" & ");
      if (fields) {
        return `${spreadTypes} & {\n${fields}\n${indent}}`;
      }
      return spreadTypes;
    }

    return `{\n${fields}\n${indent}}`;
  }

  return "unknown";
}

/**
 * Generate TypeScript type for a GraphQL union type
 */
function generateUnionType(
  type: GraphQLUnionType,
  selectionSet: { selections: readonly unknown[] },
  ctx: GeneratorContext,
  indent: string,
): string {
  const possibleTypes = type.getTypes();

  // Extract inline fragments directly from selection set
  const inlineFragments: InlineFragmentResult[] = [];

  for (const selection of selectionSet.selections) {
    const sel = selection as {
      kind: string;
      typeCondition?: { name: { value: string } };
      selectionSet?: { selections: readonly unknown[] };
    };

    if (
      sel.kind === "InlineFragment" &&
      sel.typeCondition &&
      sel.selectionSet
    ) {
      const typeName = sel.typeCondition.name.value;
      const fragmentType = ctx.schema.getType(typeName);

      if (
        fragmentType &&
        (isObjectType(fragmentType) || isInterfaceType(fragmentType))
      ) {
        const fragmentResult = extractSelectionFieldsWithSpreads(
          sel.selectionSet,
          fragmentType,
          ctx,
          `${indent}    `,
        );

        inlineFragments.push({
          typeName,
          fields: fragmentResult.fields,
          spreadFragments: fragmentResult.spreadFragments,
        });
      }
    }
  }

  // If no inline fragments, emit warning and generate minimal discriminated union
  if (inlineFragments.length === 0) {
    ctx.warnings.push(
      `Union type "${type.name}" has no inline fragments. Consider adding "... on TypeName { fields }" to select specific fields.`,
    );

    // Generate minimal union with just __typename
    const minimalUnion = possibleTypes
      .map((t) => `{ __typename: "${t.name}" }`)
      .join(" | ");
    return minimalUnion;
  }

  // Generate discriminated union from inline fragments
  const unionMembers = inlineFragments.map((fragment) => {
    const { spreadFragments } = fragment;

    // Build the type with __typename discriminator
    let memberType = `{\n${indent}    __typename: "${fragment.typeName}"`;

    if (fragment.fields) {
      memberType += `\n${fragment.fields}`;
    }

    memberType += `\n${indent}  }`;

    // If there are fragment spreads, create intersection type
    if (spreadFragments.length > 0) {
      const spreadTypes = spreadFragments
        .map((f) => toFragmentTypeName(f))
        .join(" & ");
      return `${spreadTypes} & ${memberType}`;
    }

    return memberType;
  });

  return unionMembers.join(" | ");
}

/**
 * Generate TypeScript type for a GraphQL interface type
 */
function generateInterfaceType(
  type: GraphQLInterfaceType,
  selectionSet: { selections: readonly unknown[] },
  ctx: GeneratorContext,
  indent: string,
): string {
  const { fields, inlineFragments, spreadFragments } =
    extractSelectionFieldsWithSpreads(selectionSet, type, ctx, `${indent}  `);

  // If no inline fragments, generate type with common fields only
  if (inlineFragments.length === 0) {
    // Get all possible implementations
    const implementations = ctx.schema.getPossibleTypes(type);

    if (implementations.length > 0 && !fields) {
      // No fields selected and no inline fragments - emit warning
      ctx.warnings.push(
        `Interface type "${type.name}" has no fields or inline fragments selected. Consider adding "... on TypeName { fields }" to select specific fields.`,
      );

      // Generate minimal union with just __typename
      const minimalUnion = implementations
        .map((t) => `{ __typename: "${t.name}" }`)
        .join(" | ");
      return minimalUnion;
    }

    // Has common fields but no inline fragments - return object with those fields
    let result = `{\n${indent}    __typename: string`;
    if (fields) {
      result += `\n${fields}`;
    }
    result += `\n${indent}  }`;

    if (spreadFragments.length > 0) {
      const spreadTypes = spreadFragments
        .map((f) => toFragmentTypeName(f))
        .join(" & ");
      return `${spreadTypes} & ${result}`;
    }

    return result;
  }

  // Generate discriminated union from inline fragments
  const unionMembers = inlineFragments.map((fragment) => {
    // Build the type with __typename discriminator
    let memberType = `{\n${indent}    __typename: "${fragment.typeName}"`;

    // Include common interface fields
    if (fields) {
      memberType += `\n${fields}`;
    }

    // Include fragment-specific fields
    if (fragment.fields) {
      memberType += `\n${fragment.fields}`;
    }

    memberType += `\n${indent}  }`;

    // If there are fragment spreads in the inline fragment, create intersection type
    if (fragment.spreadFragments.length > 0) {
      const spreadTypes = fragment.spreadFragments
        .map((f) => toFragmentTypeName(f))
        .join(" & ");
      return `${spreadTypes} & ${memberType}`;
    }

    return memberType;
  });

  // If there are top-level fragment spreads, include them
  if (spreadFragments.length > 0) {
    const spreadTypes = spreadFragments
      .map((f) => toFragmentTypeName(f))
      .join(" & ");
    return `${spreadTypes} & (${unionMembers.join(" | ")})`;
  }

  return unionMembers.join(" | ");
}

/**
 * Convert a GraphQL type to TypeScript type string
 */
function graphqlTypeToTS(
  type:
    | GraphQLType
    | { kind: string; type?: unknown; name?: { value: string } },
  scalars: Record<string, string>,
): string {
  // Handle AST types (from variable definitions)
  if ("kind" in type && typeof type.kind === "string") {
    if (type.kind === "NonNullType" && type.type) {
      return graphqlTypeToTS(
        type.type as { kind: string; type?: unknown; name?: { value: string } },
        scalars,
      );
    }
    if (type.kind === "ListType" && type.type) {
      const inner = graphqlTypeToTS(
        type.type as { kind: string; type?: unknown; name?: { value: string } },
        scalars,
      );
      return `Array<${inner}> | null`;
    }
    if (type.kind === "NamedType" && type.name?.value) {
      const name = type.name.value;
      return scalars[name] ?? name;
    }
  }

  // Handle runtime types
  if (isNonNullType(type)) {
    return graphqlTypeToTS(type.ofType, scalars);
  }
  if (isListType(type)) {
    const inner = graphqlTypeToTS(type.ofType, scalars);
    return `Array<${inner}> | null`;
  }
  if (isScalarType(type)) {
    return scalars[type.name] ?? "unknown";
  }
  if (isEnumType(type)) {
    return type.name;
  }
  if (isInputObjectType(type) || isObjectType(type)) {
    return type.name;
  }

  return "unknown";
}
