import { readFile } from "node:fs/promises";

import fg from "fast-glob";
import { Kind, parse } from "graphql";

import type {
  DocumentNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
} from "graphql";

export interface ParsedOperation {
  name: string;
  operation: "query" | "mutation" | "subscription";
  node: OperationDefinitionNode;
  document: string;
}

export interface ParsedFragment {
  name: string;
  typeName: string;
  node: FragmentDefinitionNode;
  document: string;
}

export interface ParsedDocuments {
  operations: ParsedOperation[];
  fragments: ParsedFragment[];
}

/**
 * Load and parse GraphQL documents from glob patterns
 */
export async function loadDocuments(
  patterns: string | string[],
): Promise<ParsedDocuments> {
  const patternArray = Array.isArray(patterns) ? patterns : [patterns];

  // Find all matching files
  const files = await fg(patternArray, {
    absolute: true,
    onlyFiles: true,
  });

  if (files.length === 0) {
    throw new Error(
      `No GraphQL documents found matching: ${patternArray.join(", ")}`,
    );
  }

  const operations: ParsedOperation[] = [];
  const fragments: ParsedFragment[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const document = parse(content);

    const { ops, frags } = extractDefinitions(document, content);
    operations.push(...ops);
    fragments.push(...frags);
  }

  return { operations, fragments };
}

/**
 * Extract operations and fragments from a parsed document
 */
function extractDefinitions(
  document: DocumentNode,
  source: string,
): { ops: ParsedOperation[]; frags: ParsedFragment[] } {
  const ops: ParsedOperation[] = [];
  const frags: ParsedFragment[] = [];

  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      if (!definition.name) {
        throw new Error(
          "All operations must have a name. Found anonymous operation.",
        );
      }

      const operationType = definition.operation;
      if (operationType === "subscription") {
        // We'll support subscriptions later
        continue;
      }

      ops.push({
        name: definition.name.value,
        operation: operationType,
        node: definition,
        document: extractOperationSource(source, definition.name.value),
      });
    }

    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      frags.push({
        name: definition.name.value,
        typeName: definition.typeCondition.name.value,
        node: definition,
        document: extractFragmentSource(source, definition.name.value),
      });
    }
  }

  return { ops, frags };
}

/**
 * Extract the source text for a named operation
 * This is a simple regex-based extraction
 */
function extractOperationSource(source: string, name: string): string {
  const regex = new RegExp(
    `(query|mutation|subscription)\\s+${name}[^{]*\\{[\\s\\S]*?\\n\\}`,
    "m",
  );
  const match = source.match(regex);
  return match ? match[0] : "";
}

/**
 * Extract the source text for a named fragment
 */
function extractFragmentSource(source: string, name: string): string {
  const regex = new RegExp(`fragment\\s+${name}[^{]*\\{[\\s\\S]*?\\n\\}`, "m");
  const match = source.match(regex);
  return match ? match[0] : "";
}

/**
 * Get the fragment dependencies for an operation
 */
export function getFragmentDependencies(
  operation: ParsedOperation,
  allFragments: ParsedFragment[],
): ParsedFragment[] {
  const deps: ParsedFragment[] = [];
  const visited = new Set<string>();

  function visit(node: OperationDefinitionNode | FragmentDefinitionNode) {
    // Find all fragment spreads in this node
    const spreads = findFragmentSpreads(node);

    for (const spread of spreads) {
      if (visited.has(spread)) continue;
      visited.add(spread);

      const fragment = allFragments.find((f) => f.name === spread);
      if (fragment) {
        // Recursively get dependencies of this fragment
        visit(fragment.node);
        deps.push(fragment);
      }
    }
  }

  visit(operation.node);
  return deps;
}

/**
 * Find all fragment spread names in a node
 */
function findFragmentSpreads(
  node: OperationDefinitionNode | FragmentDefinitionNode,
): string[] {
  const spreads: string[] = [];
  const visited = new WeakSet<object>();

  function traverse(obj: unknown) {
    if (!obj || typeof obj !== "object") return;

    // Avoid circular references (GraphQL AST has loc.source that can cause loops)
    if (visited.has(obj as object)) return;
    visited.add(obj as object);

    if (
      "kind" in obj &&
      (obj as { kind: string }).kind === Kind.FRAGMENT_SPREAD &&
      "name" in obj &&
      typeof obj.name === "object" &&
      obj.name &&
      "value" in obj.name
    ) {
      spreads.push((obj.name as { value: string }).value);
    }

    // Only traverse known AST fields, skip 'loc' to avoid circular refs
    const astFields = [
      "definitions",
      "selectionSet",
      "selections",
      "arguments",
      "variableDefinitions",
      "directives",
    ];

    for (const key of astFields) {
      if (key in obj) {
        const value = (obj as Record<string, unknown>)[key];
        if (Array.isArray(value)) {
          for (const item of value) {
            traverse(item);
          }
        } else if (typeof value === "object") {
          traverse(value);
        }
      }
    }
  }

  traverse(node);
  return [...new Set(spreads)];
}
