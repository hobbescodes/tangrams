/**
 * URL utilities for environment variable template support
 *
 * Supports templates like "${API_URL}" or "${API_URL}/graphql" that are
 * transformed to process.env references in generated client code.
 */

/**
 * Regex pattern for valid env var names in templates.
 * Must start with letter or underscore, followed by letters, numbers, or underscores.
 * Case-insensitive to support both uppercase and lowercase conventions.
 */
const ENV_VAR_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Check if a string contains any env var templates
 */
export function hasEnvVarTemplate(value: string): boolean {
  // Reset lastIndex since we're using a global regex
  ENV_VAR_PATTERN.lastIndex = 0;
  return ENV_VAR_PATTERN.test(value);
}

/**
 * Validate that all ${...} patterns in the string are valid env var names.
 * Returns an error message if invalid, or null if valid.
 */
export function validateEnvVarTemplates(value: string): string | null {
  // Find all ${...} patterns (including potentially invalid ones)
  const allTemplates = value.match(/\$\{[^}]*\}/g) || [];

  for (const template of allTemplates) {
    // Check if it matches the valid pattern
    if (!/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(template)) {
      const inner = template.slice(2, -1);
      return (
        `Invalid environment variable name "${inner}" in template. ` +
        `Must start with a letter or underscore and contain only letters, numbers, and underscores.`
      );
    }
  }

  return null;
}

/**
 * Transform env var templates to process.env references.
 * "${VAR}" -> "${process.env.VAR}"
 */
export function transformEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, "${process.env.$1}");
}

/**
 * Format a URL value for use in generated client code.
 * - If it contains env var templates: returns a template literal with process.env references
 * - Otherwise: returns a quoted string literal
 *
 * @example
 * formatUrlForClient("https://api.example.com") // '"https://api.example.com"'
 * formatUrlForClient("${API_URL}") // '`${process.env.API_URL}`'
 * formatUrlForClient("${API_URL}/graphql") // '`${process.env.API_URL}/graphql`'
 */
export function formatUrlForClient(value: string): string {
  if (hasEnvVarTemplate(value)) {
    return `\`${transformEnvVars(value)}\``;
  }
  return `"${value}"`;
}
