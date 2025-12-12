import { watch } from "chokidar";
import fg from "fast-glob";
import picomatch from "picomatch";

import type { FSWatcher } from "chokidar";

export interface WatcherOptions {
  /** Path to the config file to watch */
  configPath: string;
  /** Glob pattern(s) for document files to watch */
  documentPatterns: string | string[];
  /** Debounce delay in milliseconds (default: 200) */
  debounceMs?: number;
  /** Called when the config file changes */
  onConfigChange: () => void | Promise<void>;
  /** Called when document files change */
  onDocumentChange: () => void | Promise<void>;
  /** Called when an error occurs in the watcher */
  onError?: (error: Error) => void;
}

export interface Watcher {
  /** Start watching files */
  start: () => Promise<void>;
  /** Stop watching files */
  stop: () => Promise<void>;
  /** Get the list of document files being watched */
  getWatchedDocuments: () => string[];
}

/**
 * Extract the base directory from a glob pattern.
 * Returns the static part of the path before any glob characters.
 *
 * Examples:
 * - "./src/graphql/**\/*.graphql" -> "./src/graphql"
 * - "src/*.ts" -> "src"
 * - "**\/*.graphql" -> "."
 */
export function getGlobBaseDir(pattern: string): string {
  // Glob special characters
  const globChars = ["*", "?", "[", "{", "(", "!"];

  // Find the first glob character
  let firstGlobIndex = pattern.length;
  for (const char of globChars) {
    const index = pattern.indexOf(char);
    if (index !== -1 && index < firstGlobIndex) {
      firstGlobIndex = index;
    }
  }

  // Get the path up to (but not including) the first glob character
  const staticPart = pattern.slice(0, firstGlobIndex);

  // Find the last path separator in the static part
  const lastSepIndex = Math.max(
    staticPart.lastIndexOf("/"),
    staticPart.lastIndexOf("\\"),
  );

  if (lastSepIndex === -1) {
    // No separator found, use current directory
    return ".";
  }

  const baseDir = staticPart.slice(0, lastSepIndex);
  return baseDir || ".";
}

/**
 * Get unique base directories from multiple glob patterns.
 */
export function getWatchDirs(patterns: string[]): string[] {
  const dirs = new Set<string>();
  for (const pattern of patterns) {
    dirs.add(getGlobBaseDir(pattern));
  }
  return Array.from(dirs);
}

/**
 * Creates a debounced function that delays invoking the callback
 * until after the specified wait time has elapsed since the last call.
 */
function debounce<T extends () => void | Promise<void>>(
  fn: T,
  waitMs: number,
): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn();
    }, waitMs);
  };
}

/**
 * Create a file watcher for the config file and document files.
 *
 * The watcher will:
 * - Watch the config file for changes
 * - Watch document files matching the provided glob patterns
 * - Debounce rapid file changes to avoid multiple regenerations
 * - Distinguish between config changes and document changes
 */
export function createWatcher(options: WatcherOptions): Watcher {
  const {
    configPath,
    documentPatterns,
    debounceMs = 200,
    onConfigChange,
    onDocumentChange,
    onError,
  } = options;

  let configWatcher: FSWatcher | null = null;
  let documentWatcher: FSWatcher | null = null;
  let watchedDocuments: string[] = [];

  // Create debounced handlers
  const debouncedConfigChange = debounce(onConfigChange, debounceMs);
  const debouncedDocumentChange = debounce(onDocumentChange, debounceMs);

  const start = async () => {
    // Resolve document patterns to get the list of files
    const patterns = Array.isArray(documentPatterns)
      ? documentPatterns
      : [documentPatterns];

    watchedDocuments = await fg(patterns, {
      absolute: true,
      onlyFiles: true,
    });

    // Watch config file
    configWatcher = watch(configPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    configWatcher.on("change", () => {
      debouncedConfigChange();
    });

    configWatcher.on("error", (error: unknown) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    });

    // Create a matcher function from the glob patterns
    // This is used to filter file events to only those matching the patterns
    const isMatch = picomatch(patterns);

    // Get base directories to watch (chokidar v4+ doesn't support globs)
    const watchDirs = getWatchDirs(patterns);

    // Watch the base directories recursively
    documentWatcher = watch(watchDirs, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    documentWatcher.on("add", async (filePath) => {
      // Only handle files that match the glob patterns
      if (!isMatch(filePath)) return;

      // Update the watched documents list when a new file is added
      if (!watchedDocuments.includes(filePath)) {
        watchedDocuments.push(filePath);
      }
      debouncedDocumentChange();
    });

    documentWatcher.on("change", (filePath) => {
      // Only handle files that match the glob patterns
      if (!isMatch(filePath)) return;

      debouncedDocumentChange();
    });

    documentWatcher.on("unlink", (filePath) => {
      // Only handle files that match the glob patterns
      if (!isMatch(filePath)) return;

      // Remove from watched documents when file is deleted
      watchedDocuments = watchedDocuments.filter((f) => f !== filePath);
      debouncedDocumentChange();
    });

    documentWatcher.on("error", (error: unknown) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    });
  };

  const stop = async () => {
    if (configWatcher) {
      await configWatcher.close();
      configWatcher = null;
    }
    if (documentWatcher) {
      await documentWatcher.close();
      documentWatcher = null;
    }
    watchedDocuments = [];
  };

  const getWatchedDocuments = () => {
    return [...watchedDocuments];
  };

  return {
    start,
    stop,
    getWatchedDocuments,
  };
}

/**
 * Setup keyboard input handling for interactive watch mode.
 *
 * @param handlers - Callback handlers for keyboard events
 * @returns A cleanup function to restore stdin state
 */
export function setupKeyboardInput(handlers: {
  onRefresh: () => void;
  onQuit: () => void;
}): () => void {
  // Only setup keyboard handling if stdin is a TTY
  if (!process.stdin.isTTY) {
    return () => {};
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  const handleKeypress = (key: string) => {
    // Handle 'r' for refresh
    if (key === "r" || key === "R") {
      handlers.onRefresh();
      return;
    }

    // Handle 'q' for quit
    if (key === "q" || key === "Q") {
      handlers.onQuit();
      return;
    }

    // Handle Ctrl+C (ASCII code 3)
    if (key === "\u0003") {
      handlers.onQuit();
      return;
    }
  };

  process.stdin.on("data", handleKeypress);

  // Return cleanup function
  return () => {
    process.stdin.removeListener("data", handleKeypress);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  };
}

/**
 * Clear the console screen.
 * Only clears if stdout is a TTY (not piped).
 */
export function clearConsole(): void {
  if (process.stdout.isTTY) {
    // ANSI escape sequence to clear screen and move cursor to top-left
    process.stdout.write("\x1B[2J\x1B[0f");
  }
}
