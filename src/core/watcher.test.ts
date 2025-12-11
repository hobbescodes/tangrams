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
import { clearConsole, createWatcher, setupKeyboardInput } from "./watcher";

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

  it("should setup document watcher with glob patterns", async () => {
    const chokidar = await import("chokidar");
    const watcher = createWatcher({
      configPath: "/path/to/config.ts",
      documentPatterns: ["src/**/*.graphql", "lib/**/*.gql"],
      onConfigChange: vi.fn(),
      onDocumentChange: vi.fn(),
    });

    await watcher.start();

    expect(chokidar.watch).toHaveBeenCalledWith(
      ["src/**/*.graphql", "lib/**/*.gql"],
      {
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      },
    );
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

    // Simulate multiple rapid changes
    documentChangeHandler?.();
    await vi.advanceTimersByTimeAsync(50);
    documentChangeHandler?.();
    await vi.advanceTimersByTimeAsync(50);
    documentChangeHandler?.();

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
