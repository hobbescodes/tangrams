import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Mock } from "vitest";

// Mock chokidar
vi.mock("chokidar", () => {
  const createMockWatcher = () => ({
    on: vi.fn().mockReturnThis(),
    close: vi.fn().mockResolvedValue(undefined),
  });
  return {
    watch: vi.fn(() => createMockWatcher()),
  };
});

// Mock fast-glob - use implementation that returns fresh array each time
vi.mock("fast-glob", () => ({
  default: vi.fn(() =>
    Promise.resolve(["/path/to/file1.graphql", "/path/to/file2.graphql"]),
  ),
}));

// Import after mocks are set up
import {
  clearConsole,
  createWatcher,
  getGlobBaseDir,
  getWatchDirs,
  setupKeyboardInput,
} from "./watcher";

describe("createWatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a watcher with the correct interface", () => {
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    expect(watcher).toHaveProperty("start");
    expect(watcher).toHaveProperty("stop");
    expect(watcher).toHaveProperty("getWatchedDocuments");
    expect(typeof watcher.start).toBe("function");
    expect(typeof watcher.stop).toBe("function");
    expect(typeof watcher.getWatchedDocuments).toBe("function");
  });

  it("should resolve document patterns on start", async () => {
    const fg = await import("fast-glob");
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: ["**/*.graphql", "**/*.gql"],
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    await watcher.start();

    expect(fg.default).toHaveBeenCalledWith(["**/*.graphql", "**/*.gql"], {
      absolute: true,
      onlyFiles: true,
    });
  });

  it("should return watched documents after start", async () => {
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    await watcher.start();

    const documents = watcher.getWatchedDocuments();
    expect(documents).toEqual([
      "/path/to/file1.graphql",
      "/path/to/file2.graphql",
    ]);
  });

  it("should return empty array before start", () => {
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    const documents = watcher.getWatchedDocuments();
    expect(documents).toEqual([]);
  });

  it("should setup config watcher with correct options", async () => {
    const chokidar = await import("chokidar");
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    await watcher.start();

    expect(chokidar.watch).toHaveBeenCalledWith("/path/to/config.ts", {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });
  });

  it("should setup document watcher with base directories (not glob patterns)", async () => {
    const chokidar = await import("chokidar");
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: ["src/**/*.graphql", "lib/**/*.gql"],
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    await watcher.start();

    // chokidar v4+ doesn't support globs, so we extract base directories
    expect(chokidar.watch).toHaveBeenCalledWith(["src", "lib"], {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });
  });

  it("should call onConfigChange when config file changes (with debounce)", async () => {
    const chokidar = await import("chokidar");

    // Create a mock watcher we can control
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onConfigChange = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange,
      onDocumentChange: vi.fn(),
      debounceMs: 100,
    });

    await watcher.start();

    // Get the change handler that was registered
    const changeHandler = mockWatcher.on.mock.calls.find(
      (call: unknown[]) => call[0] === "change",
    )?.[1];

    expect(changeHandler).toBeDefined();

    // Simulate a file change
    changeHandler();

    // Should not be called immediately due to debounce
    expect(onConfigChange).not.toHaveBeenCalled();

    // Fast-forward past debounce time
    await vi.advanceTimersByTimeAsync(100);

    expect(onConfigChange).toHaveBeenCalledTimes(1);
  });

  it("should debounce multiple rapid changes", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onDocumentChange = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange,
      debounceMs: 100,
    });

    await watcher.start();

    // Get the change handler for documents (second watcher)
    const documentChangeHandler = mockWatcher.on.mock.calls.filter(
      (call: unknown[]) => call[0] === "change",
    )[1]?.[1];

    // Simulate multiple rapid changes with file paths that match the pattern
    documentChangeHandler?.("src/queries.graphql");
    await vi.advanceTimersByTimeAsync(50);
    documentChangeHandler?.("src/mutations.graphql");
    await vi.advanceTimersByTimeAsync(50);
    documentChangeHandler?.("src/subscriptions.graphql");

    // Should still not be called
    expect(onDocumentChange).not.toHaveBeenCalled();

    // Fast-forward past debounce time from last change
    await vi.advanceTimersByTimeAsync(100);

    // Should only be called once despite multiple changes
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
  });

  it("should close watchers on stop", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    await watcher.start();
    await watcher.stop();

    // Should close both watchers (config and documents)
    expect(mockWatcher.close).toHaveBeenCalledTimes(2);
  });

  it("should clear watched documents on stop", async () => {
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    await watcher.start();
    expect(watcher.getWatchedDocuments().length).toBeGreaterThan(0);

    await watcher.stop();
    expect(watcher.getWatchedDocuments()).toEqual([]);
  });

  it("should call onError when watcher encounters an error", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onError = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
      onError,
    });

    await watcher.start();

    // Get the error handler
    const errorHandler = mockWatcher.on.mock.calls.find(
      (call: unknown[]) => call[0] === "error",
    )?.[1];

    // Simulate an error
    const testError = new Error("Test error");
    errorHandler?.(testError);

    expect(onError).toHaveBeenCalledWith(testError);
  });

  it("should convert non-Error objects to Error in onError", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onError = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
      onError,
    });

    await watcher.start();

    // Get the error handler
    const errorHandler = mockWatcher.on.mock.calls.find(
      (call: unknown[]) => call[0] === "error",
    )?.[1];

    // Simulate a string error
    errorHandler?.("string error");

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe("string error");
  });

  it("should use default debounce of 200ms", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onConfigChange = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange,
      onDocumentChange: vi.fn(),
      // Not specifying debounceMs to test default
    });

    await watcher.start();

    const changeHandler = mockWatcher.on.mock.calls.find(
      (call: unknown[]) => call[0] === "change",
    )?.[1];

    changeHandler?.();

    // Should not be called at 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(onConfigChange).not.toHaveBeenCalled();

    // Should be called at 200ms (default)
    await vi.advanceTimersByTimeAsync(100);
    expect(onConfigChange).toHaveBeenCalledTimes(1);
  });

  it("should add new files to watched documents on 'add' event", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onDocumentChange = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange,
      debounceMs: 100,
    });

    await watcher.start();

    // Get the add handler for documents (second watcher)
    const addHandler = mockWatcher.on.mock.calls.filter(
      (call: unknown[]) => call[0] === "add",
    )[0]?.[1];

    // Add a new file that matches the pattern
    addHandler?.("/path/to/new-file.graphql");

    // Should be in watched documents
    expect(watcher.getWatchedDocuments()).toContain(
      "/path/to/new-file.graphql",
    );

    // Debounced document change should be called
    await vi.advanceTimersByTimeAsync(100);
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
  });

  it("should not add duplicate files on 'add' event", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    await watcher.start();

    const initialCount = watcher.getWatchedDocuments().length;

    // Get the add handler
    const addHandler = mockWatcher.on.mock.calls.filter(
      (call: unknown[]) => call[0] === "add",
    )[0]?.[1];

    // Try to add an existing file
    addHandler?.("/path/to/file1.graphql");

    // Should still have the same count
    expect(watcher.getWatchedDocuments().length).toBe(initialCount);
  });

  it("should remove files from watched documents on 'unlink' event", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onDocumentChange = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange,
      debounceMs: 100,
    });

    await watcher.start();

    // Verify file1 is in watched documents
    expect(watcher.getWatchedDocuments()).toContain("/path/to/file1.graphql");

    // Get the unlink handler
    const unlinkHandler = mockWatcher.on.mock.calls.filter(
      (call: unknown[]) => call[0] === "unlink",
    )[0]?.[1];

    // Remove file1
    unlinkHandler?.("/path/to/file1.graphql");

    // Should no longer be in watched documents
    expect(watcher.getWatchedDocuments()).not.toContain(
      "/path/to/file1.graphql",
    );

    // Debounced document change should be called
    await vi.advanceTimersByTimeAsync(100);
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
  });

  it("should ignore files that don't match pattern on 'add' event", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onDocumentChange = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange,
      debounceMs: 100,
    });

    await watcher.start();

    const initialCount = watcher.getWatchedDocuments().length;

    // Get the add handler
    const addHandler = mockWatcher.on.mock.calls.filter(
      (call: unknown[]) => call[0] === "add",
    )[0]?.[1];

    // Try to add a file that doesn't match the pattern
    addHandler?.("/path/to/file.ts");

    // Should not be added
    expect(watcher.getWatchedDocuments().length).toBe(initialCount);

    // Document change should NOT be called
    await vi.advanceTimersByTimeAsync(100);
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("should ignore files that don't match pattern on 'change' event", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onDocumentChange = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange,
      debounceMs: 100,
    });

    await watcher.start();

    // Get the change handler for documents (second watcher)
    const documentChangeHandler = mockWatcher.on.mock.calls.filter(
      (call: unknown[]) => call[0] === "change",
    )[1]?.[1];

    // Try to trigger change for a non-matching file
    documentChangeHandler?.("/path/to/file.ts");

    // Document change should NOT be called
    await vi.advanceTimersByTimeAsync(100);
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("should ignore files that don't match pattern on 'unlink' event", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onDocumentChange = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange,
      debounceMs: 100,
    });

    await watcher.start();

    // Get the unlink handler
    const unlinkHandler = mockWatcher.on.mock.calls.filter(
      (call: unknown[]) => call[0] === "unlink",
    )[0]?.[1];

    // Try to unlink a non-matching file
    unlinkHandler?.("/path/to/file.ts");

    // Document change should NOT be called
    await vi.advanceTimersByTimeAsync(100);
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("should handle error on document watcher", async () => {
    const chokidar = await import("chokidar");
    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (chokidar.watch as Mock).mockReturnValue(mockWatcher);

    const onError = vi.fn();
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
      onError,
    });

    await watcher.start();

    // Get all error handlers (config and document watchers)
    const errorHandlers = mockWatcher.on.mock.calls.filter(
      (call: unknown[]) => call[0] === "error",
    );

    // Second error handler is for document watcher
    const documentErrorHandler = errorHandlers[1]?.[1];

    // Simulate an error
    const testError = new Error("Document watcher error");
    documentErrorHandler?.(testError);

    expect(onError).toHaveBeenCalledWith(testError);
  });

  it("should handle stop when watchers are null", async () => {
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql",
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    // Stop without start should not throw
    await expect(watcher.stop()).resolves.not.toThrow();
  });

  it("should handle single string pattern for documents", async () => {
    const fg = await import("fast-glob");
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: "**/*.graphql", // Single string, not array
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    await watcher.start();

    // Should convert to array internally
    expect(fg.default).toHaveBeenCalledWith(["**/*.graphql"], {
      absolute: true,
      onlyFiles: true,
    });
  });
});

