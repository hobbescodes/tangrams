/* biome-ignore-all lint/style/noUnusedTemplateLiteral: Test file contains expected output with template literals */
import { describe, expect, it } from "vitest";

import {
  formatUrlForClient,
  hasEnvVarTemplate,
  transformEnvVars,
  validateEnvVarTemplates,
} from "./url";

describe("hasEnvVarTemplate", () => {
  it("returns false for plain URLs", () => {
    expect(hasEnvVarTemplate("https://api.example.com")).toBe(false);
    expect(hasEnvVarTemplate("http://localhost:3000")).toBe(false);
    expect(hasEnvVarTemplate("/api/graphql")).toBe(false);
  });

  it("returns true for single env var", () => {
    expect(hasEnvVarTemplate("${API_URL}")).toBe(true);
    expect(hasEnvVarTemplate("${api_url}")).toBe(true);
    expect(hasEnvVarTemplate("${_PRIVATE_VAR}")).toBe(true);
  });

  it("returns true for env var with path", () => {
    expect(hasEnvVarTemplate("${API_URL}/graphql")).toBe(true);
    expect(hasEnvVarTemplate("https://${HOST}/api")).toBe(true);
  });

  it("returns true for multiple env vars", () => {
    expect(hasEnvVarTemplate("${PROTOCOL}://${HOST}:${PORT}")).toBe(true);
  });
});

describe("validateEnvVarTemplates", () => {
  it("returns null for valid env var names", () => {
    expect(validateEnvVarTemplates("${API_URL}")).toBeNull();
    expect(validateEnvVarTemplates("${api_url}")).toBeNull();
    expect(validateEnvVarTemplates("${_PRIVATE}")).toBeNull();
    expect(validateEnvVarTemplates("${VAR123}")).toBeNull();
    expect(validateEnvVarTemplates("${API_URL}/graphql")).toBeNull();
    expect(validateEnvVarTemplates("${HOST}:${PORT}")).toBeNull();
  });

  it("returns null for plain strings without templates", () => {
    expect(validateEnvVarTemplates("https://api.example.com")).toBeNull();
    expect(validateEnvVarTemplates("localhost:3000")).toBeNull();
  });

  it("returns error for invalid env var names", () => {
    // Starting with number
    expect(validateEnvVarTemplates("${123VAR}")).toContain("Invalid");
    expect(validateEnvVarTemplates("${1API}")).toContain("Invalid");

    // Contains invalid characters
    expect(validateEnvVarTemplates("${API-URL}")).toContain("Invalid");
    expect(validateEnvVarTemplates("${API.URL}")).toContain("Invalid");
    expect(validateEnvVarTemplates("${API URL}")).toContain("Invalid");

    // Empty
    expect(validateEnvVarTemplates("${}")).toContain("Invalid");
  });

  it("returns error message with the invalid name", () => {
    const result = validateEnvVarTemplates("${123INVALID}");
    expect(result).toContain("123INVALID");
    expect(result).toContain("Must start with a letter or underscore");
  });
});

describe("transformEnvVars", () => {
  it("transforms single env var", () => {
    expect(transformEnvVars("${API_URL}")).toBe("${process.env.API_URL}");
  });

  it("transforms env var with path", () => {
    expect(transformEnvVars("${API_URL}/graphql")).toBe(
      "${process.env.API_URL}/graphql",
    );
  });

  it("transforms env var in middle of URL", () => {
    expect(transformEnvVars("https://${HOST}/api")).toBe(
      "https://${process.env.HOST}/api",
    );
  });

  it("transforms multiple env vars", () => {
    expect(transformEnvVars("${PROTOCOL}://${HOST}:${PORT}")).toBe(
      "${process.env.PROTOCOL}://${process.env.HOST}:${process.env.PORT}",
    );
  });

  it("preserves strings without env vars", () => {
    expect(transformEnvVars("https://api.example.com")).toBe(
      "https://api.example.com",
    );
  });
});

describe("formatUrlForClient", () => {
  it("returns quoted string for plain URLs", () => {
    expect(formatUrlForClient("https://api.example.com")).toBe(
      '"https://api.example.com"',
    );
    expect(formatUrlForClient("http://localhost:3000")).toBe(
      '"http://localhost:3000"',
    );
  });

  it("returns template literal for single env var", () => {
    expect(formatUrlForClient("${API_URL}")).toBe("`${process.env.API_URL}`");
  });

  it("returns template literal for env var with path", () => {
    expect(formatUrlForClient("${API_URL}/graphql")).toBe(
      "`${process.env.API_URL}/graphql`",
    );
  });

  it("returns template literal for multiple env vars", () => {
    expect(formatUrlForClient("${PROTOCOL}://${HOST}")).toBe(
      "`${process.env.PROTOCOL}://${process.env.HOST}`",
    );
  });

  it("handles complex URL patterns", () => {
    expect(formatUrlForClient("https://${API_HOST}:${API_PORT}/v1")).toBe(
      "`https://${process.env.API_HOST}:${process.env.API_PORT}/v1`",
    );
  });
});
