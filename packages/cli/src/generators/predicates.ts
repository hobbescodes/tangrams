/**
 * Predicate translator code generation for TanStack DB on-demand mode
 *
 * Generates functions that translate TanStack DB's LoadSubsetOptions (predicates)
 * into API-specific query parameters or GraphQL variables.
 */

import type { CollectionEntity } from "@/adapters/types";
import type { PredicateMappingPreset } from "@/core/config";

// =============================================================================
// Main Generator Function
// =============================================================================

/**
 * Generate a predicate translator function for an entity
 *
 * @param entity The collection entity with predicate mapping config
 * @param paramsTypeName The TypeScript type name for the query params (optional)
 * @param sourceType Whether this is for "openapi" or "graphql"
 * @returns The generated translator function code
 */
export function generatePredicateTranslator(
  entity: CollectionEntity,
  paramsTypeName: string | undefined,
  sourceType: "openapi" | "graphql",
): string {
  const preset = getPresetFromEntity(entity);
  const fnName = `translate${entity.name}Predicates`;
  const returnType = paramsTypeName
    ? `Partial<${paramsTypeName}>`
    : "Record<string, unknown>";

  if (sourceType === "graphql") {
    return generateGraphQLTranslator(fnName, preset, returnType, entity);
  }

  return generateOpenAPITranslator(fnName, preset, returnType, entity);
}

/**
 * Get the predicate mapping preset from an entity
 *
 * Priority:
 * 1. Explicit predicateMapping from config
 * 2. Auto-detected filterStyle from capabilities (if not "custom")
 * 3. Default to "rest-simple"
 */
function getPresetFromEntity(entity: CollectionEntity): PredicateMappingPreset {
  // Use explicit preset if configured
  if (entity.predicateMapping) {
    return entity.predicateMapping;
  }

  // Use auto-detected filter style if available and not custom
  if (entity.filterCapabilities?.filterStyle) {
    const style = entity.filterCapabilities.filterStyle;
    if (style !== "custom") {
      return style;
    }
  }

  return "rest-simple";
}

// =============================================================================
// OpenAPI Translator Generators
// =============================================================================

/**
 * Generate an OpenAPI predicate translator function
 */
function generateOpenAPITranslator(
  fnName: string,
  preset: PredicateMappingPreset,
  returnType: string,
  entity: CollectionEntity,
): string {
  switch (preset) {
    case "rest-simple":
      return generateRestSimpleTranslator(fnName, returnType, entity);
    case "jsonapi":
      return generateJsonApiTranslator(fnName, returnType, entity);
    default:
      // For GraphQL presets used with OpenAPI (shouldn't happen), fall back to rest-simple
      return generateRestSimpleTranslator(fnName, returnType, entity);
  }
}

/**
 * Generate a REST-simple style predicate translator
 * Handles: field_eq, field_lt, field_gt, sort=field:direction, limit, offset
 */
function generateRestSimpleTranslator(
  fnName: string,
  returnType: string,
  entity: CollectionEntity,
): string {
  const sortParam = entity.sortCapabilities?.sortParam || "sort";
  const limitParam = entity.paginationCapabilities?.limitParam || "limit";
  const offsetParam = entity.paginationCapabilities?.offsetParam || "offset";

  return `/**
 * Translate TanStack DB predicates to ${entity.name} query parameters
 */
function ${fnName}(
	options?: LoadSubsetOptions
): ${returnType} {
	if (!options) return {}

	const parsed = parseLoadSubsetOptions(options)
	const params: Record<string, unknown> = {}

	// Map filters to query params
	for (const filter of parsed.filters) {
		const fieldName = filter.field.join(".")
		switch (filter.operator) {
			case "eq":
				params[fieldName] = filter.value
				break
			case "lt":
				params[\`\${fieldName}_lt\`] = filter.value
				break
			case "lte":
				params[\`\${fieldName}_lte\`] = filter.value
				break
			case "gt":
				params[\`\${fieldName}_gt\`] = filter.value
				break
			case "gte":
				params[\`\${fieldName}_gte\`] = filter.value
				break
			case "in":
				params[\`\${fieldName}_in\`] = filter.value
				break
			// Silently ignore unsupported operators
		}
	}

	// Map sorting
	if (parsed.sorts.length > 0) {
		params["${sortParam}"] = parsed.sorts
			.map((s) => \`\${s.direction === "desc" ? "-" : ""}\${s.field.join(".")}\`)
			.join(",")
	}

	// Map pagination (limit from parsed, offset from original options)
	if (parsed.limit != null) params["${limitParam}"] = parsed.limit
	if (options.offset != null) params["${offsetParam}"] = options.offset

	return params as ${returnType}
}`;
}

