import { readFileSync, existsSync } from 'node:fs';

export interface VariableSources {
  /** Variables defined in YAML vars: section */
  yamlVars?: Record<string, string>;
  /** Path to .env file */
  envFile?: string;
  /** Variables from CLI --var flags */
  cliVars?: Record<string, string>;
}

/**
 * Parse a .env file into key-value pairs.
 * Supports: KEY=VALUE, KEY="VALUE", KEY='VALUE', # comments, empty lines
 */
function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, 'utf-8');
  const vars: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }

  return vars;
}

/**
 * Resolve variables from multiple sources with precedence:
 * CLI --var > process.env > .env file > YAML vars: section
 */
export function resolveVariables(sources: VariableSources): Record<string, string> {
  const vars: Record<string, string> = {};

  // Lowest priority: YAML vars
  if (sources.yamlVars) {
    Object.assign(vars, sources.yamlVars);
  }

  // .env file
  if (sources.envFile) {
    Object.assign(vars, parseEnvFile(sources.envFile));
  }

  // process.env (only override keys already defined, to avoid leaking entire env)
  for (const key of Object.keys(vars)) {
    if (process.env[key] !== undefined) {
      vars[key] = process.env[key]!;
    }
  }

  // Highest priority: CLI vars
  if (sources.cliVars) {
    Object.assign(vars, sources.cliVars);
  }

  return vars;
}

/**
 * Replace ${{VAR_NAME}} placeholders in text with resolved values.
 * Unknown variables are left as-is.
 */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\$\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}
