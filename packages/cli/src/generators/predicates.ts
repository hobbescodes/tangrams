/**
 * Predicate translator code generation for TanStack DB on-demand mode
 *
 * Generates functions that translate TanStack DB's LoadSubsetOptions (predicates)
 * into API-specific query parameters or GraphQL variables.
 */

import { createWriter } from "@/utils/writer";

import type CodeBlockWriter from "code-block-writer";
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

  const writer = createWriter();

  if (sourceType === "graphql") {
    writeGraphQLTranslator(writer, fnName, preset, returnType, entity);
  } else {
    writeOpenAPITranslator(writer, fnName, preset, returnType, entity);
  }

  return writer.toString();
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
 * Write an OpenAPI predicate translator function
 */
function writeOpenAPITranslator(
  writer: CodeBlockWriter,
  fnName: string,
  preset: PredicateMappingPreset,
  returnType: string,
  entity: CollectionEntity,
): void {
  switch (preset) {
    case "rest-simple":
      writeRestSimpleTranslator(writer, fnName, returnType, entity);
      break;
    case "jsonapi":
      writeJsonApiTranslator(writer, fnName, returnType, entity);
      break;
    default:
      // For GraphQL presets used with OpenAPI (shouldn't happen), fall back to rest-simple
      writeRestSimpleTranslator(writer, fnName, returnType, entity);
  }
}

/**
 * Write a REST-simple style predicate translator
 * Handles: field_eq, field_lt, field_gt, sort=field:direction, limit, offset
 */
function writeRestSimpleTranslator(
  writer: CodeBlockWriter,
  fnName: string,
  returnType: string,
  entity: CollectionEntity,
): void {
  const sortParam = entity.sortCapabilities?.sortParam || "sort";
  const limitParam = entity.paginationCapabilities?.limitParam || "limit";
  const offsetParam = entity.paginationCapabilities?.offsetParam || "offset";

  writer.writeLine(`/**`);
  writer.writeLine(
    ` * Translate TanStack DB predicates to ${entity.name} query parameters`,
  );
  writer.writeLine(` */`);
  writer.write(`function ${fnName}(`).newLine();
  writer.indent(() => {
    writer.writeLine(`options?: LoadSubsetOptions`);
  });
  writer.write(`): ${returnType}`).block(() => {
    writer.writeLine(`if (!options) return {}`);
    writer.blankLine();
    writer.writeLine(`const parsed = parseLoadSubsetOptions(options)`);
    writer.writeLine(`const params: Record<string, unknown> = {}`);
    writer.blankLine();
    writer.writeLine(`// Map filters to query params`);
    writer.write(`for (const filter of parsed.filters)`).block(() => {
      writer.writeLine(`const fieldName = filter.field.join(".")`);
      writer.write(`switch (filter.operator)`).block(() => {
        writer.writeLine(`case "eq":`);
        writer.indent(() => {
          writer.writeLine(`params[fieldName] = filter.value`);
          writer.writeLine(`break`);
        });
        writer.writeLine(`case "lt":`);
        writer.indent(() => {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          writer.writeLine("params[`${fieldName}_lt`] = filter.value");
          writer.writeLine(`break`);
        });
        writer.writeLine(`case "lte":`);
        writer.indent(() => {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          writer.writeLine("params[`${fieldName}_lte`] = filter.value");
          writer.writeLine(`break`);
        });
        writer.writeLine(`case "gt":`);
        writer.indent(() => {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          writer.writeLine("params[`${fieldName}_gt`] = filter.value");
          writer.writeLine(`break`);
        });
        writer.writeLine(`case "gte":`);
        writer.indent(() => {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          writer.writeLine("params[`${fieldName}_gte`] = filter.value");
          writer.writeLine(`break`);
        });
        writer.writeLine(`case "in":`);
        writer.indent(() => {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          writer.writeLine("params[`${fieldName}_in`] = filter.value");
          writer.writeLine(`break`);
        });
        writer.writeLine(`// Silently ignore unsupported operators`);
      });
    });
    writer.blankLine();
    writer.writeLine(`// Map sorting`);
    writer.write(`if (parsed.sorts.length > 0)`).block(() => {
      writer.writeLine(`params["${sortParam}"] = parsed.sorts`);
      writer.indent(() => {
        writer.writeLine(
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          '.map((s) => `${s.direction === "desc" ? "-" : ""}${s.field.join(".")}`)',
        );
        writer.writeLine(`.join(",")`);
      });
    });
    writer.blankLine();
    writer.writeLine(
      `// Map pagination (limit from parsed, offset from original options)`,
    );
    writer.writeLine(
      `if (parsed.limit != null) params["${limitParam}"] = parsed.limit`,
    );
    writer.writeLine(
      `if (options.offset != null) params["${offsetParam}"] = options.offset`,
    );
    writer.blankLine();
    writer.writeLine(`return params as ${returnType}`);
  });
}

