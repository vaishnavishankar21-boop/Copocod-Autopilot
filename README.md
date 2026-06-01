# Copado AutoPilot

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Vitest Passing](https://img.shields.io/badge/Tests-Vitest%20Passed-brightgreen)](tests/integration/integration/workflow.test.ts)

**Copado AutoPilot** is a secure, browserless, enterprise-grade Salesforce DevOps orchestration layer designed to embed natively within AI-first IDE environments (like Google Antigravity or Cursor). It bridges the gap between raw terminal execution and autonomous AI reasoning by seamlessly combining three modules into a single production-ready system.

---

## 🏗️ The 3 Core Technical Pillars

Our solution replaces clicking around the Copado browser UI by splitting the architecture into three tightly integrated layers:

### 1. The Local Execution Layer: `copado-hx` CLI
This is the lightweight command-line interface running on the developer's local machine.
*   **State-Aware Workspace**: It manages a local hidden `.copado-context.json` file to track variables like `userStoryId`, `pipelineId`, and `lastJobExecutionId`. Every subsequent command implicitly reads this file so users never have to type options like `--id US-1234` repeatedly.
*   **Strict Security Compliance**: It outlaws plaintext credential files, interacting instead with the computer's native OS Keychain (via the `keytar` library) to securely handle Copado platform tokens.
*   **Deterministic Errors**: It enforces strict validation gates, instantly surfacing clean error states if a user attempts to run commands designed for Source Format Pipelines on unsupported legacy Metadata environments.

### 2. The AI Communication Layer: The MCP Server
An external AI reasoning engine cannot organically understand how to interact with an operating system terminal. We built a native **Model Context Protocol (MCP) Server** running over standard input/output (`stdio`).
*   This server maps the underlying `copado-hx` subcommands into semantic JSON-RPC tool schemas (`copado_story_set`, `copado_commit`, `copado_test_run`, `copado_ai_ask`).
*   When connected to Google Antigravity, the LLM parses these schemas and gains the native ability to programmatically fire off your CLI tools on demand.

### 3. The Guardrails and Rules Layer: `SKILL.md`
This is the operational blueprint that teaches the AI assistant how to act as a reliable DevOps operator without hallucinating or taking dangerous actions.
*   **The Workflow Playbooks**: It provides step-by-step instructions teaching the LLM how to orchestrate multi-agent handoffs—such as channeling metadata summaries from the Build Agent directly into custom test scripts via the Test Agent.
*   **Enterprise Approval Gates**: It embeds a hardcoded, non-negotiable instruction loop forcing the AI to halt completely and ask for explicit human confirmation before ever calling promotion or deployment routes bound for critical environments like UAT or Production.

---

## 🔄 The Final Demo Workflow (What the Judges Will See)

When presenting at CopadoCon, the team opens Google Antigravity next to a completely closed browser tab. The entire DevOps lifecycle is handled via a single natural-language dialogue stream:

```text
Plaintext Developer Types:
 💬 "My Apex changes for lead scoring are complete. Run the tests and push it UAT."
                        │
                        ▼
 Google Antigravity spawns an Autonomous Agent Loop:
 🤖 1. Reads local context -> [US-2026] found via 'copado-hx story show --json'
 🤖 2. Asks Build Agent -> "What metadata files changed?" -> ['LeadScoring.cls']
 🤖 3. Asks Test Agent -> "Generate a CRT script for LeadScoring.cls"
 🤖 4. Executes Test -> Runs 'copado-hx test run --job <jobId>'
 🤖 5. Evaluates Quality Gate -> Polls test completion status natively
                        │
                        ▼
 🛑 CRITICAL ENTERPRISE GUARDRAIL TRIGGERED:
 🤖 Agent Halts: "All robotic smoke tests passed perfectly. 
                  Please confirm to proceed with UAT Source Format Pipeline validation. (Y/N)"
                        │
                        ▼
 Developer Types:
 💬 "Y" -> Agent fires 'copado-hx promote --env UAT' and prints the success logs inline.
```

---

## 🛠️ CLI Commands Reference

### Authentication Commands
*   `copado-hx auth login [--token <token>]`: Securely saves your Copado API token in the OS Keychain.
*   `copado-hx auth status`: Returns current authentication status.
    *   *JSON Output:* `{ "authenticated": true, "user": "developer@copado.com" }`

### Story & Release Commands
*   `copado-hx story set --id <storyId>`: Configures and persists the active Salesforce User Story.
*   `copado-hx story show`: Displays the active context parameters.
*   `copado-hx commit --message <message>`: Commits metadata changes scoped to the active story.
*   `copado-hx promote --env <env> [--validate] [--confirm]`: Promotes the story to the target environment.
*   `copado-hx deploy --env <env> [--confirm]`: Deploys the story (UAT/PROD require confirmation).

### Testing & AI Commands
*   `copado-hx test run --job <jobId>`: Triggers a Copado Robotic Testing (CRT) run.
*   `copado-hx ai ask --agent <agent> --prompt "<prompt>"`: Invokes one of the 5 specialized Copado AI Agents (`plan`, `build`, `test`, `release`, `operate`).
*   `copado-hx status [--watch]`: Evaluates the status of the last triggered deployment or test execution.

---

## 🔌 Native MCP Server Wrapper Tools

The native Model Context Protocol (MCP) server exposes CLI workflows as semantic tools to your LLM assistant:

| Tool Name | Arguments | Description |
| :--- | :--- | :--- |
| `copado_story_set` | `id` (string) | Activates a story context locally. |
| `copado_commit` | `message` (string) | Commits changes for the active story. |
| `copado_test_run` | `jobId` (string) | Triggers a Copado Robotic Test. |
| `copado_ai_ask` | `agent`, `prompt` | Submits prompt to a specialist AI Agent. |

---

## 🚀 Development & Testing Guide

### Installation
Install the project dependencies:
```bash
npm install
```

### Build CLI & Server
Compile TypeScript modules into production targets inside the `dist/` directory:
```bash
npm run build
```

### Run Integration Tests
Execute our comprehensive Vitest suite verifying the CLI commands, keychain storage, state tracking, and deployment safety gates:
```bash
npm run test
```
