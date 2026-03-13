# PRD: Variable Substitution & Authentication Support

## 1. Problem Statement

AgentEye currently hardcodes all test data (credentials, URLs, form values) directly in YAML test scripts. This creates several problems:

1. **Security Risk** — Sensitive credentials are committed to version control in plain text
2. **Inflexibility** — Cannot reuse the same test script across environments (staging, production)
3. **Auth-Gated Pages** — The crawler cannot access pages behind authentication, limiting test coverage
4. **No Shared Login** — Each test scenario starts with a fresh browser session, requiring login steps to be duplicated across every scenario

## 2. Goals

- Allow users to externalize sensitive data (credentials, API keys) from YAML test scripts
- Enable the same test scripts to run across multiple environments with different configurations
- Support testing of auth-gated pages by providing authentication mechanisms for both the crawler and test runner
- Reduce test setup overhead by allowing a shared login flow

## 3. Non-Goals

- Integration with external secret managers (Vault, AWS Secrets Manager, etc.) — future enhancement
- OAuth/OIDC flow automation — users should handle this externally and pass resulting tokens/cookies
- Data-driven testing with CSV/Excel datasets — future enhancement

## 4. User Stories

### US-1: Variable Substitution
**As a** test author,
**I want to** use placeholders like `${{EMAIL}}` in my YAML test scripts,
**so that** I can keep credentials out of version control and reuse scripts across environments.

### US-2: CLI Variable Override
**As a** CI/CD engineer,
**I want to** pass variables via CLI flags (`--var EMAIL=ci@test.com`) or `.env` files,
**so that** I can inject environment-specific values at runtime.

### US-3: MCP Variable Pass-through
**As an** AI Agent,
**I want to** pass variables when invoking `agenteye_run` via MCP,
**so that** I can dynamically configure test credentials.

### US-4: beforeAll Login Flow
**As a** test author,
**I want to** define a `beforeAll` section in my test plan that logs in once,
**so that** all subsequent test scenarios share the authenticated session without duplicating login steps.

### US-5: Authenticated Crawling
**As a** test author,
**I want to** inject cookies or HTTP headers when crawling,
**so that** the crawler can discover pages behind authentication.

## 5. Feature Specifications

### 5.1 Variable Substitution

**Syntax:** `${{VARIABLE_NAME}}` in any `step:` or `expect:` string.

**Variable Sources (precedence, highest first):**
1. CLI `--var KEY=VALUE` flags
2. `process.env` (only for keys already defined in lower-priority sources)
3. `.env` file (via `--env-file` flag)
4. YAML `vars:` section (in test plan or script)

**YAML Example:**
```yaml
vars:
  EMAIL: "default@example.com"
  PASSWORD: "defaultPass"
steps:
  - step: "type ${{EMAIL}} into Email"
  - step: "type ${{PASSWORD}} into Password"
```

**CLI Override:**
```bash
agenteye run --var EMAIL=real@test.com --var PASSWORD=secret
agenteye run --env-file .env.staging
```

**Behavior for undefined variables:** Left as-is (no substitution, no error). This allows gradual adoption.

### 5.2 beforeAll Login Flow

**YAML Syntax:**
```yaml
target: "https://myapp.com"
vars:
  EMAIL: "test@example.com"
  PASSWORD: "TestPass123"
beforeAll:
  - step: "navigate to https://myapp.com/login"
  - step: "type ${{EMAIL}} into Email"
  - step: "type ${{PASSWORD}} into Password"
  - step: "click Login"
  - step: "wait 2 s"
pages:
  - url: "https://myapp.com/dashboard"
    scenarios:
      - name: "Dashboard Test"
        steps:
          - expect: "show Dashboard"
```

**Behavior:**
- `beforeAll` steps execute once before all scenarios
- A shared browser context is created and reused across all scenarios
- Cookies/session from `beforeAll` persist throughout the test run
- If `beforeAll` is absent, behavior is unchanged (each scenario gets its own fresh context)

### 5.3 Authenticated Crawling

**CLI Syntax:**
```bash
agenteye plan https://myapp.com --cookie "session=abc123@myapp.com" --header "Authorization:Bearer token123"
```

**MCP Syntax:**
```json
{
  "tool": "agenteye_plan",
  "arguments": {
    "url": "https://myapp.com",
    "cookies": [{"name": "session", "value": "abc123", "domain": "myapp.com"}],
    "headers": {"Authorization": "Bearer token123"}
  }
}
```

**Behavior:**
- Cookies are injected into every browser context the crawler creates
- HTTP headers are set on every request the crawler makes
- These only affect the crawling phase, not the test execution phase (test execution uses `beforeAll` for auth)

## 6. Affected Components

| Component | Changes |
|-----------|---------|
| `packages/core/src/utils/variables.ts` | New — variable resolution and interpolation |
| `packages/core/src/types/plan.ts` | Add `vars`, `beforeAll` to `TestPlan`; add `vars` to `ScenarioPlan` |
| `packages/core/src/types/config.ts` | Add `vars`, `envFile` to `AgentEyeConfig` |
| `packages/core/src/runner/runner.ts` | Variable interpolation in steps, `beforeAll` execution, shared context |
| `packages/core/src/crawler/crawler.ts` | Cookie/header injection in `crawlPage` |
| `packages/cli/src/commands/run.ts` | `--var`, `--env-file` flags |
| `packages/cli/src/commands/plan.ts` | `--cookie`, `--header` flags |
| `packages/mcp-server/src/index.ts` | `vars`/`env_file` on `agenteye_run`; `cookies`/`headers` on `agenteye_plan` |

## 7. Success Metrics

- Users can run the same test script across staging/production by only changing `--var` flags
- No credentials appear in committed YAML files (validated via `.env` + `--var` usage)
- Crawler can discover at least the same number of pages as manual browsing when given valid auth cookies
- Test execution time decreases when using `beforeAll` (login runs once instead of N times)
