# Orchestra Implementation Plan

Orchestra is a local-only coding-agent orchestrator. It runs existing local agent CLIs
such as Codex, Claude Code, Cursor Agent, Antigravity/Gemini, and OpenCode in isolated
git worktrees, keeps each run attached to a managed tmux session, and provides an
OpenTUI command center for creating, supervising, reviewing, continuing, merging, and
pushing work.

This file is the source of truth for the build. Update it as slices are completed,
changed, deferred, or discovered to be wrong. Do not rely on chat context for decisions
that should survive a context reset.

## Current Decisions

- Runtime: Bun-first TypeScript.
- TUI: OpenTUI React.
- TUI implementation: load and follow the local `opentui` skill before starting Phase 7 code.
- Session manager: tmux from v1.
- Scope: local machine only.
- Core interface: CLI and TUI both call the same orchestration core.
- Default UI: running `orchestra` opens the TUI.
- Initial agents: Codex, Claude Code, Cursor Agent, Antigravity/Gemini, and OpenCode.
- Work isolation: one git worktree per task.
- Worktree location: sibling `.orchestra-worktrees/<repo-slug>/<task-id>/`.
- State model: global index plus per-repo task DB.
- Push behavior: explicit only through `merge --push` or an explicit TUI confirmation.
- PR/MR creation: deferred until after local apply, commit, and push are reliable.

## Operating Rules

- Work in slices small enough to finish, test, and record before moving on.
- Keep the repo runnable after every completed slice.
- Update this file after each completed slice.
- Add a short note under "Progress Log" whenever behavior changes materially.
- Keep destructive operations explicit and confirmable.
- Never let the TUI become the only interface; every core action needs a CLI path.
- Do not add distributed workers, remote execution, web UI, PR/MR automation, or agent-to-agent chat in v1.

## Target User Workflows

### TUI-first Workflow

```text
orchestra
> ask codex to fix failing auth tests
> attach task-123
> review task-123 with claude
> continue task-123 with codex address the review
> diff task-123
> merge task-123
> merge task-123 and push
```

### CLI Workflow

```bash
orchestra init
orchestra agents
orchestra run "fix failing auth tests" --agent codex
orchestra status
orchestra attach task-123
orchestra diff task-123
orchestra review task-123 --agent claude
orchestra continue task-123 "address review feedback" --agent codex
orchestra merge task-123
orchestra merge task-123 --push
orchestra cleanup
```

## Architecture

```text
src/
  cli/
    main.ts
    commands/
  tui/
    app.tsx
    components/
    command-parser/
  core/
    orchestrator.ts
    task-service.ts
    repo-service.ts
    artifact-service.ts
  agents/
    adapter.ts
    codex.ts
    claude.ts
    cursor.ts
    antigravity.ts
    gemini.ts
    opencode.ts
  git/
    repo.ts
    worktree.ts
    diff.ts
    merge.ts
  tmux/
    command.ts
    control.ts
    reconcile.ts
    runner.ts
    session.ts
    shell.ts
  store/
    global-store.ts
    repo-store.ts
    migrations/
  logging/
    events.ts
    log-writer.ts
  config/
    config.ts
    schema.ts
  test/
```

Core dependencies should point inward:

```text
CLI -> core
TUI -> core
core -> store/git/tmux/agents/logging/config
agents -> config/shell helpers only
```

## Data Model Draft

### Task

```ts
type TaskStatus =
  | "queued"
  | "starting"
  | "running"
  | "stopped"
  | "failed"
  | "completed"
  | "merged"

interface Task {
  id: string
  repoId: string
  parentTaskId?: string
  kind: "run" | "review" | "continue"
  agentId: string
  status: TaskStatus
  prompt: string
  sourceRepoPath: string
  sourceBranch: string
  baseCommit: string
  taskBranch: string
  worktreePath: string
  tmuxSessionName: string
  artifactPath: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}
```

### Task Artifacts

