import { graphqlAdapter } from "./graphql";
import { openapiAdapter } from "./openapi";

import type { SourceConfig } from "@/core/config";
import type { AnyAdapter, SourceAdapter } from "./types";

/**
 * Registry of available source adapters
 */
const adapters: Map<string, AnyAdapter> = new Map();

/**
 * Register a source adapter
 * @param adapter The adapter to register
 */
export function registerAdapter(adapter: AnyAdapter): void {
  if (adapters.has(adapter.type)) {
    throw new Error(`Adapter for type "${adapter.type}" is already registered`);
  }
  adapters.set(adapter.type, adapter);
}

/**
 * Get an adapter for a source type
 * @param type The source type
 * @returns The adapter for the given type
 * @throws Error if no adapter is registered for the type
 */
export function getAdapter<T extends SourceConfig["type"]>(
  type: T,
): SourceAdapter {
  const adapter = adapters.get(type);
  if (!adapter) {
    throw new Error(
      `No adapter registered for source type "${type}". ` +
        `Available types: ${[...adapters.keys()].join(", ") || "none"}`,
    );
  }
  return adapter;
}

/**
 * Check if an adapter is registered for a source type
 * @param type The source type to check
 * @returns True if an adapter is registered
 */
export function hasAdapter(type: string): boolean {
  return adapters.has(type);
}

/**
 * Get all registered adapter types
 * @returns Array of registered adapter type names
 */
export function getRegisteredAdapterTypes(): string[] {
  return [...adapters.keys()];
}

// Register built-in adapters
registerAdapter(graphqlAdapter);
registerAdapter(openapiAdapter);

// Re-export types
export * from "./types";
