// Vitest setup file

import { afterEach, vi } from "vitest";

// Reset mocks after each test
afterEach(() => {
  vi.restoreAllMocks();
});