/**
 * Write a JSON:API style predicate translator
 * Handles: filter[field], filter[field][op], sort=-field, page[limit], page[offset]
 */
function writeJsonApiTranslator(
  writer: CodeBlockWriter,
  fnName: string,
  returnType: string,
  entity: CollectionEntity,
): void {
  const paginationStyle = entity.paginationCapabilities?.style || "offset";
  const limitParam =
    paginationStyle === "page"
      ? "page[limit]"
      : entity.paginationCapabilities?.limitParam || "page[limit]";
  const offsetParam =
    paginationStyle === "page"
      ? "page[offset]"
      : entity.paginationCapabilities?.offsetParam || "page[offset]";

  writer.writeLine(`/**`);
  writer.writeLine(
    ` * Translate TanStack DB predicates to ${entity.name} JSON:API query parameters`,
  );
  writer.writeLine(` */`);
  writer.write(`function ${fnName}(`).newLine();
  writer.indent(() => {
    writer.writeLine(`options?: LoadSubsetOptions`);
  });
  writer.write(`): ${returnType}`).block(() => {
    writer.writeLine(`if (!options) return {}`);
    writer.blankLine();
    writer.writeLine(`const parsed = parseLoadSubsetOptions(options)`);
    writer.writeLine(`const params: Record<string, unknown> = {}`);
    writer.blankLine();
    writer.writeLine(`// Map filters to JSON:API filter params`);
    writer.write(`for (const filter of parsed.filters)`).block(() => {
      writer.writeLine(`const fieldName = filter.field.join(".")`);
      writer.write(`switch (filter.operator)`).block(() => {
        writer.writeLine(`case "eq":`);
        writer.indent(() => {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          writer.writeLine("params[`filter[${fieldName}]`] = filter.value");
          writer.writeLine(`break`);
        });
        writer.writeLine(`case "lt":`);
        writer.indent(() => {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          writer.writeLine("params[`filter[${fieldName}][lt]`] = filter.value");
          writer.writeLine(`break`);
        });
        writer.writeLine(`case "lte":`);
        writer.indent(() => {
          writer.writeLine(
            // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
            "params[`filter[${fieldName}][lte]`] = filter.value",
          );
          writer.writeLine(`break`);
        });
        writer.writeLine(`case "gt":`);
        writer.indent(() => {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          writer.writeLine("params[`filter[${fieldName}][gt]`] = filter.value");
          writer.writeLine(`break`);
        });
        writer.writeLine(`case "gte":`);
        writer.indent(() => {
          writer.writeLine(
            // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
            "params[`filter[${fieldName}][gte]`] = filter.value",
          );
          writer.writeLine(`break`);
        });
        writer.writeLine(`case "in":`);
        writer.indent(() => {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          writer.writeLine("params[`filter[${fieldName}][in]`] = filter.value");
          writer.writeLine(`break`);
        });
        writer.writeLine(`// Silently ignore unsupported operators`);
      });
    });
    writer.blankLine();
    writer.writeLine(`// Map sorting (JSON:API style: sort=-field,field2)`);
    writer.write(`if (parsed.sorts.length > 0)`).block(() => {
      writer.writeLine(`params["sort"] = parsed.sorts`);
      writer.indent(() => {
        writer.writeLine(
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generating template literal output
          '.map((s) => `${s.direction === "desc" ? "-" : ""}${s.field.join(".")}`)',
        );
        writer.writeLine(`.join(",")`);
      });
    });
    writer.blankLine();
    writer.writeLine(
      `// Map pagination (limit from parsed, offset from original options)`,
    );
    writer.writeLine(
      `if (parsed.limit != null) params["${limitParam}"] = parsed.limit`,
    );
    writer.writeLine(
      `if (options.offset != null) params["${offsetParam}"] = options.offset`,
    );
    writer.blankLine();
    writer.writeLine(`return params as ${returnType}`);
  });
}

// =============================================================================
// GraphQL Translator Generators
// =============================================================================

