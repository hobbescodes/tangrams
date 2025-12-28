/**
 * Tangrams Manifest
 *
 * Tracks generated artifacts for cleanup detection.
 * The manifest is stored in the tangrams output directory and should be gitignored.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  GraphQLSourceConfig,
  OpenAPISourceConfig,
  SourceConfig,
} from "./config";

// =============================================================================
// Constants
// =============================================================================

export const manifestFileName = ".tangrams-manifest.json";
export const manifestVersion = 1;

// =============================================================================
// Types
// =============================================================================

/**
 * GraphQL source fingerprint for rename detection
 */
export interface GraphQLFingerprint {
  type: "graphql";
  /** Schema URL (from schema.url) */
  schemaUrl?: string;
  /** Schema file paths (from schema.file), sorted */
  schemaFiles?: string[];
  /** Document patterns, sorted */
  documents: string[];
}

/**
 * OpenAPI source fingerprint for rename detection
 */
export interface OpenAPIFingerprint {
  type: "openapi";
  /** Spec URL or file path */
  specPath: string;
  /** Include patterns, sorted */
  include?: string[];
  /** Exclude patterns, sorted */
  exclude?: string[];
}

/**
 * Source configuration fingerprint for rename detection
 */
export type SourceConfigFingerprint = GraphQLFingerprint | OpenAPIFingerprint;

/**
 * Manifest entry for a single source
 */
export interface SourceManifestEntry {
  /** Source type */
  type: "graphql" | "openapi";
  /** Configuration fingerprint for rename detection */
  configFingerprint: SourceConfigFingerprint;
  /** ISO timestamp when this source was last generated */
  generatedAt: string;
  /** Relative file paths from source directory */
  files: string[];
}

/**
 * The tangrams manifest file structure
 */
export interface TangramsManifest {
  /** Manifest schema version */
  version: typeof manifestVersion;
  /** ISO timestamp when manifest was last updated */
  generatedAt: string;
  /** Map of source name to manifest entry */
  sources: Record<string, SourceManifestEntry>;
}

// =============================================================================
// Fingerprint Functions
// =============================================================================

/**
 * Create a fingerprint from a GraphQL source config
 */
function createGraphQLFingerprint(
  source: GraphQLSourceConfig,
): GraphQLFingerprint {
  const fingerprint: GraphQLFingerprint = {
    type: "graphql",
    documents: normalizeStringArray(source.documents),
  };

  // Handle schema configuration
  if ("url" in source.schema) {
    fingerprint.schemaUrl = source.schema.url;
  } else if ("file" in source.schema) {
    fingerprint.schemaFiles = normalizeStringArray(source.schema.file);
  }

  return fingerprint;
}

/**
 * Create a fingerprint from an OpenAPI source config
 */
function createOpenAPIFingerprint(
  source: OpenAPISourceConfig,
): OpenAPIFingerprint {
  const fingerprint: OpenAPIFingerprint = {
    type: "openapi",
    specPath: source.spec,
  };

  if (source.include && source.include.length > 0) {
    fingerprint.include = [...source.include].sort();
  }

  if (source.exclude && source.exclude.length > 0) {
    fingerprint.exclude = [...source.exclude].sort();
  }

  return fingerprint;
}

/**
 * Create a configuration fingerprint from a source config
 * Used for detecting source renames
 */
export function createFingerprint(
  source: SourceConfig,
): SourceConfigFingerprint {
  if (source.type === "graphql") {
    return createGraphQLFingerprint(source);
  }
  return createOpenAPIFingerprint(source);
}

/**
 * Check if two fingerprints match (used for rename detection)
 */
export function fingerprintsMatch(
  a: SourceConfigFingerprint,
  b: SourceConfigFingerprint,
): boolean {
  // Must be same type
  if (a.type !== b.type) {
    return false;
  }

  if (a.type === "graphql" && b.type === "graphql") {
    return graphQLFingerprintsMatch(a, b);
  }

  if (a.type === "openapi" && b.type === "openapi") {
    return openAPIFingerprintsMatch(a, b);
  }

  return false;
}

/**
 * Check if two GraphQL fingerprints match
 */
function graphQLFingerprintsMatch(
  a: GraphQLFingerprint,
  b: GraphQLFingerprint,
): boolean {
  // Schema URL must match (if present)
  if (a.schemaUrl !== b.schemaUrl) {
    return false;
  }

  // Schema files must match (if present)
  if (!arraysEqual(a.schemaFiles, b.schemaFiles)) {
    return false;
  }

  // Documents must match
  if (!arraysEqual(a.documents, b.documents)) {
    return false;
  }

  return true;
}

/**
 * Check if two OpenAPI fingerprints match
 */
function openAPIFingerprintsMatch(
  a: OpenAPIFingerprint,
  b: OpenAPIFingerprint,
): boolean {
  // Spec path must match
  if (a.specPath !== b.specPath) {
    return false;
  }

  // Include patterns must match
  if (!arraysEqual(a.include, b.include)) {
    return false;
  }

  // Exclude patterns must match
  if (!arraysEqual(a.exclude, b.exclude)) {
    return false;
  }

  return true;
}

// =============================================================================
// Manifest I/O Functions
// =============================================================================

/**
 * Get the manifest file path for a tangrams output directory
 */
export function getManifestPath(tangramsOutputDir: string): string {
  return join(tangramsOutputDir, manifestFileName);
}

/**
 * Load the manifest from the tangrams output directory
 * Returns null if manifest doesn't exist or is invalid
 */
export async function loadManifest(
  tangramsOutputDir: string,
): Promise<TangramsManifest | null> {
  const manifestPath = getManifestPath(tangramsOutputDir);

  try {
    const content = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;

    // Validate basic structure
    if (!isValidManifest(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    // File doesn't exist or is invalid JSON
    return null;
  }
}

/**
 * Save the manifest to the tangrams output directory
 */
export async function saveManifest(
  tangramsOutputDir: string,
  manifest: TangramsManifest,
): Promise<void> {
  const manifestPath = getManifestPath(tangramsOutputDir);
  const content = JSON.stringify(manifest, null, 2);
  await writeFile(manifestPath, content, "utf-8");
}

/**
 * Create a new empty manifest
 */
export function createEmptyManifest(): TangramsManifest {
  return {
    version: manifestVersion,
    generatedAt: new Date().toISOString(),
    sources: {},
  };
}

/**
 * Create a manifest entry for a source
 */
export function createSourceEntry(
  source: SourceConfig,
  files: string[],
): SourceManifestEntry {
  return {
    type: source.type,
    configFingerprint: createFingerprint(source),
    generatedAt: new Date().toISOString(),
    files,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize a string or string array to a sorted array
 */
function normalizeStringArray(value: string | string[]): string[] {
  const arr = Array.isArray(value) ? value : [value];
  return [...arr].sort();
}

/**
 * Check if two arrays are equal (handles undefined)
 */
function arraysEqual(
  a: string[] | undefined,
  b: string[] | undefined,
): boolean {
  if (a === undefined && b === undefined) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((val, idx) => val === b[idx]);
}

/**
 * Type guard to validate manifest structure
 */
function isValidManifest(value: unknown): value is TangramsManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check version
  if (obj.version !== manifestVersion) {
    return false;
  }

  // Check generatedAt
  if (typeof obj.generatedAt !== "string") {
    return false;
  }

  // Check sources
  if (typeof obj.sources !== "object" || obj.sources === null) {
    return false;
  }

  return true;
}