```text
<repo>/.orchestra/tasks/<task-id>/
  TASK.md
  PLAN.md
  RESULT.md
  REVIEW.md
  LOG.jsonl
  stdout.log
  stderr.log
  diff.patch
```

### Config

Initial config file: `orchestra.config.json`.

```json
{
  "defaultAgent": "codex",
  "remote": "origin",
  "branchPattern": "orchestra/{taskId}-{slug}",
  "agents": {
    "codex": { "command": "codex" },
    "claude": { "command": "claude" },
    "cursor": { "command": "cursor-agent" },
    "antigravity": { "command": "antigravity" },
    "gemini": { "command": "gemini" },
    "opencode": { "command": "opencode" }
  },
  "checks": {
    "test": "",
    "lint": ""
  }
}
```

## Phase 0: Project Foundation

Goal: create a clean Bun TypeScript CLI/TUI package foundation.

### Slice 0.1: Persistent Plan

- [x] Create `ORCHESTRA_PLAN.md`.
- [x] Capture current product decisions.
- [x] Define phases, slices, subtasks, and acceptance criteria.

Acceptance:

- [x] The plan file exists at repo root.
- [x] The file is detailed enough to resume implementation after context reset.

### Slice 0.2: Bun Package Scaffold

- [x] Add `package.json`.
- [x] Add `tsconfig.json`.
- [x] Add executable bin entry for `orchestra`.
- [x] Add scripts:
  - [x] `dev`
  - [x] `test`
  - [x] `typecheck`
  - [x] `build`
- [x] Add `.gitignore`.
- [x] Add initial source folders.

Acceptance:

- [x] `bun install` succeeds.
- [x] `bun run typecheck` succeeds.
- [x] `bun test` succeeds, even if only with a placeholder test.
- [x] `bun run src/cli/main.ts --help` or equivalent shows CLI help.

### Slice 0.3: CLI Entry and Help

- [x] Add `src/cli/main.ts`.
- [x] Add root command metadata.
- [x] Make bare `orchestra` route to TUI later, but during scaffold show useful help if TUI is not built.
- [x] Add placeholder commands for planned v1 commands.

Acceptance:

- [x] The CLI starts without crashing.
- [x] Unknown commands return a readable error.
- [x] Help lists planned commands clearly.

## Phase 1: Core Domain and Storage

Goal: model tasks, repos, agents, and state before running real agents.

### Slice 1.1: Core Types

- [x] Define `Task`.
- [x] Define `TaskStatus`.
- [x] Define `TaskKind`.
- [x] Define `RepoRecord`.
- [x] Define `AgentId`.
- [x] Define `TaskEvent`.
- [x] Define `AgentAdapter`.
- [x] Define typed errors for expected failures.

Acceptance:

- [x] Types compile under strict TypeScript.
- [x] Unit tests cover status transition helpers.

### Slice 1.2: Path and ID Helpers

- [x] Add task ID generation.
- [x] Add repo slug generation.
- [x] Add artifact path generation.
- [x] Add worktree path generation.
- [x] Add tmux session name generation.
- [x] Sanitize branch and path components.

Acceptance:

- [x] Tests cover deterministic path generation.
- [x] Generated names avoid spaces and unsafe shell characters.

### Slice 1.3: Per-repo Store

- [x] Use Bun's built-in SQLite support.
- [x] Create `<repo>/.orchestra/orchestra.sqlite`.
- [x] Add migrations.
- [x] Add task insert/update/list/get methods.
- [x] Add task events table.
- [x] Add idempotent initialization.

Acceptance:

- [x] Can create, read, update, and list tasks.
- [x] State survives process restart.
- [x] Migrations can run more than once safely.

### Slice 1.4: Global Index

- [x] Create `~/.orchestra/index.sqlite`.
- [x] Track known repos.
- [x] Track latest task summary per repo.
- [x] Add command-safe initialization.

Acceptance:

- [x] TUI can later list repos without scanning the filesystem.
- [x] Per-repo tasks remain the source of truth for task details.