/**
 * Write a GraphQL predicate translator function
 */
function writeGraphQLTranslator(
  writer: CodeBlockWriter,
  fnName: string,
  preset: PredicateMappingPreset,
  returnType: string,
  entity: CollectionEntity,
): void {
  switch (preset) {
    case "hasura":
      writeHasuraTranslator(writer, fnName, returnType, entity);
      break;
    case "prisma":
      writePrismaTranslator(writer, fnName, returnType, entity);
      break;
    default:
      // For OpenAPI presets used with GraphQL, fall back to Hasura style
      writeHasuraTranslator(writer, fnName, returnType, entity);
  }
}

/**
 * Write a Hasura-style GraphQL predicate translator
 * Handles: where: { field: { _eq: value } }, order_by: [{ field: asc }], limit, offset
 */
function writeHasuraTranslator(
  writer: CodeBlockWriter,
  fnName: string,
  returnType: string,
  entity: CollectionEntity,
): void {
  const limitParam = entity.paginationCapabilities?.limitParam || "limit";
  const offsetParam = entity.paginationCapabilities?.offsetParam || "offset";

  writer.writeLine(`/**`);
  writer.writeLine(
    ` * Translate TanStack DB predicates to ${entity.name} Hasura GraphQL variables`,
  );
  writer.writeLine(` */`);
  writer.write(`function ${fnName}(`).newLine();
  writer.indent(() => {
    writer.writeLine(`options?: LoadSubsetOptions`);
  });
  writer.write(`): ${returnType}`).block(() => {
    writer.writeLine(`if (!options) return {}`);
    writer.blankLine();
    writer.writeLine(`const parsed = parseLoadSubsetOptions(options)`);
    writer.writeLine(`const variables: Record<string, unknown> = {}`);
    writer.blankLine();
    writer.writeLine(`// Build Hasura-style where clause`);
    writer.write(`if (parsed.filters.length > 0)`).block(() => {
      writer.writeLine(`const whereConditions: Record<string, unknown>[] = []`);
      writer.blankLine();
      writer.write(`for (const filter of parsed.filters)`).block(() => {
        writer.writeLine(`const fieldPath = filter.field`);
        writer.writeLine(`let condition: Record<string, unknown> = {}`);
        writer.blankLine();
        writer.write(`switch (filter.operator)`).block(() => {
          writer.writeLine(`case "eq":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { _eq: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`case "lt":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { _lt: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`case "lte":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { _lte: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`case "gt":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { _gt: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`case "gte":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { _gte: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`case "in":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { _in: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`// Silently ignore unsupported operators`);
          writer.writeLine(`default:`);
          writer.indent(() => {
            writer.writeLine(`continue`);
          });
        });
        writer.blankLine();
        writer.writeLine(`whereConditions.push(condition)`);
      });
      writer.blankLine();
      writer.write(`if (whereConditions.length === 1)`).block(() => {
        writer.writeLine(`variables.where = whereConditions[0]`);
      });
      writer.write(` else if (whereConditions.length > 1)`).block(() => {
        writer.writeLine(`variables.where = { _and: whereConditions }`);
      });
    });
    writer.blankLine();
    writer.writeLine(`// Build Hasura-style order_by`);
    writer.write(`if (parsed.sorts.length > 0)`).block(() => {
      writer.writeLine(`variables.order_by = parsed.sorts.map((s) =>`);
      writer.indent(() => {
        writer.writeLine(`buildNestedObject(s.field, s.direction)`);
      });
      writer.writeLine(`)`);
    });
    writer.blankLine();
    writer.writeLine(
      `// Map pagination (limit from parsed, offset from original options)`,
    );
    writer.writeLine(
      `if (parsed.limit != null) variables["${limitParam}"] = parsed.limit`,
    );
    writer.writeLine(
      `if (options.offset != null) variables["${offsetParam}"] = options.offset`,
    );
    writer.blankLine();
    writer.writeLine(`return variables as ${returnType}`);
  });
  writer.blankLine();
  writeBuildNestedObjectHelper(writer);
}

/**
 * Write a Prisma-style GraphQL predicate translator
 * Handles: where: { field: { equals: value } }, orderBy: [{ field: "asc" }], take, skip
 */
function writePrismaTranslator(
  writer: CodeBlockWriter,
  fnName: string,
  returnType: string,
  entity: CollectionEntity,
): void {
  const limitParam = entity.paginationCapabilities?.limitParam || "take";
  const offsetParam = entity.paginationCapabilities?.offsetParam || "skip";

  writer.writeLine(`/**`);
  writer.writeLine(
    ` * Translate TanStack DB predicates to ${entity.name} Prisma GraphQL variables`,
  );
  writer.writeLine(` */`);
  writer.write(`function ${fnName}(`).newLine();
  writer.indent(() => {
    writer.writeLine(`options?: LoadSubsetOptions`);
  });
  writer.write(`): ${returnType}`).block(() => {
    writer.writeLine(`if (!options) return {}`);
    writer.blankLine();
    writer.writeLine(`const parsed = parseLoadSubsetOptions(options)`);
    writer.writeLine(`const variables: Record<string, unknown> = {}`);
    writer.blankLine();
    writer.writeLine(`// Build Prisma-style where clause`);
    writer.write(`if (parsed.filters.length > 0)`).block(() => {
      writer.writeLine(`const whereConditions: Record<string, unknown>[] = []`);
      writer.blankLine();
      writer.write(`for (const filter of parsed.filters)`).block(() => {
        writer.writeLine(`const fieldPath = filter.field`);
        writer.writeLine(`let condition: Record<string, unknown> = {}`);
        writer.blankLine();
        writer.write(`switch (filter.operator)`).block(() => {
          writer.writeLine(`case "eq":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { equals: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`case "lt":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { lt: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`case "lte":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { lte: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`case "gt":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { gt: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`case "gte":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { gte: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`case "in":`);
          writer.indent(() => {
            writer.writeLine(
              `condition = buildNestedObject(fieldPath, { in: filter.value })`,
            );
            writer.writeLine(`break`);
          });
          writer.writeLine(`// Silently ignore unsupported operators`);
          writer.writeLine(`default:`);
          writer.indent(() => {
            writer.writeLine(`continue`);
          });
        });
        writer.blankLine();
        writer.writeLine(`whereConditions.push(condition)`);
      });
      writer.blankLine();
      writer.write(`if (whereConditions.length === 1)`).block(() => {
        writer.writeLine(`variables.where = whereConditions[0]`);
      });
      writer.write(` else if (whereConditions.length > 1)`).block(() => {
        writer.writeLine(`variables.where = { AND: whereConditions }`);
      });
    });
    writer.blankLine();
    writer.writeLine(`// Build Prisma-style orderBy`);
    writer.write(`if (parsed.sorts.length > 0)`).block(() => {
      writer.writeLine(`variables.orderBy = parsed.sorts.map((s) =>`);
      writer.indent(() => {
        writer.writeLine(`buildNestedObject(s.field, s.direction)`);
      });
      writer.writeLine(`)`);
    });
    writer.blankLine();
    writer.writeLine(
      `// Map pagination (limit from parsed, offset from original options)`,
    );
    writer.writeLine(
      `if (parsed.limit != null) variables["${limitParam}"] = parsed.limit`,
    );
    writer.writeLine(
      `if (options.offset != null) variables["${offsetParam}"] = options.offset`,
    );
    writer.blankLine();
    writer.writeLine(`return variables as ${returnType}`);
  });
  writer.blankLine();
  writeBuildNestedObjectHelper(writer);
}

/**
 * Write the buildNestedObject helper function
 */
function writeBuildNestedObjectHelper(writer: CodeBlockWriter): void {
  writer.writeLine(`/**`);
  writer.writeLine(` * Build a nested object from a field path`);
  writer.writeLine(
    ` * e.g., ["user", "name"] with value "asc" -> { user: { name: "asc" } }`,
  );
  writer.writeLine(` */`);
  writer.write(`function buildNestedObject(`).newLine();
  writer.indent(() => {
    writer.writeLine(`path: string[],`);
    writer.writeLine(`value: unknown`);
  });
  writer.write(`): Record<string, unknown>`).block(() => {
    writer.writeLine(
      `if (path.length === 0) return value as Record<string, unknown>`,
    );
    writer.writeLine(`if (path.length === 1) return { [path[0]]: value }`);
    writer.blankLine();
    writer.writeLine(`const [first, ...rest] = path`);
    writer.writeLine(`return { [first]: buildNestedObject(rest, value) }`);
  });
}

/**
 * Check if an entity needs predicate translation (is configured for on-demand mode)
 */
export function needsPredicateTranslation(entity: CollectionEntity): boolean {
  return entity.syncMode === "on-demand";
}
