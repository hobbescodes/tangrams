import {
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isUnionType,
} from "graphql";

import type {
  GraphQLInputType,
  GraphQLNamedType,
  GraphQLOutputType,
  GraphQLSchema,
  SelectionSetNode,
  TypeNode,
} from "graphql";
import type { ParsedDocuments, ParsedFragment } from "@/core/documents";

export interface TypeCollectionResult {
  /** Set of type names (enums, input types) that are used by the documents */
  usedTypes: Set<string>;
  /** Warnings about references to non-existent types */
  warnings: string[];
}

/**
 * Collect all schema types (enums, input types) that are actually used by the documents.
 * This enables tree-shaking of unused types from the generated output.
 */
export function collectUsedTypes(
  schema: GraphQLSchema,
  documents: ParsedDocuments,
): TypeCollectionResult {
  const usedTypes = new Set<string>();
  const warnings: string[] = [];
  const visited = new Set<string>();

  // Collect types from operations
  for (const operation of documents.operations) {
    // Collect from variable definitions
    const variables = operation.node.variableDefinitions ?? [];
    for (const varDef of variables) {
      collectTypesFromTypeNode(
        varDef.type,
        schema,
        usedTypes,
        warnings,
        visited,
        `Operation "${operation.name}"`,
      );
    }

    // Collect enums from selection sets (return types)
    const rootType =
      operation.operation === "query"
        ? schema.getQueryType()
        : operation.operation === "mutation"
          ? schema.getMutationType()
          : schema.getSubscriptionType();

    if (rootType) {
      collectTypesFromSelectionSet(
        operation.node.selectionSet,
        rootType,
        schema,
        documents.fragments,
        usedTypes,
        visited,
      );
    }
  }

  // Collect types from fragments
  for (const fragment of documents.fragments) {
    const parentType = schema.getType(fragment.typeName);

    if (!parentType) {
      warnings.push(
        `Fragment "${fragment.name}" is defined on unknown type "${fragment.typeName}"`,
      );
      continue;
    }

    if (isObjectType(parentType) || isInterfaceType(parentType)) {
      collectTypesFromSelectionSet(
        fragment.node.selectionSet,
        parentType,
        schema,
        documents.fragments,
        usedTypes,
        visited,
      );
    }
  }

  return { usedTypes, warnings };
}

/**
 * Extract the named type from a TypeNode AST node (handles NonNull and List wrappers)
 */
function getNamedTypeFromTypeNode(typeNode: TypeNode): string {
  if (typeNode.kind === "NonNullType" || typeNode.kind === "ListType") {
    return getNamedTypeFromTypeNode(typeNode.type);
  }
  return typeNode.name.value;
}

/**
 * Collect types from a variable type node (AST representation)
 */
function collectTypesFromTypeNode(
  typeNode: TypeNode,
  schema: GraphQLSchema,
  usedTypes: Set<string>,
  warnings: string[],
  visited: Set<string>,
  context: string,
): void {
  const typeName = getNamedTypeFromTypeNode(typeNode);

  // Skip built-in scalars
  if (isBuiltInScalar(typeName)) return;

  const schemaType = schema.getType(typeName);

  if (!schemaType) {
    // Check if it's a custom scalar defined in the schema
    // Custom scalars won't be in our "usedTypes" but shouldn't warn
    warnings.push(`${context} references unknown type "${typeName}"`);
    return;
  }

  collectTypeAndDependencies(schemaType, schema, usedTypes, visited);
}

/**
 * Recursively collect a type and all its dependencies (for input types and enums)
 */
function collectTypeAndDependencies(
  type: GraphQLNamedType,
  schema: GraphQLSchema,
  usedTypes: Set<string>,
  visited: Set<string>,
): void {
  // Skip if already visited (handles circular references)
  if (visited.has(type.name)) return;
  visited.add(type.name);

  if (isEnumType(type)) {
    usedTypes.add(type.name);
    return;
  }

  if (isInputObjectType(type)) {
    usedTypes.add(type.name);

    // Recursively collect types from input object fields
    const fields = type.getFields();
    for (const field of Object.values(fields)) {
      collectTypesFromInputType(field.type, schema, usedTypes, visited);
    }
  }
}

/**
 * Collect types from an input type (handles wrappers like NonNull and List)
 */
