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
 * Convert a GraphQL query operation name to a server function name
 * e.g., "GetUser" -> "getUserFn"
 */
export function toQueryFnName(operationName: string): string {
  return `${toCamelCase(operationName)}Fn`;
}

/**
 * Convert a GraphQL mutation operation name to a server function name
 * e.g., "CreateUser" -> "createUserFn"
 */
export function toMutationFnName(operationName: string): string {
  return `${toCamelCase(operationName)}Fn`;
}
