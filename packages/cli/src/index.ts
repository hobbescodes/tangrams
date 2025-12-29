// Public API for tangrams

// =============================================================================
// Config Helpers
// =============================================================================

export { defineConfig } from "./core/config";

// =============================================================================
// Programmatic Generation
// =============================================================================

export { generate } from "./core/generator";

// =============================================================================
// Config Loading (for advanced usage)
// =============================================================================

export { configSchema, loadTangramsConfig } from "./core/config";

// =============================================================================
// Logger Utilities (for custom integrations)
// =============================================================================

export {
  createConsolaLogger,
  createSilentLogger,
  createViteLogger,
} from "./utils/logger";

// =============================================================================
// Types
// =============================================================================

export type {
  CollectionOverrideConfig,
  // DB overrides
  DbOverridesConfig,
  // Form overrides
  FormOverridesConfig,
  FormValidator,
  GeneratesConfig,
  GraphQLSourceConfig,
  InfiniteQueryOverrideConfig,
  OpenAPISourceConfig,
  OverridesConfig,
  PredicateMappingPreset,
  // Query overrides
  QueryOverridesConfig,
  SourceConfig,
  SyncMode,
  // Config types
  TangramsConfig,
  TangramsConfigInput,
  ValidationLogicConfig,
  ValidatorLibrary,
} from "./core/config";
export type { GenerateOptions, GenerateResult } from "./core/generator";
export type { TangramsLogger } from "./utils/logger";
