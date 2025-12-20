/**
 * Convert a string to PascalCase
 */
export function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

/**
 * Convert a string to camelCase
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Convert a GraphQL operation name to a queryOptions function name
 * e.g., "GetUser" -> "getUserQueryOptions"
 */
export function toQueryOptionsName(operationName: string): string {
  return `${toCamelCase(operationName)}QueryOptions`;
}

/**
 * Convert a GraphQL operation name to a mutationOptions function name
 * e.g., "CreateUser" -> "createUserMutationOptions"
 */
export function toMutationOptionsName(operationName: string): string {
  return `${toCamelCase(operationName)}MutationOptions`;
}

/**
 * Convert a GraphQL operation name to a document constant name
 * e.g., "GetUser" -> "GetUserDocument"
 */
export function toDocumentName(operationName: string): string {
  return `${toPascalCase(operationName)}Document`;
}

/**
 * Convert a GraphQL fragment name to a fragment document constant name
 * e.g., "UserFields" -> "UserFieldsFragmentDoc"
 */
export function toFragmentDocName(fragmentName: string): string {
  return `${toPascalCase(fragmentName)}FragmentDoc`;
}

/**
 * Convert a GraphQL type name to a TypeScript type name for query result
 * e.g., "GetUser" -> "GetUserQuery"
 */
export function toQueryTypeName(operationName: string): string {
  return `${toPascalCase(operationName)}Query`;
}

/**
 * Convert a GraphQL type name to a TypeScript type name for mutation result
 * e.g., "CreateUser" -> "CreateUserMutation"
 */
export function toMutationTypeName(operationName: string): string {
  return `${toPascalCase(operationName)}Mutation`;
}

/**
 * Convert a GraphQL operation name to a variables type name
 * e.g., "GetUser" -> "GetUserQueryVariables"
 */
export function toQueryVariablesTypeName(operationName: string): string {
  return `${toPascalCase(operationName)}QueryVariables`;
}

/**
 * Convert a GraphQL operation name to a variables type name
 * e.g., "CreateUser" -> "CreateUserMutationVariables"
 */
export function toMutationVariablesTypeName(operationName: string): string {
  return `${toPascalCase(operationName)}MutationVariables`;
}

/**
 * Convert a GraphQL fragment name to a TypeScript type name
 * e.g., "UserFields" -> "UserFieldsFragment"
 */
export function toFragmentTypeName(fragmentName: string): string {
  return `${toPascalCase(fragmentName)}Fragment`;
}

/**
 * Convert an operation name to an infiniteQueryOptions function name
 * e.g., "listPets" -> "listPetsInfiniteQueryOptions"
 * e.g., "GetPosts" -> "getPostsInfiniteQueryOptions"
 */
export function toInfiniteQueryOptionsName(operationName: string): string {
  return `${toCamelCase(operationName)}InfiniteQueryOptions`;
}

// ============================================================================
// Response Type Names (aliases for consistency with schema naming)
// ============================================================================

/**
 * Convert a GraphQL operation name to a query response type name
 * e.g., "GetPets" -> "GetPetsQuery"
 * This is an alias for toQueryTypeName for consistency with schema naming conventions
 */
export const toQueryResponseTypeName = toQueryTypeName;

/**
 * Convert a GraphQL operation name to a mutation response type name
 * e.g., "CreatePet" -> "CreatePetMutation"
 * This is an alias for toMutationTypeName for consistency with schema naming conventions
 */
export const toMutationResponseTypeName = toMutationTypeName;

// ============================================================================
// Schema Naming Utilities
// ============================================================================

/**
 * Convert a type name to a schema variable name
 * e.g., "User" -> "userSchema", "CreateUserRequest" -> "createUserRequestSchema"
 */
export function toSchemaName(typeName: string): string {
  const camelCase = typeName.charAt(0).toLowerCase() + typeName.slice(1);
  return `${camelCase}Schema`;
}

/**
 * Convert a GraphQL operation name to a query variables schema name
 * e.g., "GetPets" -> "getPetsQueryVariablesSchema"
 */
export function toQueryVariablesSchemaName(operationName: string): string {
  return `${toCamelCase(operationName)}QueryVariablesSchema`;
}

/**
 * Convert a GraphQL operation name to a mutation variables schema name
 * e.g., "CreatePet" -> "createPetMutationVariablesSchema"
 */
export function toMutationVariablesSchemaName(operationName: string): string {
  return `${toCamelCase(operationName)}MutationVariablesSchema`;
}

/**
 * Convert a GraphQL operation name to a query response schema name
 * e.g., "GetPets" -> "getPetsQuerySchema"
 */
export function toQueryResponseSchemaName(operationName: string): string {
  return `${toCamelCase(operationName)}QuerySchema`;
}

/**
 * Convert a GraphQL operation name to a mutation response schema name
 * e.g., "CreatePet" -> "createPetMutationSchema"
 */
export function toMutationResponseSchemaName(operationName: string): string {
  return `${toCamelCase(operationName)}MutationSchema`;
}

/**
 * Convert a GraphQL fragment name to a fragment schema name
 * e.g., "PetFields" -> "petFieldsFragmentSchema"
 */
export function toFragmentSchemaName(fragmentName: string): string {
  return `${toCamelCase(fragmentName)}FragmentSchema`;
}

// ============================================================================
// Property Naming Utilities
// ============================================================================

/**
 * Check if a property name is a valid JavaScript identifier
 * If not, it needs to be quoted in object literals
 */
export function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

/**
 * Get a safe property name for use in object literals
 * Quotes the name if it's not a valid identifier
 */
export function getSafePropertyName(name: string): string {
  return isValidIdentifier(name) ? name : `"${name}"`;
}