/**
 * Generate a JSON:API style predicate translator
 * Handles: filter[field], filter[field][op], sort=-field, page[limit], page[offset]
 */
function generateJsonApiTranslator(
  fnName: string,
  returnType: string,
  entity: CollectionEntity,
): string {
  const paginationStyle = entity.paginationCapabilities?.style || "offset";
  const limitParam =
    paginationStyle === "page"
      ? "page[limit]"
      : entity.paginationCapabilities?.limitParam || "page[limit]";
  const offsetParam =
    paginationStyle === "page"
      ? "page[offset]"
      : entity.paginationCapabilities?.offsetParam || "page[offset]";

  return `/**
 * Translate TanStack DB predicates to ${entity.name} JSON:API query parameters
 */
function ${fnName}(
	options?: LoadSubsetOptions
): ${returnType} {
	if (!options) return {}

	const parsed = parseLoadSubsetOptions(options)
	const params: Record<string, unknown> = {}

	// Map filters to JSON:API filter params
	for (const filter of parsed.filters) {
		const fieldName = filter.field.join(".")
		switch (filter.operator) {
			case "eq":
				params[\`filter[\${fieldName}]\`] = filter.value
				break
			case "lt":
				params[\`filter[\${fieldName}][lt]\`] = filter.value
				break
			case "lte":
				params[\`filter[\${fieldName}][lte]\`] = filter.value
				break
			case "gt":
				params[\`filter[\${fieldName}][gt]\`] = filter.value
				break
			case "gte":
				params[\`filter[\${fieldName}][gte]\`] = filter.value
				break
			case "in":
				params[\`filter[\${fieldName}][in]\`] = filter.value
				break
			// Silently ignore unsupported operators
		}
	}

	// Map sorting (JSON:API style: sort=-field,field2)
	if (parsed.sorts.length > 0) {
		params["sort"] = parsed.sorts
			.map((s) => \`\${s.direction === "desc" ? "-" : ""}\${s.field.join(".")}\`)
			.join(",")
	}

	// Map pagination (limit from parsed, offset from original options)
	if (parsed.limit != null) params["${limitParam}"] = parsed.limit
	if (options.offset != null) params["${offsetParam}"] = options.offset

	return params as ${returnType}
}`;
}

// =============================================================================
// GraphQL Translator Generators
// =============================================================================

/**
 * Generate a GraphQL predicate translator function
 */
function generateGraphQLTranslator(
  fnName: string,
  preset: PredicateMappingPreset,
  returnType: string,
  entity: CollectionEntity,
): string {
  switch (preset) {
    case "hasura":
      return generateHasuraTranslator(fnName, returnType, entity);
    case "prisma":
      return generatePrismaTranslator(fnName, returnType, entity);
    default:
      // For OpenAPI presets used with GraphQL, fall back to Hasura style
      return generateHasuraTranslator(fnName, returnType, entity);
  }
}

/**
 * Generate a Hasura-style GraphQL predicate translator
 * Handles: where: { field: { _eq: value } }, order_by: [{ field: asc }], limit, offset
 */
function generateHasuraTranslator(
  fnName: string,
  returnType: string,
  entity: CollectionEntity,
): string {
  const limitParam = entity.paginationCapabilities?.limitParam || "limit";
  const offsetParam = entity.paginationCapabilities?.offsetParam || "offset";

  return `/**
 * Translate TanStack DB predicates to ${entity.name} Hasura GraphQL variables
 */
function ${fnName}(
	options?: LoadSubsetOptions
): ${returnType} {
	if (!options) return {}

	const parsed = parseLoadSubsetOptions(options)
	const variables: Record<string, unknown> = {}

	// Build Hasura-style where clause
	if (parsed.filters.length > 0) {
		const whereConditions: Record<string, unknown>[] = []

		for (const filter of parsed.filters) {
			const fieldPath = filter.field
			let condition: Record<string, unknown> = {}

			switch (filter.operator) {
				case "eq":
					condition = buildNestedObject(fieldPath, { _eq: filter.value })
					break
				case "lt":
					condition = buildNestedObject(fieldPath, { _lt: filter.value })
					break
				case "lte":
					condition = buildNestedObject(fieldPath, { _lte: filter.value })
					break
				case "gt":
					condition = buildNestedObject(fieldPath, { _gt: filter.value })
					break
				case "gte":
					condition = buildNestedObject(fieldPath, { _gte: filter.value })
					break
				case "in":
					condition = buildNestedObject(fieldPath, { _in: filter.value })
					break
				// Silently ignore unsupported operators
				default:
					continue
			}

			whereConditions.push(condition)
		}

		if (whereConditions.length === 1) {
			variables.where = whereConditions[0]
		} else if (whereConditions.length > 1) {
			variables.where = { _and: whereConditions }
		}
	}

	// Build Hasura-style order_by
	if (parsed.sorts.length > 0) {
		variables.order_by = parsed.sorts.map((s) =>
			buildNestedObject(s.field, s.direction)
		)
	}

	// Map pagination (limit from parsed, offset from original options)
	if (parsed.limit != null) variables["${limitParam}"] = parsed.limit
	if (options.offset != null) variables["${offsetParam}"] = options.offset

	return variables as ${returnType}
}

/**
 * Build a nested object from a field path
 * e.g., ["user", "name"] with value "asc" -> { user: { name: "asc" } }
 */
function buildNestedObject(
	path: string[],
	value: unknown
): Record<string, unknown> {
	if (path.length === 0) return value as Record<string, unknown>
	if (path.length === 1) return { [path[0]]: value }

	const [first, ...rest] = path
	return { [first]: buildNestedObject(rest, value) }
}`;
}

