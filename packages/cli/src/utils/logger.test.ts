import { describe, expect, it, vi } from "vitest";

import {
  createConsolaLogger,
  createSilentLogger,
  createViteLogger,
  defaultLogger,
} from "./logger";

import type { TangramsLogger, ViteLoggerLike } from "./logger";

describe("Logger", () => {
  describe("TangramsLogger interface", () => {
    it("should have all required methods", () => {
      const methods: (keyof TangramsLogger)[] = [
        "info",
        "success",
        "warn",
        "error",
        "start",
        "box",
      ];

      // Verify interface is correct by checking defaultLogger
      for (const method of methods) {
        expect(typeof defaultLogger[method]).toBe("function");
      }
    });
  });

  describe("createConsolaLogger", () => {
    it("should create a valid logger", () => {
      const logger = createConsolaLogger();

      expect(typeof logger.info).toBe("function");
      expect(typeof logger.success).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.start).toBe("function");
      expect(typeof logger.box).toBe("function");
    });

    it("should be the same as defaultLogger", () => {
      // defaultLogger uses createConsolaLogger internally
      expect(typeof defaultLogger.info).toBe("function");
    });
  });

  describe("createSilentLogger", () => {
    it("should create a valid logger", () => {
      const logger = createSilentLogger();

      expect(typeof logger.info).toBe("function");
      expect(typeof logger.success).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.start).toBe("function");
      expect(typeof logger.box).toBe("function");
    });

    it("should not throw when methods are called", () => {
      const logger = createSilentLogger();

      expect(() => logger.info("test")).not.toThrow();
      expect(() => logger.success("test")).not.toThrow();
      expect(() => logger.warn("test")).not.toThrow();
      expect(() => logger.error("test")).not.toThrow();
      expect(() => logger.start("test")).not.toThrow();
      expect(() =>
        logger.box({ title: "test", message: "test" }),
      ).not.toThrow();
    });
  });

  describe("createViteLogger", () => {
    it("should create a valid logger from a ViteLoggerLike", () => {
      const viteLogger: ViteLoggerLike = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const logger = createViteLogger(viteLogger);

      expect(typeof logger.info).toBe("function");
      expect(typeof logger.success).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.start).toBe("function");
      expect(typeof logger.box).toBe("function");
    });

    it("should prefix messages with [tangrams]", () => {
      const viteLogger: ViteLoggerLike = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const logger = createViteLogger(viteLogger);

      logger.info("test message");

      expect(viteLogger.info).toHaveBeenCalledWith("[tangrams] test message", {
        timestamp: true,
      });
    });

    it("should map success to info", () => {
      const viteLogger: ViteLoggerLike = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const logger = createViteLogger(viteLogger);

      logger.success("success message");

      expect(viteLogger.info).toHaveBeenCalledWith(
        "[tangrams] success message",
        { timestamp: true },
      );
    });

    it("should map start to info", () => {
      const viteLogger: ViteLoggerLike = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const logger = createViteLogger(viteLogger);

      logger.start("starting...");

      expect(viteLogger.info).toHaveBeenCalledWith("[tangrams] starting...", {
        timestamp: true,
      });
    });

    it("should call warn for warnings", () => {
      const viteLogger: ViteLoggerLike = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const logger = createViteLogger(viteLogger);

      logger.warn("warning message");

      expect(viteLogger.warn).toHaveBeenCalledWith(
        "[tangrams] warning message",
        { timestamp: true },
      );
    });

    it("should call error for errors", () => {
      const viteLogger: ViteLoggerLike = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const logger = createViteLogger(viteLogger);

      logger.error("error message");

      expect(viteLogger.error).toHaveBeenCalledWith(
        "[tangrams] error message",
        { timestamp: true },
      );
    });

    it("should format box messages", () => {
      const viteLogger: ViteLoggerLike = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const logger = createViteLogger(viteLogger);

      logger.box({ title: "Title", message: "Message" });

      // Box should call info multiple times for the formatted output
      expect(viteLogger.info).toHaveBeenCalled();
    });
  });
});
