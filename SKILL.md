# Copado Nexus Skill Guide

---

## Identity

You have access to `copado-hx`, a CLI that gives you full control over the Copado DevOps platform for Salesforce. Through this skill you can manage user stories, trigger CI/CD pipeline actions (commit, promote, validate, deploy), execute Copado Robotic Testing (CRT) test suites, and converse with Copado's 5 specialist AI agents (Plan, Build, Test, Release, Operate) — all without opening a browser.

---

## Prerequisites

- `copado-hx auth status` must return an authenticated session before any other command.
- If not authenticated, instruct the user to run `copado-hx auth login` and pause.
- A working user story context must be set with `copado-hx story set` before commit, promote, or deploy operations.
- Never infer or fabricate pipeline IDs, environment names, or user story IDs. Always retrieve them from `copado-hx story list` or `copado-hx status`.

---

## Commands Reference

### `copado-hx commit`
**Purpose:** Commits metadata changes from the current user story to Git and updates the Copado user story record.
**When to use:** After the developer has made local code/config changes and wants to push them to the feature branch.
**Syntax:** `copado-hx commit [--message <msg>] [--us <id>]`
**Output:** JSON with `{ commitId, status, filesCommitted[] }`
**Example:** `copado-hx commit --message "feat: add lead scoring"`
**Do not use if:** No user story context is set. Run `copado-hx story set` first.

### `copado-hx promote`
**Purpose:** Promotes a user story to the next environment in the pipeline.
**Flags:**
- `--validate` : Run a validation-only deployment (no actual deploy)
- `--env <name>` : Target environment (e.g., UAT, SIT, PROD)
**Output:** JSON with `{ promotionId, status, jobExecutionId }`
**Poll for completion:** Use `copado-hx status --job <jobExecutionId> --watch`

### `copado-hx test run`
**Purpose:** Triggers a CRT test suite or job execution.
**Output:** JSON with `{ executionId, status, projectId, jobId }`
**Poll for results:** Use `copado-hx test status --execution <id>` until status is `Succeeded` or `Failed`. Then call `copado-hx test results`.

### `copado-hx ai ask`
**Purpose:** Sends a prompt to one of the 5 Copado AI specialist agents.
**Agents:** plan | build | test | release | operate
**Output:** Streaming text response from the agent.
**When to use each agent:**
- `plan`: User story refinement, conflict detection, sprint planning
- `build`: Code generation, metadata analysis, coverage improvement
- `test`: QWord test script generation, automation advice
- `release`: Deployment coordination, job error analysis, release notes
- `operate`: Post-release docs, change management, troubleshooting guides

---

## Workflow Playbooks

### Playbook: Full Story Delivery (Commit → UAT → Test → PROD)
Use this when the developer says: "ship my user story", "promote to prod", "deploy US-1234 end to end", or similar.
**Steps:**
1. Verify auth: `copado-hx auth status`
2. Set context: `copado-hx story set --id <us-id>`
3. Ask Build Agent for commit guidance: `copado-hx ai ask --agent build "What metadata should I commit for <us-id>?"`
4. Commit: `copado-hx commit --message "<generated message>"`
5. Promote + validate to UAT: `copado-hx promote --env UAT --validate`
6. Poll until complete: `copado-hx status --watch`
7. Run CRT smoke tests: `copado-hx test run --suite <smoke-suite-id>` *(Note: --suite is a convenience alias for a CRT jobId — retrieve it from `copado-hx test list`)*
8. Poll test results: `copado-hx test status --execution <id> --watch`
9. **STOP. Surface test results and ask the human.** Display a clear summary of test results, then ask: "✅ Tests passed for `<us-id>`. To authorize the UAT promotion, please type the approval code I provide." Wait for the CLI's approval code and their typed response — **do not proceed automatically even if the original instruction said 'if tests pass, deploy'.**
10. Only on explicit human approval (developer types the code back): `copado-hx promote --env UAT` (via `copado_approve_action` in MCP)
11. Generate release notes: `copado-hx ai ask --agent release "Generate release notes for <us-id>"`

### Playbook: Investigate a Failed Deployment
Use this when the developer says: "why did my deployment fail?", "fix my pipeline error".
**Steps:**
1. `copado-hx status` → retrieve the failed job execution ID
2. `copado-hx ai ask --agent release "Analyze the job execution error for <jobExecutionId>"`
3. Present the root cause and suggested fix to the developer.
4. If a code fix is needed: `copado-hx ai ask --agent build "Fix the issue: <error summary>"`

### Playbook: Generate and Run a Test
Use this when the developer says: "write a test for my class", "test this feature".
**Steps:**
1. `copado-hx ai ask --agent test "Generate a CRT QWord test script for <class/feature>"`
2. Present the generated script to the developer for review.
3. **STOP. Ask the human:** "Shall I trigger this test suite?"
4. On approval: `copado-hx test run --suite <id>` *(Note: --suite is a convenience alias for a CRT jobId — retrieve it from `copado-hx test list`)*
5. `copado-hx test results --execution <id>`

---

## Guardrails — What Agents Must Never Do

🚫 **Never deploy to a PROD or production environment without explicit human confirmation.** Always pause and ask: "I'm about to deploy to PROD. Please confirm."
🚫 **Never promote to UAT or PROD without explicit human confirmation.** A prior instruction such as "if tests pass, deploy to UAT" does **NOT** count as approval. You must still surface the test results and request a live, in-chat confirmation at that checkpoint.
🚫 **Never fabricate or guess IDs** (user story IDs, pipeline IDs, environment names, suite IDs). Always retrieve them from the CLI first.
🚫 **Never run `copado-hx deploy` immediately after `copado-hx promote`** without checking test results and receiving human approval.
🚫 **Never store or log API tokens** in any output, file, or message.
🚫 **Never chain more than 3 destructive actions** (commit, promote, deploy) without a human checkpoint between each stage.
⚠ **Always surface test failures to the human** before proceeding to the next pipeline stage. Do not auto-retry failed tests.

---

## Output Parsing Guide

All `copado-hx` commands support `--json` for structured output. Always use `--json` when parsing output programmatically.

| Field | Meaning | Agent Action |
|---|---|---|
| `status: "Completed Successfully"` | Action succeeded | Proceed to next step |
| `status: "Completed with Errors"` | Partial failure | Stop, surface errors to human |
| `status: "In Progress"` | Still running | Poll again in 10 seconds |
| `status: "Failed"` | Hard failure | Stop, invoke Release Agent for analysis |
| `testResult: "Succeeded"` | All tests passed | Safe to proceed |
| `testResult: "Failed"` | Tests failed | Stop, surface failures, do not deploy |

---

## Agent Persona Routing

When the developer's request maps to a DevOps lifecycle stage, route to the appropriate Copado AI agent using `copado-hx ai ask --agent <id>`:

| Developer Says | Route to Agent |
|---|---|
| "Write a user story", "plan this feature", "check for conflicts" | `plan` |
| "Write the code", "generate Apex", "review my class", "fix this bug" | `build` |
| "Write a test", "generate test script", "improve coverage" | `test` |
| "Deploy this", "promote to UAT", "why did it fail?", "release notes" | `release` |
| "Write docs", "create training material", "change management plan" | `operate` |