describe("setupKeyboardInput", () => {
  // Note: process.stdin can't be easily mocked in Bun/Vitest since it's a getter.
  // We test basic functionality - the function returns a cleanup function
  // and doesn't throw when called.

  it("should return a cleanup function", () => {
    const cleanup = setupKeyboardInput({
      onRefresh: vi.fn(),
      onQuit: vi.fn(),
    });

    expect(typeof cleanup).toBe("function");
  });

  it("should not throw when cleanup is called", () => {
    const cleanup = setupKeyboardInput({
      onRefresh: vi.fn(),
      onQuit: vi.fn(),
    });

    expect(() => cleanup()).not.toThrow();
  });

  it("should be callable multiple times without error", () => {
    const cleanup = setupKeyboardInput({
      onRefresh: vi.fn(),
      onQuit: vi.fn(),
    });

    // Multiple cleanups should not throw
    expect(() => {
      cleanup();
      cleanup();
    }).not.toThrow();
  });
});

describe("clearConsole", () => {
  // Note: process.stdout can't be easily mocked in Bun/Vitest.
  // We test that the function doesn't throw.

  it("should not throw when called", () => {
    expect(() => clearConsole()).not.toThrow();
  });

  it("should be callable multiple times without error", () => {
    expect(() => {
      clearConsole();
      clearConsole();
    }).not.toThrow();
  });
});