/**
 * Generate a Prisma-style GraphQL predicate translator
 * Handles: where: { field: { equals: value } }, orderBy: [{ field: "asc" }], take, skip
 */
function generatePrismaTranslator(
  fnName: string,
  returnType: string,
  entity: CollectionEntity,
): string {
  const limitParam = entity.paginationCapabilities?.limitParam || "take";
  const offsetParam = entity.paginationCapabilities?.offsetParam || "skip";

  return `/**
 * Translate TanStack DB predicates to ${entity.name} Prisma GraphQL variables
 */
function ${fnName}(
	options?: LoadSubsetOptions
): ${returnType} {
	if (!options) return {}

	const parsed = parseLoadSubsetOptions(options)
	const variables: Record<string, unknown> = {}

	// Build Prisma-style where clause
	if (parsed.filters.length > 0) {
		const whereConditions: Record<string, unknown>[] = []

		for (const filter of parsed.filters) {
			const fieldPath = filter.field
			let condition: Record<string, unknown> = {}

			switch (filter.operator) {
				case "eq":
					condition = buildNestedObject(fieldPath, { equals: filter.value })
					break
				case "lt":
					condition = buildNestedObject(fieldPath, { lt: filter.value })
					break
				case "lte":
					condition = buildNestedObject(fieldPath, { lte: filter.value })
					break
				case "gt":
					condition = buildNestedObject(fieldPath, { gt: filter.value })
					break
				case "gte":
					condition = buildNestedObject(fieldPath, { gte: filter.value })
					break
				case "in":
					condition = buildNestedObject(fieldPath, { in: filter.value })
					break
				// Silently ignore unsupported operators
				default:
					continue
			}

			whereConditions.push(condition)
		}

		if (whereConditions.length === 1) {
			variables.where = whereConditions[0]
		} else if (whereConditions.length > 1) {
			variables.where = { AND: whereConditions }
		}
	}

	// Build Prisma-style orderBy
	if (parsed.sorts.length > 0) {
		variables.orderBy = parsed.sorts.map((s) =>
			buildNestedObject(s.field, s.direction)
		)
	}

	// Map pagination (limit from parsed, offset from original options)
	if (parsed.limit != null) variables["${limitParam}"] = parsed.limit
	if (options.offset != null) variables["${offsetParam}"] = options.offset

	return variables as ${returnType}
}

/**
 * Build a nested object from a field path
 * e.g., ["user", "name"] with value "asc" -> { user: { name: "asc" } }
 */
function buildNestedObject(
	path: string[],
	value: unknown
): Record<string, unknown> {
	if (path.length === 0) return value as Record<string, unknown>
	if (path.length === 1) return { [path[0]]: value }

	const [first, ...rest] = path
	return { [first]: buildNestedObject(rest, value) }
}`;
}

// =============================================================================
// Import Helpers
// =============================================================================

/**
 * Get the required imports for predicate translation
 */
export function getPredicateImports(): string {
  return `import { parseLoadSubsetOptions } from "@tanstack/query-db-collection"
import type { LoadSubsetOptions } from "@tanstack/db"`;
}

/**
 * Check if an entity needs predicate translation (is configured for on-demand mode)
 */
export function needsPredicateTranslation(entity: CollectionEntity): boolean {
  return entity.syncMode === "on-demand";
}