### Slice 1.5: Artifact Service

- [x] Create task artifact directories.
- [x] Write `TASK.md`.
- [x] Append `LOG.jsonl`.
- [x] Create empty `PLAN.md`, `RESULT.md`, `REVIEW.md` when useful.
- [x] Append stdout/stderr logs.

Acceptance:

- [x] Artifacts are created consistently for each task.
- [x] JSONL events are parseable.

## Phase 2: Git Repo and Worktree Isolation

Goal: every task runs in an isolated git worktree.

### Slice 2.1: Repo Discovery

- [x] Detect git repo root.
- [x] Detect current branch.
- [x] Detect current HEAD commit.
- [x] Detect remote names.
- [x] Refuse to run outside a git repo with a clear error.

Acceptance:

- [x] Tests work in temporary git repositories.
- [x] Non-git directories fail with actionable messages.

### Slice 2.2: Worktree Creation

- [x] Create sibling `.orchestra-worktrees/<repo-slug>/<task-id>/`.
- [x] Create task branch from current HEAD.
- [x] Add git worktree for the task branch.
- [x] Persist branch and worktree path on the task.
- [x] Handle already-existing worktree path safely.

Acceptance:

- [x] A task can create an isolated worktree.
- [x] The source repo working tree is not modified by creation.

### Slice 2.3: Diff Helpers

- [x] Show changed files for a task worktree.
- [x] Show unified diff for a task worktree.
- [x] Write `diff.patch` on demand.
- [x] Return clear output for empty diffs.

Acceptance:

- [x] `orchestra diff <task-id>` works before agents are implemented.
- [x] Empty diff is not treated as an error.

### Slice 2.4: Cleanup Safety

- [x] Remove stopped/completed task worktrees only through explicit cleanup.
- [x] Never remove source repo paths.
- [x] Refuse cleanup for running tasks unless forced later.

Acceptance:

- [x] Cleanup only touches Orchestra-owned worktree paths.
- [x] Running tasks are protected.

## Phase 3: Agent Adapter System

Goal: support named local coding CLIs through consistent adapters.

### Slice 3.1: Adapter Interface

- [x] Define adapter detection behavior.
- [x] Define launch command model.
- [x] Define prompt envelope behavior.
- [x] Define `requiresTty`.
- [x] Define config override behavior.

Acceptance:

- [x] Adapter unit tests can build commands without the binaries installed.

### Slice 3.2: Agent Detection

- [x] Detect `codex`.
- [x] Detect `claude`.
- [x] Detect `cursor-agent` or configured Cursor command.
- [x] Detect `antigravity`.
- [x] Detect `gemini`.
- [x] Detect `opencode`.
- [x] Add `orchestra agents`.

Acceptance:

- [x] Missing agents are reported, not fatal.
- [x] Configured command overrides are respected.

### Slice 3.3: Launch Commands

- [x] Implement Codex launch builder.
- [x] Implement Claude launch builder.
- [x] Implement Cursor Agent launch builder.
- [x] Implement Antigravity launch builder.
- [x] Implement Gemini launch builder.
- [x] Implement OpenCode launch builder.
- [x] Make exact command templates configurable.

Acceptance:

- [x] Each adapter can produce a tmux-ready command.
- [x] Prompt text is passed safely.

### Slice 3.4: Prompt Envelopes

- [x] Standardize task prompt context.
- [x] Include source repo path, worktree path, task ID, and artifact paths.
- [x] Tell agents to write results to `RESULT.md`.
- [x] Tell review agents to write review notes to `REVIEW.md`.
- [x] Avoid agent-to-agent direct communication.

Acceptance:

- [x] Generated prompts contain all required task context.
- [x] Review and continue prompts include parent task context.

## Phase 4: tmux Runner

Goal: run every task in a managed, attachable tmux session.

### Slice 4.1: tmux Detection and Session Model

