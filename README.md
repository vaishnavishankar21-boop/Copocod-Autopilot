<div align="center">

# 🚀 Copado Nexus

**Enterprise-grade, browserless Salesforce DevOps orchestration for AI-first IDEs**

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.x-purple)](https://modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/Tests-Vitest%20Passing-brightgreen)](tests/)
[![Hackathon Ready](https://img.shields.io/badge/Status-Hackathon%20Ready-orange)](#)

</div>

---

## 📖 Overview

**Copado Nexus** eliminates the browser entirely from the Salesforce DevOps lifecycle. It wraps the Copado CI/CD, Robotic Testing, and AI platform APIs into a unified, secure, terminal-native developer experience — and bridges it to AI coding assistants via the **Model Context Protocol (MCP)**.

Instead of clicking through the Copado UI, developers and AI agents can:

- ✅ Commit metadata changes from the terminal
- ✅ Trigger and monitor Copado Robotic Testing (CRT) suites
- ✅ Promote and deploy User Stories to any environment
- ✅ Delegate tasks to 5 specialized Copado AI agents (`plan`, `build`, `test`, `release`, `operate`)
- ✅ Do all of the above safely, with hardcoded human-in-the-loop guardrails for UAT and Production

---

## 📋 Table of Contents

- [The Problem](#-the-problem)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [CLI Usage](#-cli-usage)
- [API Reference](#-api-reference)
- [MCP Server & Tools](#-mcp-server--tools)
- [Security & Guardrails](#-security--guardrails)
- [Testing](#-testing)
- [Project Structure](#-project-structure)
- [Troubleshooting](#-troubleshooting)

---

## ❗ The Problem

Salesforce DevOps through Copado traditionally requires constant context-switching to a web browser, manual navigation across multiple UI pages, and unsafe credential handling. When AI assistants are introduced into this workflow, new risks emerge:

| Problem | Impact |
|---|---|
| Browser-bound workflows | High developer overhead, slow iteration |
| Credentials stored in plaintext | Security vulnerabilities |
| No AI-native Copado integration | Manual repetitive processes |
| Unguarded AI deployments | Risk of code reaching Production without human sign-off |

**Copado Nexus solves all of these.**

---

## 🏗 Architecture

Copado Nexus is organized into three tightly coupled layers:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Human Operator (You)                         │
│              Reviews, approves UAT/PROD gates in IDE chat           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ Approval Codes / Confirmations
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│              AI Agent  (Google Antigravity / Claude / Cursor)       │
│        Reads context, invokes MCP tools, surfaces results to user   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ JSON-RPC over stdio
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   MCP Server  (src/mcp/server.ts)                   │
│    Exposes CLI subcommands as semantic tools to the LLM agent.      │
│    Enforces human-approval gates for UAT/PROD before execution.     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ subprocess execSync --json
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 CLI Engine  (copado-hx / src/cli/index.ts)          │
│  ┌──────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ .copado-context  │  │  OS Keychain    │  │  API Client     │   │
│  │      .json       │  │  (keytar)       │  │  src/api/       │   │
│  │ State Tracking   │  │  Secure Token   │  │  client.ts      │   │
│  └──────────────────┘  └─────────────────┘  └────────┬────────┘   │
└───────────────────────────────────────────────────────┼────────────┘
                                                        │ HTTP / Bearer Auth
                            ┌───────────────────────────┼────────────────────────┐
                            ▼                           ▼                        ▼
              ┌─────────────────────┐   ┌──────────────────────┐  ┌───────────────────┐
              │    Agentia Pro      │   │   Agentia Testing    │  │  Agentia AI Hub   │
              │  CI/CD Actions API  │   │  Robotic Testing API │  │  AI Agents API    │
              │  api.copado.com     │   │  pace.robotic.copado │  │  copadogpt-api    │
              └─────────────────────┘   └──────────────────────┘  └───────────────────┘
                            │                           │                        │
                            └───────────────────────────┴────────────────────────┘
                                          │  (Offline Fallback)
                                          ▼
                              ┌─────────────────────┐
                              │   Mock Gateway      │
                              │  (simulateNetwork)  │
                              └─────────────────────┘
```

### Three Core Layers

| Layer | File(s) | Responsibility |
|---|---|---|
| **Local CLI** | `src/cli/index.ts` | Command parsing, state management, credential access |
| **MCP Server** | `src/mcp/server.ts` | Translates CLI subcommands into JSON-RPC tool schemas for LLMs |
| **Guardrails** | `SKILL.md` | Operational playbooks and non-negotiable safety rules for AI agents |

---

## ⚙️ Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | v18+ | Runtime environment |
| **TypeScript** | 5.x | Type-safe codebase |
| **Commander.js** | 12.x | CLI argument parsing |
| **@modelcontextprotocol/sdk** | 1.x | MCP server (JSON-RPC stdio transport) |
| **keytar** | 7.x | OS keychain integration for secure token storage |
| **tsx** | 4.x | TypeScript execution in development |
| **Vitest** | 1.x | Unit and integration testing |

---

## ✅ Prerequisites

Before installing, ensure you have:

- **Node.js** `v18.x` or higher — [Download here](https://nodejs.org/en/download)
- **npm** `v8+` (included with Node.js)
- **OS Keychain Access**:
  - Windows: Windows Credential Manager (automatic)
  - macOS: macOS Keychain (automatic)
  - Linux: `libsecret` (`sudo apt-get install libsecret-1-dev`)

---

## 🛠 Installation & Setup

### Step 1 — Clone the Repository

```bash
git clone https://github.com/your-org/Copocod-Autopilot.git
cd Copocod-Autopilot
```

### Step 2 — Install Dependencies

```bash
npm install
```

### Step 3 — Build the Project

Compiles TypeScript source to JavaScript inside `dist/`:

```bash
npm run build
```

### Step 4 — Authenticate with Copado

Store your Copado API token securely in the OS Keychain:

```bash
# Using the compiled binary:
npx tsx src/cli/index.ts auth login --token <your-copado-api-token>

# Or with the built binary:
./dist/cli/index.js auth login --token <your-copado-api-token>
```

> **Note**: The token is encrypted and stored in the OS Keychain under the service `copado-nexus`. It is never written to disk or logged.

Verify authentication:

```bash
npx tsx src/cli/index.ts auth status --json
# Expected output: { "authenticated": true, "user": "developer@copado.com" }
```

### Step 5 (Optional) — Set Up MCP Integration

To make Copado Nexus available to AI agents in Claude Desktop:

**`%APPDATA%\Claude\claude_desktop_config.json`** (Windows):

```json
{
  "mcpServers": {
    "copado-nexus": {
      "command": "node",
      "args": ["d:/Hackathon/Copocod-Autopilot/dist/mcp/server.js"],
      "env": {
        "CI": "true"
      }
    }
  }
}
```

For **Cursor**: Go to Settings → Models → MCP → `+ Add New MCP Server`:
- **Name**: `copado-nexus`
- **Type**: `stdio`
- **Command**: `node d:/Hackathon/Copocod-Autopilot/dist/mcp/server.js`

For **Google Antigravity**: Add to your `mcp_config.json`:

```json
{
  "mcpServers": {
    "copado-nexus": {
      "command": "node",
      "args": ["d:/Hackathon/Copocod-Autopilot/dist/mcp/server.js"]
    }
  }
}
```

---

## 💻 CLI Usage

All commands support a `--json` flag for machine-readable structured output.

### Authentication

```bash
# Save API token to OS Keychain
copado-hx auth login --token <token>

# Check current authentication status
copado-hx auth status --json
```

### User Story Context

```bash
# Set the active User Story (persists to .copado-context.json)
copado-hx story set --id US-2026

# View active context
copado-hx story show --json

# List all available stories in the pipeline
copado-hx story list --json
```

### Metadata Commits

```bash
# Commit all staged changes for the active User Story
copado-hx commit --message "feat: add lead scoring validation"

# Override User Story context inline
copado-hx commit --message "fix: null pointer in LeadScoring.cls" --us US-1234
```

### Environment Promotions & Deployments

```bash
# Promote the active story to SIT (no approval required)
copado-hx promote --env SIT --json

# Run a validation-only deployment to UAT (no actual deploy)
copado-hx promote --env UAT --validate --json

# Full promotion to UAT — triggers human-approval gate
copado-hx promote --env UAT --json
# ⛔ Returns HUMAN_APPROVAL_REQUIRED with a one-time approval code

# Confirm the promotion using the code returned above
copado-hx promote --env UAT --confirm --json

# Deploy to an environment
copado-hx deploy --env PROD --json
```

### Robotic Testing (CRT)

```bash
# Trigger a CRT test suite by Job ID
copado-hx test run --job JOB-SMOKE-2026 --json

# Poll status of a test execution
copado-hx test status --execution EXEC-2026 --json

# Poll continuously until completion
copado-hx test status --execution EXEC-2026 --watch --json

# Retrieve final test results
copado-hx test results --execution EXEC-2026 --json

# List all available test suites/jobs
copado-hx test list --json
```

### Job Status

```bash
# Get status of the last tracked pipeline job
copado-hx status --json

# Get status of a specific job execution
copado-hx status --job JOB-2026 --json

# Watch until job completes
copado-hx status --job JOB-2026 --watch --json
```

### AI Agents

```bash
# Ask the Build Agent what metadata files changed
copado-hx ai ask --agent build "What metadata files changed in US-2026?" --json

# Ask the Test Agent to generate a CRT test script
copado-hx ai ask --agent test "Generate a CRT script for LeadScoring.cls" --json

# Ask the Release Agent for deployment risk assessment
copado-hx ai ask --agent release "Analyze deployment risk for US-2026 to UAT" --json
```

**Available Agents:**

| Agent | When to Use |
|---|---|
| `plan` | User story refinement, conflict detection, sprint planning |
| `build` | Code generation, metadata analysis, Apex coverage |
| `test` | CRT script generation, test automation advice |
| `release` | Deployment coordination, job error analysis, release notes |
| `operate` | Post-release documentation, monitoring, change management |

---

## 🌐 API Reference

Copado Nexus connects to three Copado platform APIs:

### Agentia Pro — CI/CD Actions REST API

Base URL: `https://api.copado.com/v1`

| Endpoint | Method | Purpose |
|---|---|---|
| `/actions/commit` | POST | Commits Salesforce metadata for a User Story |
| `/actions/promote` | POST | Promotes a User Story to the next environment |
| `/actions/validate` | POST | Runs a validation-only deployment |
| `/actions/revert` | POST | Reverts a prior deployment |
| `/job-executions/:id` | GET | Polls the status of a pipeline job |

**Authentication**: `Authorization: Bearer <token>`

**Request Example — Commit:**
```json
POST /v1/actions/commit
{
  "userStoryId": "US-2026",
  "message": "feat: add lead scoring validation"
}
```

**Response Example:**
```json
{
  "commitId": "COMMIT-8924",
  "status": "Completed Successfully",
  "filesCommitted": ["LeadScoring.cls", "LeadScoringTest.cls"]
}
```

---

### Agentia Testing — Robotic Testing Open API

Base URL: `https://pace.robotic.copado.com/pace/v4`

| Endpoint | Method | Purpose |
|---|---|---|
| `/projects/:projectId/jobs/:jobId/builds` | POST | Triggers a CRT test suite execution |
| `/projects/:projectId/jobs/:jobId/builds/:buildId` | GET | Polls test execution status |
| `/projects/:projectId/jobs/:jobId/builds/:buildId/results` | GET | Retrieves final test results |

**Authentication**: `Authorization: Bearer <token>`

**Response Status Values:**

| Status | Meaning | Action |
|---|---|---|
| `In Progress` | Test still running | Poll again in 10s |
| `Succeeded` | All tests passed | Proceed to deployment |
| `Failed` | Tests failed | Stop, surface to human |

---

### Agentia AI Context Hub — Dialogue API

Base URL: `https://copadogpt-api.robotic.copado.com` (configurable via `COPADO_BASE_URL`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/organizations/:orgId/dialogue` | POST | Opens a new AI dialogue session |
| `/organizations/:orgId/dialogues/:id/messages` | POST | Sends a prompt to a specialist AI agent |

**Authentication**: `X-Authorization: <token>`

**Configurable Environment Variables:**

| Variable | Default | Description |
|---|---|---|
| `COPADO_BASE_URL` | `https://copadogpt-api.robotic.copado.com` | AI Hub region URL |
| `COPADO_ORG_ID` | `1` | Your Copado organization ID |
| `COPADO_CONTEXT_FILE` | `.copado-context.json` | Override context file path |

---

### Offline Mock Mode

If no live API token is set (or a mock token like `mock-token-123` is used), all API calls are automatically routed through the `simulateNetwork` mock gateway in `src/api/mockGateway.ts`. This ensures the tool works completely offline for demos and testing.

---

## 🤖 MCP Server & Tools

The MCP server exposes all CLI capabilities as semantic tools to LLM agents via the Model Context Protocol (JSON-RPC over stdio).

### Available MCP Tools

| Tool Name | Required Arguments | Description |
|---|---|---|
| `copado_auth_login` | `{ token: string }` | Save API token to OS Keychain |
| `copado_auth_status` | `{}` | Check authentication status |
| `copado_story_set` | `{ id: string }` | Activate a User Story context |
| `copado_story_list` | `{}` | List all available User Stories |
| `copado_story_show` | `{}` | Show currently active User Story |
| `copado_commit` | `{ message: string, us?: string }` | Commit metadata for active story |
| `copado_promote` | `{ env: string, validate?: boolean }` | Promote story to an environment |
| `copado_deploy` | `{ env: string }` | Deploy story to an environment |
| `copado_approve_action` | `{ token: string }` | Confirm a human-gated UAT/PROD action |
| `copado_test_run` | `{ jobId?: string, suiteId?: string }` | Trigger a CRT test run |
| `copado_test_status` | `{ executionId: string, watch?: boolean }` | Poll test execution status |
| `copado_test_results` | `{ executionId: string }` | Retrieve test results |
| `copado_test_list` | `{}` | List all available test suites |
| `copado_status` | `{ job?: string, watch?: boolean }` | Get pipeline job status |
| `copado_ai_ask` | `{ agent: enum, prompt: string }` | Send prompt to a Copado AI agent |

> **Tip:** All tools automatically include structured JSON output. The AI agent parses this to determine next steps without requiring any string parsing.

---

## 🔐 Security & Guardrails

### Token Security
- API tokens are **never** stored in files, environment variables, or shell history.
- The `keytar` library reads from and writes to the OS native credential vault.
- Tokens are only loaded in memory at the moment of an API call and are immediately discarded.

### Human-in-the-Loop Approval Gates

Deploying to sensitive environments requires **explicit human confirmation**:

```
1. AI calls copado_promote / copado_deploy with env: "UAT" or "PROD"
         │
         ▼
2. MCP Server intercepts → generates one-time approval code (e.g. "A3BX9Z")
         │
         ▼
3. AI STOPS and displays to developer:
   "⛔ To authorize UAT promotion, please type this code: A3BX9Z"
         │
         ▼
4. Developer manually types the code in the chat
         │
         ▼
5. AI calls copado_approve_action with the exact code
         │
         ▼
6. MCP Server validates code → executes the deployment
```

> **Critical**: A prior instruction like *"if tests pass, deploy to UAT"* does **NOT** count as approval. The AI must receive a live, in-chat response at the time of deployment.

### AI Guardrail Rules (from `SKILL.md`)

- 🚫 Never deploy to PROD or UAT without a live human approval code
- 🚫 Never fabricate User Story IDs, pipeline IDs, or environment names
- 🚫 Never auto-retry failed tests — always surface failures to the human
- 🚫 Never store or log API tokens in any output or file
- 🚫 Never chain more than 3 destructive actions without a human checkpoint

---

## 🧪 Testing

Run the full integration test suite using Vitest:

```bash
npm run test
```

The test suite validates:
- Authentication flows
- User Story context management
- Commit, promote, and deploy operations
- CRT test run triggering and status polling
- UAT/PROD human approval gates
- AI agent dialogue routing
- Progressive status simulation (In Progress → Completed)

---

## 📁 Project Structure

```
Copocod-Autopilot/
│
├── src/
│   ├── cli/
│   │   └── index.ts          # CLI entry point & all command definitions
│   │
│   ├── mcp/
│   │   └── server.ts         # MCP server — JSON-RPC tool schemas & routing
│   │
│   ├── api/
│   │   ├── client.ts         # Copado API client (live + mock fallback)
│   │   ├── mockCopado.ts     # Mock API responses for offline use
│   │   ├── mockGateway.ts    # Network delay simulator
│   │   └── types.ts          # Shared TypeScript interface definitions
│   │
│   └── utils/
│       ├── context.ts        # Local state read/write (.copado-context.json)
│       └── keychain.ts       # OS keychain token management (keytar)
│
├── tests/
│   └── integration/          # Vitest integration test suite
│
├── dist/                     # Compiled JavaScript output (after npm run build)
│
├── .copado-context.json      # Auto-generated local workspace state file
├── .copado-mcp.log           # MCP server diagnostic log
├── SKILL.md                  # AI agent operational playbook & guardrails
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔥 Live Demo Workflow

To demonstrate the full DevOps lifecycle end-to-end, run these commands in sequence:

```bash
# 1. Authenticate
npx tsx src/cli/index.ts auth login --token mock-token-123 --json

# 2. Set active User Story
npx tsx src/cli/index.ts story set --id US-2026 --json

# 3. Ask Build Agent what changed
npx tsx src/cli/index.ts ai ask --agent build "What metadata files changed?" --json
# → Returns: ['LeadScoring.cls']

# 4. Ask Test Agent to generate a CRT script
npx tsx src/cli/index.ts ai ask --agent test "Generate a CRT script for LeadScoring.cls" --json
# → Returns Job ID: JOB-SMOKE-2026

# 5. Run the robotic test suite
npx tsx src/cli/index.ts test run --job JOB-SMOKE-2026 --json

# 6. Poll until tests pass (run 3 times to simulate progression)
npx tsx src/cli/index.ts status --json  # → In Progress
npx tsx src/cli/index.ts status --json  # → In Progress
npx tsx src/cli/index.ts status --json  # → Completed Successfully

# 7. Promote to UAT — triggers human-approval gate
npx tsx src/cli/index.ts promote --env UAT --json
# → ⛔ HUMAN_APPROVAL_REQUIRED: "Please type approval code: XXXXXXXX"

# 8. Confirm (CI mode bypass for demo)
$env:CI="true"
npx tsx src/cli/index.ts promote --env UAT --confirm --json
# → ✅ Promotion initiated successfully
```

---

## 🧩 Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| `keytar` install failure | Missing native build tools | Install `windows-build-tools` or `python3` + `node-gyp` |
| `Not authenticated` error | No token in keychain | Run `copado-hx auth login --token <your-token>` |
| MCP server not visible in IDE | Build not compiled | Run `npm run build` first |
| `stdout corrupted` in MCP | Stray `console.log` in code | Use only `console.error` for diagnostics in MCP context |
| Context not persisting | Wrong working directory | Run CLI from the repo root where `.copado-context.json` lives |
| `HUMAN_APPROVAL_REQUIRED` loop | Missing `--confirm` flag in CI mode | Set `CI=true` and pass `--confirm` flag |

---

## 📄 License

Distributed under the [MIT License](LICENSE).

---

<div align="center">

**Built for CopadoCon Hackathon 2026** · Powered by Node.js, TypeScript, and MCP

</div>
