# AgentEye

**AI Agent 的眼睛** — 自動化 UI 測試框架，專為 AI Agent 設計。

AgentEye 自動測試你的 Web / iOS / Android UI，在發現問題時截圖並產生結構化 JSON 報告，讓你的 AI Agent 能直接讀取、分析並修復 Bug，形成完整的閉環工作流程。

## Features

- **自動爬取** — 輸入 URL，自動爬取網站並產生測試計畫
- **自然語言步驟** — 用中文或英文撰寫測試步驟，無需學習特殊語法
- **跨平台** — 支援 Web（Playwright）、iOS / Android（Appium + WebDriverIO）
- **結構化報告** — JSON 格式報告 + 自動截圖，專為 AI Agent 消費設計
- **雙介面** — CLI 工具 + MCP Server，人類和 AI Agent 都能使用
- **零 AI 依賴** — 框架本身不綁定任何 AI API，你可以用任何 AI Agent 來分析報告

## Quick Start

### 安裝

```bash
npm install -g agenteye
```

### 30 秒體驗

```bash
# 初始化專案
agenteye init

# 爬取網站並產生測試計畫
agenteye plan https://your-app.com

# 執行測試
agenteye run
```

測試完成後，結構化報告會輸出到 `.agenteye/reports/` 目錄。

## Usage

### CLI

#### `agenteye init`

初始化 AgentEye 設定，在目前目錄建立 `.agenteye/` 結構。

```bash
agenteye init
```

#### `agenteye plan [url]`

爬取目標網站並自動產生 YAML 測試計畫。

```bash
# Web — 自動爬取
agenteye plan https://your-app.com
agenteye plan https://your-app.com -d 5          # 爬取深度 5
agenteye plan https://your-app.com -e "/admin/*"  # 排除 admin 路徑

# Mobile — 產生骨架計畫
agenteye plan --platform ios --app-name "MyApp"
agenteye plan --platform android --app-name "MyApp"
```

產生的 YAML 可以手動編輯，加入 `skip: true` 跳過不需要的頁面。

#### `agenteye run`

執行測試。

```bash
# 執行測試計畫
agenteye run
agenteye run --headed                # 顯示瀏覽器視窗
agenteye run -p ./custom-plan.yaml   # 指定計畫路徑

# 執行單一腳本
agenteye run -s ./scripts/login-test.yaml

# Mobile 測試
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

查看測試報告。

```bash
agenteye report          # 最新報告
agenteye report abc123   # 指定 run ID
```

### YAML 測試腳本

用自然語言撰寫測試步驟：

```yaml
name: "登入流程測試"
steps:
  - step: 打開 https://your-app.com/login
  - step: 在 Email 欄位 輸入 test@example.com
  - step: 在 密碼 欄位 輸入 MyPassword123
  - step: 點擊 登入
    expect: 頁面導向 /dashboard
  - expect: 顯示 歡迎
```

**支援的步驟語法：**

| 動作 | 中文 | English |
|------|------|---------|
| 導航 | `打開 <url>` / `前往 <url>` | `navigate to <url>` / `open <url>` |
| 點擊 | `點擊 <target>` / `按下 <target>` | `click <target>` / `tap <target>` |
| 輸入 | `在 <field> 欄位 輸入 <value>` | `type <value> into <field>` |
| 等待 | `等待 <n> 秒` | `wait <n> s` |
| 滑動 | `滑動 上/下/左/右` | `swipe up/down/left/right` |
| 長按 | `長按 <target>` | `long press <target>` |
| 切換 | `切換到 原生/網頁` | `switch to native/webview` |

**支援的斷言語法：**

| 斷言 | 中文 | English |
|------|------|---------|
| URL | `頁面導向 <url>` | `redirect to <url>` |
| 文字 | `顯示 <text>` / `包含 <text>` | `show <text>` / `contain <text>` |

### MCP Server

AgentEye 提供 MCP Server，讓 AI Agent（如 Claude）可以直接調用測試工具。

#### 設定

在你的 MCP 設定中加入：

```json
{
  "mcpServers": {
    "agenteye": {
      "command": "agenteye-mcp"
    }
  }
}
```

#### 可用工具

| 工具 | 說明 |
|------|------|
| `agenteye_plan` | 爬取網站或為 Mobile App 產生測試計畫 |
| `agenteye_edit_plan` | 修改測試計畫（跳過/恢復頁面） |
| `agenteye_run` | 執行 UI 測試（Web / iOS / Android） |
| `agenteye_report` | 取得測試報告 |
| `agenteye_screenshot` | 取得截圖（base64） |
| `agenteye_list_runs` | 列出歷史測試紀錄 |

#### AI Agent 工作流程範例

```
AI Agent                        AgentEye
   |                               |
   |-- agenteye_plan(url) -------->|  自動爬取 + 產生測試計畫
   |<-- YAML 測試計畫 -------------|
   |                               |
   |-- agenteye_run() ------------>|  執行 UI 測試
   |<-- JSON 結構化報告 -----------|  (含截圖路徑)
   |                               |
   |-- agenteye_screenshot(path) ->|  取得失敗截圖
   |<-- base64 圖片 ---------------|
   |                               |
   |-- 分析報告 + 截圖 ----------->|  AI 自行判斷問題
   |-- 修改程式碼 ---------------->|  AI 自行修復
   |-- agenteye_run() ------------>|  驗證修復結果
```

## Mobile Testing

### 前置條件

Mobile 測試需要額外安裝：

```bash
# 安裝 WebDriverIO（AgentEye 的 optional dependency）
npm install webdriverio

# 安裝 Appium
npm install -g appium

# iOS
appium driver install xcuitest
# 需要 Xcode + iOS Simulator

# Android
appium driver install uiautomator2
# 需要 Android Studio + Emulator
```

### 執行 Mobile 測試

```bash
# 1. 啟動 Appium Server（另一個終端）
appium

# 2. 執行測試
agenteye run --platform ios --app ./MyApp.app --device "iPhone 15" --bundle-id com.example.app
```

Web 使用者不需要安裝任何 mobile 相關套件，WebDriverIO 是 optional dependency。

## Report Format

AgentEye 產生的 JSON 報告結構如下，專為 AI Agent 設計：

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
      "test_name": "登入流程測試",
      "page_url": "https://your-app.com/login",
      "status": "failed",
      "duration_ms": 3000,
      "steps": [
        {
          "step": "點擊 登入",
          "status": "failed",
          "severity": "critical",
          "description": "步驟執行失敗: Timeout 30000ms exceeded",
          "screenshot_full": ".agenteye/reports/run_.../screenshots/step3_full.png",
          "console_errors": [],
          "network_errors": [],
          "reproduction_steps": ["打開 https://your-app.com/login", "點擊 登入"]
        }
      ]
    }
  ]
}
```

## Project Structure

```
packages/
  core/          # @agenteye/core — 核心引擎
    src/
      crawler/      # 網站爬蟲
      planner/      # 測試計畫產生器
      runner/       # 測試執行器
      reporter/     # 報告產生器
      collector/    # Console/Network 錯誤收集器
      screenshotter/# 截圖器
      driver/       # Driver 抽象層 (Playwright + Appium)
      types/        # TypeScript 型別定義
  cli/           # agenteye — CLI 工具
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

# Dev（watch mode）
npm run test -- --watch
```

## License

MIT