- [x] Detect `tmux`.
- [x] Define managed session naming: `orchestra-<task-id>`.
- [x] List managed sessions.
- [x] Check if a task session is alive.
- [x] Refuse unsafe/non-Orchestra session names.

Acceptance:

- [x] `orchestra doctor` can later report tmux availability.
- [x] Session helpers are unit-tested where shelling out can be mocked.

### Slice 4.2: Start Task Session

- [x] Start tmux session in task worktree.
- [x] Run adapter launch command.
- [x] Pipe output to artifact logs where possible.
- [x] Mark task `starting`, then `running`.
- [x] Write start event to `LOG.jsonl`.

Acceptance:

- [x] Core runner creates a managed tmux session command for `orchestra run`.
- [x] Session persists after CLI exits.

### Slice 4.3: Attach and Stop

- [x] Implement `orchestra attach <task-id>`.
- [x] Implement `orchestra stop <task-id>`.
- [x] Kill only the managed tmux session for that task.
- [x] Mark stopped tasks as `stopped`.
- [x] Write stop event.

Acceptance:

- [x] Attach opens the correct task session.
- [x] Stop does not affect unrelated tmux sessions.

### Slice 4.4: Session Reconciliation

- [x] Reconcile persisted task status with tmux state.
- [x] Mark missing running sessions as `failed` or `stopped` with a clear reason.
- [x] Keep completed detection conservative until reliable agent exit markers exist.

Acceptance:

- [x] `status` does not lie about dead sessions.
- [x] Reconciliation does not mutate completed/merged tasks incorrectly.

## Phase 5: CLI Workflow

Goal: provide a complete non-TUI workflow for scripting and fallback.

### Slice 5.1: `init`, `agents`, `status`

- [x] Implement `orchestra init`.
- [x] Implement `orchestra agents`.
- [x] Implement `orchestra status`.
- [x] Add useful table output.
- [x] Add JSON output option if easy.

Acceptance:

- [x] A repo can be initialized.
- [x] User can inspect agent availability.
- [x] User can inspect tasks.

### Slice 5.2: `run`, `logs`, `diff`

- [x] Implement `orchestra run "<prompt>" --agent <agent>`.
- [x] Implement `orchestra logs <task-id>`.
- [x] Implement `orchestra diff <task-id>`.
- [x] Persist all task metadata and artifacts.

Acceptance:

- [x] A task can be launched and inspected without TUI.

### Slice 5.3: `attach`, `stop`, `cleanup`

- [x] Implement `orchestra attach <task-id>`.
- [x] Implement `orchestra stop <task-id>`.
- [x] Implement `orchestra cleanup`.
- [x] Add clear confirmations or safety checks where needed.

Acceptance:

- [x] A user can attach to and stop a task cleanly.
- [x] Cleanup does not remove active work.

### Slice 5.4: `review` and `continue`

- [x] Implement `orchestra review <task-id> --agent <agent>`.
- [x] Implement `orchestra continue <task-id> "<instruction>" --agent <agent>`.
- [x] Link review tasks to parent tasks.
- [x] Continue in the existing task worktree.

Acceptance:

- [x] Multi-agent review/continue loop works without TUI.

## Phase 6: Merge, Commit, and Push

Goal: safely bring task worktree changes back to the source repo.

### Slice 6.1: Merge Preconditions

- [x] Verify task exists.
- [x] Verify task worktree exists.
- [x] Verify source repo exists.
- [x] Verify task has a diff.
- [x] Detect dirty source repo state.
- [x] Define clear error messages for conflicts.

Acceptance:

- [x] Unsafe merge attempts fail before changing source repo.

### Slice 6.2: Apply and Commit

- [x] Apply task changes back to source repo.
- [x] Create a local commit.
- [x] Use generated commit message with task ID and prompt summary.
- [x] Mark task `merged`.
- [x] Preserve task worktree and artifacts after merge.

Acceptance:

- [x] `orchestra merge <task-id>` commits locally.
- [x] It does not push.

### Slice 6.3: Explicit Push

