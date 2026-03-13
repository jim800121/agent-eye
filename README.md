# AgentEye

**Eyes for your AI Agent** — An automated UI testing framework designed for AI Agents.

AgentEye automatically tests your Web / iOS / Android UI, takes screenshots when issues are found, and generates structured JSON reports that your AI Agent can directly read, analyze, and use to fix bugs — forming a complete closed-loop workflow.

## Features

- **Auto Crawl** — Provide a URL, automatically crawl the site and generate a test plan
- **Natural Language Steps** — Write test steps in plain language, no special syntax required
- **Cross-Platform** — Supports Web (Playwright), iOS / Android (Appium + WebDriverIO)
- **Structured Reports** — JSON reports + automatic screenshots, designed for AI Agent consumption
- **Dual Interface** — CLI tool + MCP Server, usable by both humans and AI Agents
- **Zero AI Dependency** — The framework itself doesn't depend on any AI API; use any AI Agent to analyze reports

## Quick Start

### Installation

```bash
npm install -g agenteye
```

### 30-Second Demo

```bash
# Initialize project
agenteye init

# Crawl website and generate test plan
agenteye plan https://your-app.com

# Run tests
agenteye run
```

After tests complete, structured reports are output to the `.agenteye/reports/` directory.

## Usage

### CLI

#### `agenteye init`

Initialize AgentEye configuration, creating the `.agenteye/` directory structure in the current directory.

```bash
agenteye init
```

#### `agenteye plan [url]`

Crawl the target website and automatically generate a YAML test plan.

```bash
# Web — auto crawl
agenteye plan https://your-app.com
agenteye plan https://your-app.com -d 5          # Crawl depth 5
agenteye plan https://your-app.com -e "/admin/*"  # Exclude admin paths

# Mobile — generate skeleton plan
agenteye plan --platform ios --app-name "MyApp"
agenteye plan --platform android --app-name "MyApp"
```

The generated YAML can be manually edited. Add `skip: true` to skip pages you don't need.

#### `agenteye run`

Run tests.

```bash
# Run test plan
agenteye run
agenteye run --headed                # Show browser window
agenteye run -p ./custom-plan.yaml   # Specify plan path

# Run a single script
agenteye run -s ./scripts/login-test.yaml

# Mobile tests
agenteye run --platform ios \
  --app ./MyApp.app \
  --device "iPhone 15" \
  --bundle-id com.example.myapp \
  --platform-version "17.0"

agenteye run --platform android \
  --app ./my-app.apk \
  --device "Pixel 7" \
  --app-package com.example.myapp \
  --app-activity .MainActivity \
  --platform-version "14"
```

#### `agenteye report [run_id]`

View test reports.

```bash
agenteye report          # Latest report
agenteye report abc123   # Specific run ID
```

### YAML Test Scripts

Write test steps in natural language:

```yaml
name: "Login Flow Test"
steps:
  - step: navigate to https://your-app.com/login
  - step: type test@example.com into Email
  - step: type MyPassword123 into Password
  - step: click Login
    expect: redirect to /dashboard
  - expect: show Welcome
```

**Supported Step Syntax:**

| Action | Syntax |
|--------|--------|
| Navigate | `navigate to <url>` / `open <url>` |
| Click | `click <target>` / `tap <target>` |
| Type | `type <value> into <field>` |
| Wait | `wait <n> s` |
| Swipe | `swipe up/down/left/right` |
| Long Press | `long press <target>` |
| Switch Context | `switch to native/webview` |

**Supported Assertion Syntax:**

| Assertion | Syntax |
|-----------|--------|
| URL | `redirect to <url>` |
| Text | `show <text>` / `contain <text>` |

### MCP Server

AgentEye provides an MCP Server so AI Agents (e.g., Claude) can directly invoke testing tools.

#### Configuration

Add the following to your MCP configuration:

```json
{
  "mcpServers": {
    "agenteye": {
      "command": "agenteye-mcp"
    }
  }
}
```

#### Available Tools

| Tool | Description |
|------|-------------|
| `agenteye_plan` | Crawl a website or generate a test plan for a mobile app |
| `agenteye_edit_plan` | Edit test plan (skip/restore pages) |
| `agenteye_run` | Run UI tests (Web / iOS / Android) |
| `agenteye_report` | Retrieve test reports |
| `agenteye_screenshot` | Retrieve screenshots (base64) |
| `agenteye_list_runs` | List historical test runs |

#### AI Agent Workflow Example

```
AI Agent                        AgentEye
   |                               |
   |-- agenteye_plan(url) -------->|  Auto crawl + generate test plan
   |<-- YAML test plan ------------|
   |                               |
   |-- agenteye_run() ------------>|  Run UI tests
   |<-- JSON structured report ----|  (with screenshot paths)
   |                               |
   |-- agenteye_screenshot(path) ->|  Get failure screenshots
   |<-- base64 image --------------|
   |                               |
   |-- Analyze report + images --->|  AI identifies issues
   |-- Modify source code -------->|  AI fixes bugs
   |-- agenteye_run() ------------>|  Verify the fix
```

## Mobile Testing

### Prerequisites

Mobile testing requires additional setup:

```bash
# Install WebDriverIO (optional dependency of AgentEye)
npm install webdriverio

# Install Appium
npm install -g appium

# iOS
appium driver install xcuitest
# Requires Xcode + iOS Simulator

# Android
appium driver install uiautomator2
# Requires Android Studio + Emulator
```

### Running Mobile Tests

```bash
# 1. Start Appium Server (in a separate terminal)
appium

# 2. Run tests
agenteye run --platform ios --app ./MyApp.app --device "iPhone 15" --bundle-id com.example.app
```

Web users don't need to install any mobile-related packages — WebDriverIO is an optional dependency.

## Report Format

AgentEye generates JSON reports with the following structure, designed for AI Agent consumption:

```json
{
  "test_run_id": "run_20240101_120000_abc",
  "target": "https://your-app.com",
  "platform": "web",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "duration_ms": 15000,
  "summary": {
    "total": 5,
    "passed": 4,
    "failed": 1,
    "warning": 0
  },
  "results": [
    {
      "test_name": "Login Flow Test",
      "page_url": "https://your-app.com/login",
      "status": "failed",
      "duration_ms": 3000,
      "steps": [
        {
          "step": "click Login",
          "status": "failed",
          "severity": "critical",
          "description": "Step execution failed: Timeout 30000ms exceeded",
          "screenshot_full": ".agenteye/reports/run_.../screenshots/step3_full.png",
          "console_errors": [],
          "network_errors": [],
          "reproduction_steps": ["navigate to https://your-app.com/login", "click Login"]
        }
      ]
    }
  ]
}
```

## Project Structure

```
packages/
  core/          # @agenteye/core — Core engine
    src/
      crawler/      # Website crawler
      planner/      # Test plan generator
      runner/       # Test runner
      reporter/     # Report generator
      collector/    # Console/Network error collector
      screenshotter/# Screenshot capture
      driver/       # Driver abstraction layer (Playwright + Appium)
      types/        # TypeScript type definitions
  cli/           # agenteye — CLI tool
  mcp-server/    # @agenteye/mcp-server — MCP Server
```

## Development

```bash
# Clone
git clone https://github.com/jim800121/agent-eye.git
cd agent-eye

# Install
npm install

# Build
npm run build

# Test
npm test

# Dev (watch mode)
npm run test -- --watch
```

## License

MIT
