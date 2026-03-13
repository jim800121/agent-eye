# TDD: Variable Substitution & Authentication Support

## 1. Overview

This document describes the technical design for adding variable substitution, `beforeAll` login flows, and authenticated crawling to AgentEye. Refer to the [PRD](./PRD-variables-and-auth.md) for product requirements.

## 2. Architecture

```
                     CLI / MCP Server
                           |
                   --var / vars param
                           |
                    ┌──────▼──────┐
                    │ AgentEyeConfig │
                    │  .vars       │
                    │  .envFile    │
                    └──────┬──────┘
                           |
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌─────▼─────┐
        │  Runner    │ │Crawler │ │  Planner  │
        │            │ │        │ │(unchanged)│
        │ resolveVars│ │cookies │ └───────────┘
        │ interpolate│ │headers │
        │ beforeAll  │ └────────┘
        └────────────┘
```

## 3. Component Design

### 3.1 Variable Resolution Module

**File:** `packages/core/src/utils/variables.ts`

```typescript
export interface VariableSources {
  yamlVars?: Record<string, string>;   // from YAML vars: section
  envFile?: string;                     // path to .env file
  cliVars?: Record<string, string>;    // from CLI --var flags
}

export function resolveVariables(sources: VariableSources): Record<string, string>;
export function interpolate(text: string, vars: Record<string, string>): string;
```

#### resolveVariables

Merges variables from multiple sources with clear precedence:

1. Start with `yamlVars` (lowest priority)
2. Overlay values from `.env` file (parsed with built-in parser, no `dotenv` dependency)
3. For each key already present, check `process.env` and override if set
4. Overlay `cliVars` (highest priority)

**Design Decision:** `process.env` only overrides keys that are already defined in lower-priority sources. This prevents leaking the entire environment into the variable namespace.

#### interpolate

Simple regex-based replacement: `/\$\{\{(\w+)\}\}/g`