- [x] Implement `orchestra merge <task-id> --push`.
- [x] Push to configured remote.
- [x] Use configured branch behavior.
- [x] Record push result in task events.

Acceptance:

- [x] Push only happens when explicitly requested.
- [x] Failed push keeps the local commit intact and reports recovery steps.

## Phase 7: OpenTUI Command Center

Goal: make `orchestra` open an OpenCode-like command interface.

Implementation note:

- [x] Before editing TUI code, load the local `opentui` skill and follow its OpenTUI React, layout, keyboard, component, and testing guidance.

### Slice 7.1: TUI Shell

- [x] Add OpenTUI React dependencies.
- [x] Add TUI entrypoint.
- [x] Make bare `orchestra` launch TUI.
- [x] Add `orchestra tui` alias.
- [x] Render empty-state dashboard.

Acceptance:

- [x] TUI opens and exits cleanly.
- [x] TUI does not require existing tasks.

### Slice 7.2: Layout

- [x] Left pane: repo/task list.
- [x] Main pane: selected task detail.
- [x] Bottom pane: command composer.
- [x] Help overlay.
- [x] Status bar.

Acceptance:

- [x] Layout remains usable on typical terminal sizes.
- [x] Empty, loading, and error states render clearly.

### Slice 7.3: Task Rendering

- [x] Show task status, agent, repo, branch, and worktree path.
- [x] Show latest events.
- [x] Show log tail.
- [x] Show changed files.
- [x] Refresh state on interval or store notifications.

Acceptance:

- [x] TUI reflects task changes after restart.
- [x] Running sessions are visible.

### Slice 7.4: TUI Actions

- [x] Run command from composer.
- [x] Attach selected task.
- [x] Stop selected task.
- [x] Show diff.
- [x] Show logs.
- [x] Merge selected task.
- [x] Merge and push only after explicit confirmation.

Acceptance:

- [x] A full task can be started and managed from TUI.
- [x] Quitting TUI does not stop running tasks.

### Slice 7.5: Keybindings

- [x] `enter`: open selected task.
- [x] `a`: attach.
- [x] `d`: diff.
- [x] `l`: logs.
- [x] `s`: stop.
- [x] `m`: merge.
- [x] `?`: help.
- [x] `q`: quit.

Acceptance:

- [x] Keybindings are visible in help.
- [x] Destructive keybindings require confirmation.

## Phase 8: Command Parser

Goal: let the TUI accept natural commands, with slash aliases as reliable fallback.

### Slice 8.1: Slash Commands

- [x] Parse `/run codex fix tests`.
- [x] Parse `/review task-123 --agent claude`.
- [x] Parse `/continue task-123 --agent codex address comments`.
- [x] Parse `/diff task-123`.
- [x] Parse `/logs task-123`.
- [x] Parse `/attach task-123`.
- [x] Parse `/stop task-123`.
- [x] Parse `/merge task-123`.
- [x] Parse `/merge task-123 --push`.

Acceptance:

- [x] Slash command parsing is deterministic and well tested.

### Slice 8.2: Natural Commands

- [x] Parse `ask codex to fix failing tests`.
- [x] Parse `run claude review task-123`.
- [x] Parse `review task-123 with claude`.
- [x] Parse `continue task-123 with codex address the review`.
- [x] Parse `diff task-123`.
- [x] Parse `logs task-123`.
- [x] Parse `attach task-123`.
- [x] Parse `stop task-123`.
- [x] Parse `merge task-123`.
- [x] Parse `merge task-123 and push`.

Acceptance:

- [x] Natural parser covers the documented phrases.
- [x] Unknown commands show examples instead of guessing dangerously.

### Slice 8.3: Confirmations

- [x] Show parsed action before stop.
- [x] Show parsed action before merge.
- [x] Show parsed action before push.
- [x] Require explicit confirmation for destructive operations.

Acceptance:

- [x] Accidental stop/merge/push is hard to trigger.

## Phase 9: Review and Continue Loops