describe("getGlobBaseDir", () => {
  it("should extract base directory from glob pattern with **", () => {
    expect(getGlobBaseDir("./src/graphql/**/*.graphql")).toBe("./src/graphql");
    expect(getGlobBaseDir("src/graphql/**/*.graphql")).toBe("src/graphql");
  });

  it("should extract base directory from glob pattern with *", () => {
    expect(getGlobBaseDir("src/*.ts")).toBe("src");
    expect(getGlobBaseDir("./src/*.ts")).toBe("./src");
  });

  it("should return . for patterns starting with glob characters", () => {
    expect(getGlobBaseDir("**/*.graphql")).toBe(".");
    expect(getGlobBaseDir("*.graphql")).toBe(".");
  });

  it("should handle patterns with nested directories", () => {
    expect(getGlobBaseDir("./src/lib/graphql/**/*.graphql")).toBe(
      "./src/lib/graphql",
    );
  });

  it("should handle patterns with question mark glob", () => {
    expect(getGlobBaseDir("src/?.ts")).toBe("src");
  });

  it("should handle patterns with bracket glob", () => {
    expect(getGlobBaseDir("src/[abc].ts")).toBe("src");
  });

  it("should handle patterns with brace glob", () => {
    expect(getGlobBaseDir("src/{a,b}.ts")).toBe("src");
  });

  it("should handle patterns with no glob characters", () => {
    expect(getGlobBaseDir("src/file.ts")).toBe("src");
  });

  it("should handle patterns with only filename", () => {
    expect(getGlobBaseDir("file.ts")).toBe(".");
  });
});

describe("getWatchDirs", () => {
  it("should extract unique base directories from multiple patterns", () => {
    const patterns = ["src/**/*.graphql", "lib/**/*.gql"];
    const dirs = getWatchDirs(patterns);
    expect(dirs).toEqual(["src", "lib"]);
  });

  it("should deduplicate identical directories", () => {
    const patterns = ["src/**/*.graphql", "src/**/*.gql", "src/*.ts"];
    const dirs = getWatchDirs(patterns);
    expect(dirs).toEqual(["src"]);
  });

  it("should keep different subdirectories as separate entries", () => {
    const patterns = ["src/**/*.graphql", "src/queries/*.graphql"];
    const dirs = getWatchDirs(patterns);
    expect(dirs).toEqual(["src", "src/queries"]);
  });

  it("should handle single pattern", () => {
    const patterns = ["./src/graphql/**/*.graphql"];
    const dirs = getWatchDirs(patterns);
    expect(dirs).toEqual(["./src/graphql"]);
  });

  it("should handle patterns with different base dirs", () => {
    const patterns = [
      "./src/graphql/**/*.graphql",
      "./lib/queries/**/*.gql",
      "**/*.graphql",
    ];
    const dirs = getWatchDirs(patterns);
    expect(dirs).toEqual(["./src/graphql", "./lib/queries", "."]);
  });
});