- Matches `${{WORD_CHARS}}`
- Unknown variables are left as-is (returns the original `${{KEY}}` string)
- No recursive interpolation (a variable's value cannot contain `${{...}}` references)

#### .env Parser

Built-in, minimal implementation:
- Supports `KEY=VALUE`, `KEY="VALUE"`, `KEY='VALUE'`
- Skips empty lines and `#` comments
- Splits on first `=` only (values can contain `=`)
- Strips surrounding quotes (single or double)
- No multiline value support (keep it simple for v1)

### 3.2 Type Changes

**File:** `packages/core/src/types/plan.ts`

```typescript
export interface TestPlan {
  // ... existing fields
  vars?: Record<string, string>;      // NEW: plan-level variables
  beforeAll?: StepPlan[];              // NEW: pre-test setup steps
  pages: PagePlan[];
}

export interface ScenarioPlan {
  name: string;
  description?: string;
  vars?: Record<string, string>;      // NEW: scenario-level variables
  steps: StepPlan[];
}
```

**File:** `packages/core/src/types/config.ts`

```typescript
export interface AgentEyeConfig {
  // ... existing fields
  vars?: Record<string, string>;      // NEW: CLI-provided variables
  envFile?: string;                    // NEW: .env file path
}
```

### 3.3 Runner Changes

**File:** `packages/core/src/runner/runner.ts`

#### New Instance Field

```typescript
private vars: Record<string, string> = {};
```

Populated at the start of `runPlan()` / `runScript()` via `resolveVariables()`.

#### interpolateStep Helper

```typescript
private interpolateStep(stepPlan: StepPlan): StepPlan {
  return {
    step: stepPlan.step ? interpolate(stepPlan.step, this.vars) : undefined,
    expect: stepPlan.expect ? interpolate(stepPlan.expect, this.vars) : undefined,
  };
}
```

Called in `runScenario()` before each step is parsed/executed. This approach is non-invasive: interpolation happens on the text before it reaches `parseStep()` / `parseExpect()`, so all existing regex patterns work without modification.

#### beforeAll Execution

In `runPlan()`:

1. Call `resolveVariables()` to merge all variable sources
2. If `plan.beforeAll` exists and has steps:
   - Create a shared `IDriverContext`
   - Execute each `beforeAll` step (with interpolation) using the existing `executeStep` / `executeExpect` methods
   - Keep the context alive
3. Pass `sharedContext` to each `runScenario()` call
4. Close `sharedContext` after all scenarios complete

#### runScenario Signature Change

```typescript
private async runScenario(
  scenario: ScenarioPlan,
  pageUrl: string,
  existingContext?: IDriverContext,  // NEW optional parameter
): Promise<TestResult>
```

- If `existingContext` is provided, use it (and do NOT close it at the end)
- If not provided, create a new context (and close it at the end, as before)

### 3.4 Crawler Changes

**File:** `packages/core/src/crawler/crawler.ts`

#### Extended Options

```typescript
export interface CrawlerCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
}

export interface CrawlerOptions {
  // ... existing fields
  cookies?: CrawlerCookie[];
  headers?: Record<string, string>;
}
```

#### crawlPage Modification

```typescript
private async crawlPage(url: string): Promise<CrawledPage> {
  const context = await this.browser!.newContext({
    extraHTTPHeaders: this.options.headers,
  });
  if (this.options.cookies?.length) {
    await context.addCookies(this.options.cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
    })));
  }
  const page = await context.newPage();
  // ... rest unchanged
}
```

Both `newContext({ extraHTTPHeaders })` and `context.addCookies()` are native Playwright APIs — no additional dependencies required.

### 3.5 CLI Changes

**File:** `packages/cli/src/commands/run.ts`

New options:
```
--var <KEY=VALUE>     Set variables (can be used multiple times)
--env-file <path>    Path to .env file for variable substitution
```

`--var` values are parsed into a `Record<string, string>` and passed to `AgentEyeConfig.vars`.

**File:** `packages/cli/src/commands/plan.ts`

New options:
```
--cookie <name=value@domain>   Inject cookies (can be used multiple times)
--header <name:value>          Inject HTTP headers (can be used multiple times)
```

Cookie format: `name=value@domain` (split on last `@` for domain, first `=` for name/value).
Header format: `name:value` (split on first `:`).

### 3.6 MCP Server Changes

**File:** `packages/mcp-server/src/index.ts`

`agenteye_run` tool — new parameters:
```typescript
vars: z.record(z.string()).optional()
env_file: z.string().optional()
```

`agenteye_plan` tool — new parameters:
```typescript
cookies: z.array(z.object({ name, value, domain })).optional()
headers: z.record(z.string()).optional()
```

## 4. Data Flow

### Variable Resolution Flow

```
YAML vars:        { EMAIL: "default@test.com" }
  ↓ (lowest)
.env file:        EMAIL=staging@test.com
  ↓
process.env:      EMAIL=ci@test.com (only if key exists in lower layers)
  ↓
CLI --var:        EMAIL=override@test.com
  ↓ (highest)
Final vars:       { EMAIL: "override@test.com" }
  ↓
interpolate("type ${{EMAIL}} into email")
  ↓
"type override@test.com into email"
  ↓
parseStep() → { type: 'fill', target: 'email', value: 'override@test.com' }
```

### beforeAll Flow

```
runPlan()
  ├── resolveVariables()
  ├── createDriver()
  ├── plan.beforeAll?
  │     ├── newContext() → sharedContext
  │     ├── for each beforeAll step:
  │     │     interpolateStep() → executeStep()
  │     └── (context stays open with auth cookies)
  ├── for each page/scenario:
  │     runScenario(scenario, url, sharedContext)
  │       ├── newPage() on sharedContext  ← reuses cookies
  │       ├── execute steps
  │       └── (does NOT close context)
  ├── sharedContext.close()
  └── driver.close()
```

## 5. Security Considerations

- **No credential logging:** Variable values are never logged. Only variable names appear in debug output.
- **process.env scoping:** Only variables already defined in YAML or .env are looked up in `process.env`. This prevents accidentally exposing unrelated environment variables.
- **.env in .gitignore:** Documentation recommends adding `.env` to `.gitignore`.
- **Cookie scope:** Crawler cookies are domain-scoped. The `domain` field is required to prevent cookies from being sent to unintended hosts.

## 6. Files Modified

| File | Type | Description |
|------|------|-------------|
| `packages/core/src/utils/variables.ts` | New | Variable resolution and interpolation |
| `packages/core/src/types/plan.ts` | Modified | Add `vars`, `beforeAll` fields |
| `packages/core/src/types/config.ts` | Modified | Add `vars`, `envFile` fields |
| `packages/core/src/runner/runner.ts` | Modified | Variable interpolation, beforeAll, shared context |
| `packages/core/src/crawler/crawler.ts` | Modified | Cookie/header injection |
| `packages/core/src/crawler/index.ts` | Modified | Export `CrawlerCookie` type |
| `packages/core/src/index.ts` | Modified | Export variables utilities |
| `packages/cli/src/commands/run.ts` | Modified | `--var`, `--env-file` options |
| `packages/cli/src/commands/plan.ts` | Modified | `--cookie`, `--header` options |
| `packages/mcp-server/src/index.ts` | Modified | `vars`/`cookies`/`headers` params |
| `examples/basic-web-test/scripts/login-test.yaml` | Modified | Use `${{}}` syntax |

## 7. Testing Strategy

### Unit Tests

- **`variables.test.ts`** — Test `resolveVariables` precedence, `interpolate` replacement, `.env` parsing
- **`runner.test.ts`** — Test that `${{VAR}}` in steps gets interpolated before parsing
- **Existing tests** — Must continue to pass (no breaking changes)

### Integration Tests

- Run a test plan with `vars:` + `--var` override, verify correct values are used
- Run a test plan with `beforeAll` login steps, verify shared context across scenarios
- Crawl a page with `--cookie` injection, verify cookies are sent in requests

### Manual Verification

```bash
# Variable substitution
agenteye run -s examples/basic-web-test/scripts/login-test.yaml \
  --var EMAIL=test@real.com --var PASSWORD=realpass

# beforeAll login
agenteye run -p plan-with-beforeall.yaml --var EMAIL=test@real.com

# Authenticated crawling
agenteye plan https://myapp.com --cookie "session=abc@myapp.com"
```

## 8. Future Enhancements (Out of Scope)

- `--login-script` for crawler (run a YAML login script to obtain cookies automatically)
- Data-driven testing with CSV/JSON data sources
- Secret manager integrations (Vault, AWS SSM)
- Per-scenario `beforeEach` hooks
- Recursive variable interpolation (`${{BASE_URL}}` inside another variable's value)
