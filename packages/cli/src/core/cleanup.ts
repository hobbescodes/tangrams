/**
 * Stale Artifact Cleanup
 *
 * Detects and removes orphaned source directories when sources are renamed or removed.
 * Handles client.ts migration when a rename is detected.
 */

import { constants } from "node:fs";
import { access, cp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import consola from "consola";

import { createFingerprint, fingerprintsMatch } from "./manifest";

import type { SourceConfig, TangramsConfig } from "./config";
import type { SourceManifestEntry, TangramsManifest } from "./manifest";

// =============================================================================
// Types
// =============================================================================

/**
 * An orphaned source that exists in manifest but not in config
 */
export interface OrphanedSource {
  /** Source name from manifest */
  name: string;
  /** Absolute path to source directory */
  directory: string;
  /** Files that were generated (from manifest) */
  files: string[];
  /** The manifest entry for this source */
  manifestEntry: SourceManifestEntry;
}

/**
 * A detected rename where an orphaned source matches a new source by fingerprint
 */
export interface RenamedSource {
  /** Old source name (from manifest) */
  oldName: string;
  /** New source name (from config) */
  newName: string;
  /** Absolute path to old source directory */
  oldDirectory: string;
  /** Absolute path to new source directory */
  newDirectory: string;
  /** Whether client.ts exists in the old directory */
  hasClientTs: boolean;
}

/**
 * Result of cleanup analysis
 */
export interface CleanupAnalysis {
  /** Sources that should be removed (no matching fingerprint in config) */
  orphanedSources: OrphanedSource[];
  /** Sources that were renamed (fingerprint match found) */
  renamedSources: RenamedSource[];
}

/**
 * Options for cleanup operations
 */
export interface CleanupOptions {
  /** Skip confirmation prompts */
  yes?: boolean;
  /** Running in watch mode (auto-yes) */
  isWatchMode?: boolean;
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Analyze the manifest and config to detect orphaned and renamed sources
 */
export async function analyzeCleanup(
  manifest: TangramsManifest | null,
  config: TangramsConfig,
  tangramsOutputDir: string,
): Promise<CleanupAnalysis> {
  const result: CleanupAnalysis = {
    orphanedSources: [],
    renamedSources: [],
  };

  // No manifest means nothing to clean up
  if (!manifest) {
    return result;
  }

  // Get current source names from config
  const currentSourceNames = new Set(config.sources.map((s) => s.name));

  // Find sources in manifest that are not in current config
  const orphanedNames = Object.keys(manifest.sources).filter(
    (name) => !currentSourceNames.has(name),
  );

  if (orphanedNames.length === 0) {
    return result;
  }

  // Find new sources (in config but not in manifest)
  const manifestSourceNames = new Set(Object.keys(manifest.sources));
  const newSources = config.sources.filter(
    (s) => !manifestSourceNames.has(s.name),
  );

  // For each orphaned source, check if it matches a new source by fingerprint
  for (const orphanedName of orphanedNames) {
    const manifestEntry = manifest.sources[orphanedName];
    if (!manifestEntry) {
      // Should not happen, but guard against it
      continue;
    }
    const orphanedFingerprint = manifestEntry.configFingerprint;
    const orphanedDir = join(process.cwd(), tangramsOutputDir, orphanedName);

    // Check if directory actually exists
    const dirExists = await directoryExists(orphanedDir);
    if (!dirExists) {
      // Directory already removed, skip
      continue;
    }

    // Try to find a matching new source by fingerprint
    const matchingNewSource = findMatchingSource(
      orphanedFingerprint,
      newSources,
    );

    if (matchingNewSource) {
      // This is a rename
      const newDir = join(
        process.cwd(),
        tangramsOutputDir,
        matchingNewSource.name,
      );
      const hasClientTs = await fileExists(join(orphanedDir, "client.ts"));

      result.renamedSources.push({
        oldName: orphanedName,
        newName: matchingNewSource.name,
        oldDirectory: orphanedDir,
        newDirectory: newDir,
        hasClientTs,
      });

      // Remove from newSources to prevent multiple matches
      const idx = newSources.indexOf(matchingNewSource);
      if (idx !== -1) {
        newSources.splice(idx, 1);
      }
    } else {
      // This is a genuine orphan (source removed)
      result.orphanedSources.push({
        name: orphanedName,
        directory: orphanedDir,
        files: manifestEntry.files,
        manifestEntry,
      });
    }
  }

  return result;
}

/**
 * Find a source config that matches the given fingerprint
 * Returns undefined if no match or multiple matches (ambiguous)
 */
function findMatchingSource(
  fingerprint: SourceManifestEntry["configFingerprint"],
  sources: SourceConfig[],
): SourceConfig | undefined {
  const matches = sources.filter((source) => {
    const sourceFingerprint = createFingerprint(source);
    return fingerprintsMatch(fingerprint, sourceFingerprint);
  });

  // Only return if exactly one match (avoid ambiguity)
  if (matches.length === 1) {
    return matches[0];
  }

  return undefined;
}

// =============================================================================
// Prompt Functions
// =============================================================================

/**
 * Display cleanup analysis and prompt for confirmation
 * Returns true if cleanup should proceed
 */
export async function promptForCleanup(
  analysis: CleanupAnalysis,
  options: CleanupOptions = {},
): Promise<boolean> {
  const { yes = false, isWatchMode = false } = options;

  // Nothing to clean up
  if (
    analysis.orphanedSources.length === 0 &&
    analysis.renamedSources.length === 0
  ) {
    return false;
  }

  // Display what will be cleaned up
  consola.info("");
  consola.info("Detected stale artifacts:");
  consola.info("");

  // Show renames first
  for (const rename of analysis.renamedSources) {
    consola.info(`  Rename detected: ${rename.oldName} -> ${rename.newName}`);
    if (rename.hasClientTs) {
      consola.info(`    - Will copy client.ts to ${rename.newName}/`);
    }
    consola.info(`    - Will remove ${rename.oldName}/`);
  }

  // Show orphans
  for (const orphan of analysis.orphanedSources) {
    consola.info(`  Orphaned: ${orphan.name}`);
    consola.info(`    - Will remove ${orphan.name}/`);
  }

  consola.info("");

  // Auto-yes in watch mode or if --yes flag
  if (yes || isWatchMode) {
    consola.info("Proceeding with cleanup...");
    return true;
  }

  // Prompt for confirmation
  const confirmed = await consola.prompt("Proceed with cleanup?", {
    type: "confirm",
    initial: false,
  });

  // Handle case where prompt returns a symbol (e.g., user pressed Ctrl+C)
  if (typeof confirmed !== "boolean") {
    return false;
  }

  return confirmed;
}

// =============================================================================
// Execution Functions
// =============================================================================

/**
 * Execute the cleanup operations
 */
export async function executeCleanup(
  analysis: CleanupAnalysis,
  _tangramsOutputDir: string,
): Promise<void> {
  // Handle renames first (copy client.ts before removing)
  for (const rename of analysis.renamedSources) {
    if (rename.hasClientTs) {
      try {
        const oldClientPath = join(rename.oldDirectory, "client.ts");
        const newClientPath = join(rename.newDirectory, "client.ts");

        // Ensure new directory exists before copying
        // The generator will create it, but we might run cleanup before generation
        // So we just copy if the source exists
        await cp(oldClientPath, newClientPath, { force: true });
        consola.success(
          `Migrated client.ts from ${rename.oldName} to ${rename.newName}`,
        );
      } catch (error) {
        consola.warn(
          `Failed to migrate client.ts from ${rename.oldName}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    // Remove old directory
    try {
      await rm(rename.oldDirectory, { recursive: true, force: true });
      consola.success(`Removed stale directory: ${rename.oldName}/`);
    } catch (error) {
      consola.warn(
        `Failed to remove ${rename.oldName}/: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Remove orphaned directories
  for (const orphan of analysis.orphanedSources) {
    try {
      await rm(orphan.directory, { recursive: true, force: true });
      consola.success(`Removed stale directory: ${orphan.name}/`);
    } catch (error) {
      consola.warn(
        `Failed to remove ${orphan.name}/: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}

/**
 * Check if cleanup is needed (has any orphaned or renamed sources)
 */
export function needsCleanup(analysis: CleanupAnalysis): boolean {
  return (
    analysis.orphanedSources.length > 0 || analysis.renamedSources.length > 0
  );
}

/**
 * Get existing source directories in the tangrams output directory
 * Used to detect directories that exist but aren't in manifest
 */
export async function getExistingSourceDirectories(
  tangramsOutputDir: string,
): Promise<string[]> {
  const fullPath = join(process.cwd(), tangramsOutputDir);

  try {
    const entries = await readdir(fullPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith(".")); // Exclude hidden directories
  } catch {
    return [];
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
