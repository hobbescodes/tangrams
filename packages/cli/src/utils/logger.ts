import consola from "consola";

/**
 * Logger abstraction for tangrams
 *
 * Allows swapping between different logging implementations:
 * - consola (CLI) - Rich terminal output with colors and icons
 * - Vite logger (plugin) - Integration with Vite's logging system
 * - Silent logger (testing) - No-op for tests or silent mode
 */
export interface TangramsLogger {
  /** Log an informational message */
  info(message: string): void;
  /** Log a success message */
  success(message: string): void;
  /** Log a warning message */
  warn(message: string): void;
  /** Log an error message */
  error(message: string): void;
  /** Log a "starting" message */
  start(message: string): void;
  /** Log a boxed message (for summaries) */
  box(options: { title: string; message: string }): void;
}

/**
 * Create a logger that uses consola for rich terminal output.
 * This is the default logger used by the CLI.
 */
export function createConsolaLogger(): TangramsLogger {
  return {
    info: (message) => consola.info(message),
    success: (message) => consola.success(message),
    warn: (message) => consola.warn(message),
    error: (message) => consola.error(message),
    start: (message) => consola.start(message),
    box: (options) => consola.box(options),
  };
}

/**
 * Vite logger interface (subset of what Vite provides)
 * We define this here to avoid importing Vite in the main bundle
 */
export interface ViteLoggerLike {
  info(msg: string, options?: { timestamp?: boolean }): void;
  warn(msg: string, options?: { timestamp?: boolean }): void;
  error(msg: string, options?: { timestamp?: boolean }): void;
}

/**
 * Create a logger that integrates with Vite's logging system.
 * All messages are prefixed with [tangrams] for easy identification.
 */
export function createViteLogger(viteLogger: ViteLoggerLike): TangramsLogger {
  const prefix = "[tangrams]";

  return {
    info: (message) =>
      viteLogger.info(`${prefix} ${message}`, { timestamp: true }),
    success: (message) =>
      viteLogger.info(`${prefix} ${message}`, { timestamp: true }),
    warn: (message) =>
      viteLogger.warn(`${prefix} ${message}`, { timestamp: true }),
    error: (message) =>
      viteLogger.error(`${prefix} ${message}`, { timestamp: true }),
    start: (message) =>
      viteLogger.info(`${prefix} ${message}`, { timestamp: true }),
    box: (options) => {
      // Vite doesn't have a box method, so we format it nicely
      const border = "─".repeat(
        Math.max(options.title.length, options.message.length) + 4,
      );
      viteLogger.info(`${prefix} ┌${border}┐`, { timestamp: true });
      viteLogger.info(
        `${prefix} │ ${options.title.padEnd(border.length - 2)} │`,
        { timestamp: true },
      );
      viteLogger.info(`${prefix} ├${border}┤`, { timestamp: true });
      for (const line of options.message.split("\n")) {
        viteLogger.info(`${prefix} │ ${line.padEnd(border.length - 2)} │`, {
          timestamp: true,
        });
      }
      viteLogger.info(`${prefix} └${border}┘`, { timestamp: true });
    },
  };
}

/**
 * Create a silent logger that does nothing.
 * Useful for testing or when output should be suppressed.
 */
export function createSilentLogger(): TangramsLogger {
  const noop = () => {};
  return {
    info: noop,
    success: noop,
    warn: noop,
    error: noop,
    start: noop,
    box: noop,
  };
}

/**
 * Default logger instance using consola.
 * Used when no logger is explicitly provided.
 */
export const defaultLogger = createConsolaLogger();