function collectTypesFromInputType(
  type: GraphQLInputType,
  schema: GraphQLSchema,
  usedTypes: Set<string>,
  visited: Set<string>,
): void {
  // Unwrap NonNull and List
  if (isNonNullType(type) || isListType(type)) {
    collectTypesFromInputType(type.ofType, schema, usedTypes, visited);
    return;
  }

  // Now we have a named type
  if (isEnumType(type)) {
    usedTypes.add(type.name);
  } else if (isInputObjectType(type)) {
    collectTypeAndDependencies(type, schema, usedTypes, visited);
  }
  // Scalars are ignored - they're handled by the scalars config
}

/**
 * Collect enum types from a selection set (for return type enums)
 */
function collectTypesFromSelectionSet(
  selectionSet: SelectionSetNode,
  parentType: GraphQLNamedType,
  schema: GraphQLSchema,
  allFragments: ParsedFragment[],
  usedTypes: Set<string>,
  visited: Set<string>,
): void {
  if (!isObjectType(parentType) && !isInterfaceType(parentType)) return;

  const parentFields = parentType.getFields();

  for (const selection of selectionSet.selections) {
    if (selection.kind === "Field") {
      const fieldName = selection.name.value;

      // Skip __typename
      if (fieldName === "__typename") continue;

      const schemaField = parentFields[fieldName];
      if (!schemaField) continue;

      // Check the field's return type for enums
      collectTypesFromOutputType(
        schemaField.type,
        selection.selectionSet,
        schema,
        allFragments,
        usedTypes,
        visited,
      );
    } else if (selection.kind === "FragmentSpread") {
      // Find the fragment and process it
      const fragmentName = selection.name.value;
      const fragment = allFragments.find((f) => f.name === fragmentName);

      if (fragment) {
        const fragmentType = schema.getType(fragment.typeName);
        if (
          fragmentType &&
          (isObjectType(fragmentType) || isInterfaceType(fragmentType))
        ) {
          collectTypesFromSelectionSet(
            fragment.node.selectionSet,
            fragmentType,
            schema,
            allFragments,
            usedTypes,
            visited,
          );
        }
      }
    } else if (selection.kind === "InlineFragment") {
      // Handle inline fragments
      const typeCondition = selection.typeCondition;
      const fragmentType = typeCondition
        ? schema.getType(typeCondition.name.value)
        : parentType;

      if (
        fragmentType &&
        (isObjectType(fragmentType) || isInterfaceType(fragmentType))
      ) {
        collectTypesFromSelectionSet(
          selection.selectionSet,
          fragmentType,
          schema,
          allFragments,
          usedTypes,
          visited,
        );
      }
    }
  }
}

/**
 * Collect enum types from an output type (field return type)
 */
function collectTypesFromOutputType(
  type: GraphQLOutputType,
  selectionSet: SelectionSetNode | undefined,
  schema: GraphQLSchema,
  allFragments: ParsedFragment[],
  usedTypes: Set<string>,
  visited: Set<string>,
): void {
  // Unwrap NonNull and List
  if (isNonNullType(type) || isListType(type)) {
    collectTypesFromOutputType(
      type.ofType,
      selectionSet,
      schema,
      allFragments,
      usedTypes,
      visited,
    );
    return;
  }

  // Enum in return type - add it
  if (isEnumType(type)) {
    usedTypes.add(type.name);
    return;
  }

  // Object type with nested selection - recurse into selection set
  if (isObjectType(type) && selectionSet) {
    collectTypesFromSelectionSet(
      selectionSet,
      type,
      schema,
      allFragments,
      usedTypes,
      visited,
    );
    return;
  }

  // Union type - check each possible type
  if (isUnionType(type) && selectionSet) {
    // For unions, we need to check inline fragments for type conditions
    for (const selection of selectionSet.selections) {
      if (selection.kind === "InlineFragment" && selection.typeCondition) {
        const memberType = schema.getType(selection.typeCondition.name.value);
        if (memberType && isObjectType(memberType)) {
          collectTypesFromSelectionSet(
            selection.selectionSet,
            memberType,
            schema,
            allFragments,
            usedTypes,
            visited,
          );
        }
      }
    }
    return;
  }

  // Interface type - similar to object type
  if (isInterfaceType(type) && selectionSet) {
    collectTypesFromSelectionSet(
      selectionSet,
      type,
      schema,
      allFragments,
      usedTypes,
      visited,
    );
  }
}

/**
 * Check if a type name is a built-in GraphQL scalar
 */
function isBuiltInScalar(typeName: string): boolean {
  return ["String", "Int", "Float", "Boolean", "ID"].includes(typeName);
}