Goal: support multi-agent workflows without agents talking directly.

### Slice 9.1: Review Context Builder

- [x] Include original task prompt.
- [x] Include current diff.
- [x] Include recent logs.
- [x] Include test/lint output when available.
- [x] Tell review agent to write `REVIEW.md`.

Acceptance:

- [x] Review task has enough context to be useful.

### Slice 9.2: Continue Context Builder

- [x] Include original task prompt.
- [x] Include current diff.
- [x] Include review notes if present.
- [x] Include user continuation instruction.
- [x] Run in existing task worktree.

Acceptance:

- [x] Continue task can address review comments in place.

### Slice 9.3: Parent/Child Display

- [x] Link review tasks to parent task.
- [x] Show relationships in CLI status.
- [x] Show relationships in TUI detail view.

Acceptance:

- [x] User can understand which review belongs to which implementation task.

## Phase 10: Hardening and Documentation

Goal: make v1 usable without hidden behavior.

### Slice 10.1: Doctor

- [x] Add `orchestra doctor`.
- [x] Check Bun.
- [x] Check tmux.
- [x] Check git.
- [x] Check configured agent binaries.
- [x] Check repo state.
- [x] Check global/per-repo DB access.

Acceptance:

- [x] Common setup problems are reported with fixes.

### Slice 10.2: README and Quickstart

- [x] Add README.
- [x] Add install instructions.
- [x] Add quickstart.
- [x] Add TUI command examples.
- [x] Add CLI command examples.
- [x] Add supported agent setup notes.

Acceptance:

- [x] A new user can run a basic task from docs.

### Slice 10.3: Troubleshooting

- [x] Document missing tmux.
- [x] Document missing agent binary.
- [x] Document failed worktree creation.
- [x] Document stuck sessions.
- [x] Document dirty repo merge failure.
- [x] Document failed push recovery.

Acceptance:

- [x] Known failure modes have documented recovery paths.

### Slice 10.4: Final v1 Pass

- [x] Run full test suite.
- [x] Run typecheck.
- [x] Manually test full TUI flow.
- [x] Manually test full CLI flow.
- [x] Update this plan with final v1 status.

Acceptance:

- [x] v1 is usable end to end on a local repo.

## Deferred Until After v1

- PR/MR creation.
- GitHub/GitLab integrations.
- Web UI.
- Distributed workers.
- Remote execution.
- Agent-to-agent direct messaging.
- LLM-based natural language command interpretation.
- Automatic retries.
- Complex scheduling.
- Permission sandbox beyond worktree isolation and existing agent permissions.

## Progress Log

- 2026-05-21: Created initial persistent implementation plan.
- 2026-05-21: Completed Phase 0 scaffold with Bun package metadata, TypeScript config, source folders, minimal CLI help, placeholder commands, and CLI scaffold tests.
- 2026-05-21: Added top-level README describing Orchestra, intended workflows, architecture, current status, and development commands.
- 2026-05-21: Completed Phase 1 Slice 1.1 with core task/repo/agent/event types, typed Orchestra errors, status transition helpers, and lifecycle tests.
- 2026-05-21: Completed Phase 1 Slice 1.2 with deterministic task IDs, safe name sanitization, repo slugs, branch names, artifact paths, sibling worktree paths, and tmux session names using `orchestra-<task-id>`.
- 2026-05-21: Completed Phase 1 Slice 1.3 with a Bun SQLite per-repo store, schema migrations, task CRUD, task events, idempotent initialization, and persistence tests.
- 2026-05-22: Completed Phase 1 Slice 1.4 with a Bun SQLite global index, known repo tracking, latest task summaries, idempotent initialization, and persistence tests.
- 2026-05-22: Completed Phase 1 Slice 1.5 with task artifact initialization, TASK.md rendering, placeholder artifact preservation, parseable JSONL events, and stdout/stderr append helpers.
- 2026-05-22: Completed Phase 1 review; checks pass, README status reflects Phase 1, and stale `.gitkeep` files were removed from populated core/store directories.
- 2026-05-22: Completed Phase 2 Slice 2.1 with git repo discovery for root, branch, HEAD commit, remotes, and typed non-git errors covered by temporary repo tests.
- 2026-05-22: Completed Phase 2 Slice 2.2 with task worktree creation, sibling worktree paths, branch creation from HEAD, existing-path safety, and source repo cleanliness tests.
- 2026-05-22: Completed Phase 2 Slice 2.3 with changed-file listing, unified diffs including untracked text files, on-demand `diff.patch` writing, and clear empty-diff output.
- 2026-05-22: Completed Phase 2 Slice 2.4 with cleanup safety for stopped/completed/merged worktrees, running-task protection, source repo path protection, and dirty-worktree preservation.
- 2026-05-22: Completed Phase 2 review; checks pass, README status reflects Phase 2, git command failures use typed errors, and stale `.gitkeep` was removed from the populated git directory.
- 2026-05-22: Completed Phase 3 Slice 3.1 with config loading, adapter construction, detection contracts, launch command rendering, TTY metadata, and configurable command overrides.
- 2026-05-22: Completed Phase 3 Slice 3.2 with built-in Codex, Claude, Cursor, Antigravity, Gemini, and OpenCode detection plus the `orchestra agents` command.
- 2026-05-22: Completed Phase 3 Slice 3.3 with built-in launch templates, registry launch lookup, exact config overrides, and prompt-as-argument safety tests.
- 2026-05-22: Completed Phase 3 Slice 3.4 with standardized prompt envelopes, artifact contracts, review/continue instructions, parent task context, and coordination rules.
- 2026-05-22: Completed Phase 3 review; checks pass, README status reflects Phase 3, and stale `.gitkeep` files were removed from populated agent/config directories.
- 2026-05-22: Completed Phase 4 Slice 4.1 with tmux detection, managed session naming, session listing, alive checks, and injectable executor tests.
- 2026-05-22: Completed Phase 4 Slice 4.2 with managed tmux session startup, bash launch wrappers, stdout/stderr log capture, starting/running status updates, and task start/failure event logging.
- 2026-05-22: Completed Phase 4 Slice 4.3 with attach command construction, selected-session attach, idempotent stop handling, stopped status updates, and stop event logging.
- 2026-05-22: Completed Phase 4 Slice 4.4 with session reconciliation for running/starting tasks, missing-session failure marking, conservative completed/merged preservation, and event/artifact logging.
- 2026-05-22: Completed Phase 4 review; checks pass, README status reflects Phase 4, the tmux architecture sketch matches implemented modules, and the stale tmux `.gitkeep` was removed.
- 2026-05-22: Recorded the Phase 7 requirement to load and follow the local `opentui` skill before implementing the TUI.
- 2026-05-22: Completed Phase 5 Slice 5.1 with `init`, `agents --json`, `status`, status reconciliation, repo/global store registration, and table/JSON output.
- 2026-05-22: Completed Phase 5 Slice 5.2 with `run`, `logs`, and `diff`, including task worktree creation, task/artifact persistence, tmux launch, event logs, stdout/stderr access, and diff patch writing.
- 2026-05-22: Completed Phase 5 Slice 5.3 with `attach`, `stop`, and `cleanup`, including interactive attach support, persisted stopped status, managed-session kill safety, and active-worktree cleanup skips.
- 2026-05-22: Completed Phase 5 Slice 5.4 with `review` and `continue`, linked child tasks, parent-worktree reuse, review/continue prompt context, and tmux launch coverage.
- 2026-05-22: Completed Phase 5 review; checks pass, README/help status reflect the CLI workflow, and a stale orchestrator import was removed.
- 2026-05-22: Completed Phase 6 Slice 6.1 with merge precondition checks for task/source/worktree existence, active-task safety, non-empty diffs, dirty source detection, and Orchestra state filtering.
- 2026-05-22: Completed Phase 6 Slice 6.2 with tracked patch application, untracked file copy, local merge commits, merged task status/events, and preservation of task worktrees/artifacts without pushing.
- 2026-05-22: Completed Phase 6 Slice 6.3 with explicit `merge --push`, configured remote/source-branch push behavior, push events, and failed-push recovery that preserves the local merge commit.
- 2026-05-22: Completed Phase 6 review; checks pass and README/help status now reflect local merge, commit, and explicit push support.
- 2026-05-22: Completed Phase 7 Slice 7.1 with OpenTUI React dependencies, a TUI entrypoint, bare `orchestra` launch, the `orchestra tui` alias, and empty-state rendering.
- 2026-05-22: Completed Phase 7 Slice 7.2 with responsive task/detail/composer layout, help overlay, status bar, and clear empty/error rendering.
- 2026-05-22: Completed Phase 7 Slice 7.3 with repo/task metadata, latest events, log tails, changed files, and interval-based state refresh.
- 2026-05-22: Completed Phase 7 Slice 7.4 with composer-driven CLI actions for run, attach, stop, diff, logs, review, continue, cleanup, merge, and confirmed merge/push.
- 2026-05-22: Completed Phase 7 Slice 7.5 with keyboard shortcuts for open, attach, diff, logs, stop, merge, help, quit, and confirmations for destructive shortcuts.
- 2026-05-22: Completed Phase 7 review; checks pass, README/help status reflect the TUI, current examples use implemented CLI-style slash commands, and the stale TUI `.gitkeep` was removed.
- 2026-05-22: Completed Phase 8 Slice 8.1 with deterministic slash command parsing, including `/run <agent> ...` shorthand and merge push aliases.
- 2026-05-22: Completed Phase 8 Slice 8.2 with documented natural commands for run, review, continue, diff, logs, attach, stop, merge, and merge-and-push.
- 2026-05-22: Completed Phase 8 Slice 8.3 with parsed-action confirmation messages for stop, merge, and merge-and-push before execution.
- 2026-05-22: Completed Phase 8 review; checks pass, README/help status reflect natural commands, and unknown TUI commands now show examples instead of guessing.
- 2026-05-22: Completed Phase 9 Slice 9.1 with review prompt context for original prompt, current diff, recent logs, detected test/lint output, and explicit `REVIEW.md` instructions.
- 2026-05-22: Completed Phase 9 Slice 9.2 with continue prompt context for original prompt, current diff, discovered review notes, user continuation instructions, and existing-worktree execution.
- 2026-05-22: Completed Phase 9 Slice 9.3 with parent/child links surfaced in CLI status and TUI task detail relationships.
- 2026-05-22: Completed Phase 9 review; checks pass, review/continue context is covered by workflow tests, and no stale populated-directory placeholders were introduced.
- 2026-05-22: Completed Phase 10 Slice 10.1 with `orchestra doctor` checks for Bun, Git, tmux, configured agents, repo state, global DB access, and per-repo DB access.
- 2026-05-22: Completed Phase 10 Slice 10.2 with README install instructions, quickstart, TUI command examples, CLI command examples, and supported agent setup notes.
- 2026-05-22: Completed Phase 10 Slice 10.3 with troubleshooting for missing tmux, missing agents, worktree creation failures, stuck sessions, dirty repo merge failures, and failed push recovery.
- 2026-05-22: Completed Phase 10 Slice 10.4 with full typecheck, full test suite, build, built-CLI help smoke, temporary-repo CLI smoke, and OpenTUI renderer/parser smoke for the TUI flow.
- 2026-05-22: v1 status: local CLI/TUI orchestration is usable end to end for init, doctor, agent detection, task run/status/log/diff/attach/stop/cleanup, review/continue, merge, explicit push, and troubleshooting on a local git repo.
- 2026-05-22: Completed Phase 10 review; checks pass, docs cover setup and recovery, and v1 is recorded as complete for local-machine orchestration.
