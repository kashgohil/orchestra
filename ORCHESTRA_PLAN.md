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
    tmux.ts
    session.ts
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

- [ ] Add SQLite dependency.
- [ ] Create `<repo>/.orchestra/orchestra.sqlite`.
- [ ] Add migrations.
- [ ] Add task insert/update/list/get methods.
- [ ] Add task events table.
- [ ] Add idempotent initialization.

Acceptance:

- [ ] Can create, read, update, and list tasks.
- [ ] State survives process restart.
- [ ] Migrations can run more than once safely.

### Slice 1.4: Global Index

- [ ] Create `~/.orchestra/index.sqlite`.
- [ ] Track known repos.
- [ ] Track latest task summary per repo.
- [ ] Add command-safe initialization.

Acceptance:

- [ ] TUI can later list repos without scanning the filesystem.
- [ ] Per-repo tasks remain the source of truth for task details.

### Slice 1.5: Artifact Service

- [ ] Create task artifact directories.
- [ ] Write `TASK.md`.
- [ ] Append `LOG.jsonl`.
- [ ] Create empty `PLAN.md`, `RESULT.md`, `REVIEW.md` when useful.
- [ ] Append stdout/stderr logs.

Acceptance:

- [ ] Artifacts are created consistently for each task.
- [ ] JSONL events are parseable.

## Phase 2: Git Repo and Worktree Isolation

Goal: every task runs in an isolated git worktree.

### Slice 2.1: Repo Discovery

- [ ] Detect git repo root.
- [ ] Detect current branch.
- [ ] Detect current HEAD commit.
- [ ] Detect remote names.
- [ ] Refuse to run outside a git repo with a clear error.

Acceptance:

- [ ] Tests work in temporary git repositories.
- [ ] Non-git directories fail with actionable messages.

### Slice 2.2: Worktree Creation

- [ ] Create sibling `.orchestra-worktrees/<repo-slug>/<task-id>/`.
- [ ] Create task branch from current HEAD.
- [ ] Add git worktree for the task branch.
- [ ] Persist branch and worktree path on the task.
- [ ] Handle already-existing worktree path safely.

Acceptance:

- [ ] A task can create an isolated worktree.
- [ ] The source repo working tree is not modified by creation.

### Slice 2.3: Diff Helpers

- [ ] Show changed files for a task worktree.
- [ ] Show unified diff for a task worktree.
- [ ] Write `diff.patch` on demand.
- [ ] Return clear output for empty diffs.

Acceptance:

- [ ] `orchestra diff <task-id>` works before agents are implemented.
- [ ] Empty diff is not treated as an error.

### Slice 2.4: Cleanup Safety

- [ ] Remove stopped/completed task worktrees only through explicit cleanup.
- [ ] Never remove source repo paths.
- [ ] Refuse cleanup for running tasks unless forced later.

Acceptance:

- [ ] Cleanup only touches Orchestra-owned worktree paths.
- [ ] Running tasks are protected.

## Phase 3: Agent Adapter System

Goal: support named local coding CLIs through consistent adapters.

### Slice 3.1: Adapter Interface

- [ ] Define adapter detection behavior.
- [ ] Define launch command model.
- [ ] Define prompt envelope behavior.
- [ ] Define `requiresTty`.
- [ ] Define config override behavior.

Acceptance:

- [ ] Adapter unit tests can build commands without the binaries installed.

### Slice 3.2: Agent Detection

- [ ] Detect `codex`.
- [ ] Detect `claude`.
- [ ] Detect `cursor-agent` or configured Cursor command.
- [ ] Detect `antigravity`.
- [ ] Detect `gemini`.
- [ ] Detect `opencode`.
- [ ] Add `orchestra agents`.

Acceptance:

- [ ] Missing agents are reported, not fatal.
- [ ] Configured command overrides are respected.

### Slice 3.3: Launch Commands

- [ ] Implement Codex launch builder.
- [ ] Implement Claude launch builder.
- [ ] Implement Cursor Agent launch builder.
- [ ] Implement Antigravity launch builder.
- [ ] Implement Gemini launch builder.
- [ ] Implement OpenCode launch builder.
- [ ] Make exact command templates configurable.

Acceptance:

- [ ] Each adapter can produce a tmux-ready command.
- [ ] Prompt text is passed safely.

### Slice 3.4: Prompt Envelopes

- [ ] Standardize task prompt context.
- [ ] Include source repo path, worktree path, task ID, and artifact paths.
- [ ] Tell agents to write results to `RESULT.md`.
- [ ] Tell review agents to write review notes to `REVIEW.md`.
- [ ] Avoid agent-to-agent direct communication.

Acceptance:

- [ ] Generated prompts contain all required task context.
- [ ] Review and continue prompts include parent task context.

## Phase 4: tmux Runner

Goal: run every task in a managed, attachable tmux session.

### Slice 4.1: tmux Detection and Session Model

- [ ] Detect `tmux`.
- [ ] Define managed session naming: `orchestra-<task-id>`.
- [ ] List managed sessions.
- [ ] Check if a task session is alive.
- [ ] Refuse unsafe/non-Orchestra session names.

Acceptance:

- [ ] `orchestra doctor` can later report tmux availability.
- [ ] Session helpers are unit-tested where shelling out can be mocked.

### Slice 4.2: Start Task Session

- [ ] Start tmux session in task worktree.
- [ ] Run adapter launch command.
- [ ] Pipe output to artifact logs where possible.
- [ ] Mark task `starting`, then `running`.
- [ ] Write start event to `LOG.jsonl`.

Acceptance:

- [ ] `orchestra run "prompt" --agent codex` creates a managed tmux session.
- [ ] Session persists after CLI exits.

### Slice 4.3: Attach and Stop

- [ ] Implement `orchestra attach <task-id>`.
- [ ] Implement `orchestra stop <task-id>`.
- [ ] Kill only the managed tmux session for that task.
- [ ] Mark stopped tasks as `stopped`.
- [ ] Write stop event.

Acceptance:

- [ ] Attach opens the correct task session.
- [ ] Stop does not affect unrelated tmux sessions.

### Slice 4.4: Session Reconciliation

- [ ] Reconcile persisted task status with tmux state.
- [ ] Mark missing running sessions as `failed` or `stopped` with a clear reason.
- [ ] Keep completed detection conservative until reliable agent exit markers exist.

Acceptance:

- [ ] `status` does not lie about dead sessions.
- [ ] Reconciliation does not mutate completed/merged tasks incorrectly.

## Phase 5: CLI Workflow

Goal: provide a complete non-TUI workflow for scripting and fallback.

### Slice 5.1: `init`, `agents`, `status`

- [ ] Implement `orchestra init`.
- [ ] Implement `orchestra agents`.
- [ ] Implement `orchestra status`.
- [ ] Add useful table output.
- [ ] Add JSON output option if easy.

Acceptance:

- [ ] A repo can be initialized.
- [ ] User can inspect agent availability.
- [ ] User can inspect tasks.

### Slice 5.2: `run`, `logs`, `diff`

- [ ] Implement `orchestra run "<prompt>" --agent <agent>`.
- [ ] Implement `orchestra logs <task-id>`.
- [ ] Implement `orchestra diff <task-id>`.
- [ ] Persist all task metadata and artifacts.

Acceptance:

- [ ] A task can be launched and inspected without TUI.

### Slice 5.3: `attach`, `stop`, `cleanup`

- [ ] Implement `orchestra attach <task-id>`.
- [ ] Implement `orchestra stop <task-id>`.
- [ ] Implement `orchestra cleanup`.
- [ ] Add clear confirmations or safety checks where needed.

Acceptance:

- [ ] A user can attach to and stop a task cleanly.
- [ ] Cleanup does not remove active work.

### Slice 5.4: `review` and `continue`

- [ ] Implement `orchestra review <task-id> --agent <agent>`.
- [ ] Implement `orchestra continue <task-id> "<instruction>" --agent <agent>`.
- [ ] Link review tasks to parent tasks.
- [ ] Continue in the existing task worktree.

Acceptance:

- [ ] Multi-agent review/continue loop works without TUI.

## Phase 6: Merge, Commit, and Push

Goal: safely bring task worktree changes back to the source repo.

### Slice 6.1: Merge Preconditions

- [ ] Verify task exists.
- [ ] Verify task worktree exists.
- [ ] Verify source repo exists.
- [ ] Verify task has a diff.
- [ ] Detect dirty source repo state.
- [ ] Define clear error messages for conflicts.

Acceptance:

- [ ] Unsafe merge attempts fail before changing source repo.

### Slice 6.2: Apply and Commit

- [ ] Apply task changes back to source repo.
- [ ] Create a local commit.
- [ ] Use generated commit message with task ID and prompt summary.
- [ ] Mark task `merged`.
- [ ] Preserve task worktree and artifacts after merge.

Acceptance:

- [ ] `orchestra merge <task-id>` commits locally.
- [ ] It does not push.

### Slice 6.3: Explicit Push

- [ ] Implement `orchestra merge <task-id> --push`.
- [ ] Push to configured remote.
- [ ] Use configured branch behavior.
- [ ] Record push result in task events.

Acceptance:

- [ ] Push only happens when explicitly requested.
- [ ] Failed push keeps the local commit intact and reports recovery steps.

## Phase 7: OpenTUI Command Center

Goal: make `orchestra` open an OpenCode-like command interface.

### Slice 7.1: TUI Shell

- [ ] Add OpenTUI React dependencies.
- [ ] Add TUI entrypoint.
- [ ] Make bare `orchestra` launch TUI.
- [ ] Add `orchestra tui` alias.
- [ ] Render empty-state dashboard.

Acceptance:

- [ ] TUI opens and exits cleanly.
- [ ] TUI does not require existing tasks.

### Slice 7.2: Layout

- [ ] Left pane: repo/task list.
- [ ] Main pane: selected task detail.
- [ ] Bottom pane: command composer.
- [ ] Help overlay.
- [ ] Status bar.

Acceptance:

- [ ] Layout remains usable on typical terminal sizes.
- [ ] Empty, loading, and error states render clearly.

### Slice 7.3: Task Rendering

- [ ] Show task status, agent, repo, branch, and worktree path.
- [ ] Show latest events.
- [ ] Show log tail.
- [ ] Show changed files.
- [ ] Refresh state on interval or store notifications.

Acceptance:

- [ ] TUI reflects task changes after restart.
- [ ] Running sessions are visible.

### Slice 7.4: TUI Actions

- [ ] Run command from composer.
- [ ] Attach selected task.
- [ ] Stop selected task.
- [ ] Show diff.
- [ ] Show logs.
- [ ] Merge selected task.
- [ ] Merge and push only after explicit confirmation.

Acceptance:

- [ ] A full task can be started and managed from TUI.
- [ ] Quitting TUI does not stop running tasks.

### Slice 7.5: Keybindings

- [ ] `enter`: open selected task.
- [ ] `a`: attach.
- [ ] `d`: diff.
- [ ] `l`: logs.
- [ ] `s`: stop.
- [ ] `m`: merge.
- [ ] `?`: help.
- [ ] `q`: quit.

Acceptance:

- [ ] Keybindings are visible in help.
- [ ] Destructive keybindings require confirmation.

## Phase 8: Command Parser

Goal: let the TUI accept natural commands, with slash aliases as reliable fallback.

### Slice 8.1: Slash Commands

- [ ] Parse `/run codex fix tests`.
- [ ] Parse `/review task-123 --agent claude`.
- [ ] Parse `/continue task-123 --agent codex address comments`.
- [ ] Parse `/diff task-123`.
- [ ] Parse `/logs task-123`.
- [ ] Parse `/attach task-123`.
- [ ] Parse `/stop task-123`.
- [ ] Parse `/merge task-123`.
- [ ] Parse `/merge task-123 --push`.

Acceptance:

- [ ] Slash command parsing is deterministic and well tested.

### Slice 8.2: Natural Commands

- [ ] Parse `ask codex to fix failing tests`.
- [ ] Parse `run claude review task-123`.
- [ ] Parse `review task-123 with claude`.
- [ ] Parse `continue task-123 with codex address the review`.
- [ ] Parse `diff task-123`.
- [ ] Parse `logs task-123`.
- [ ] Parse `attach task-123`.
- [ ] Parse `stop task-123`.
- [ ] Parse `merge task-123`.
- [ ] Parse `merge task-123 and push`.

Acceptance:

- [ ] Natural parser covers the documented phrases.
- [ ] Unknown commands show examples instead of guessing dangerously.

### Slice 8.3: Confirmations

- [ ] Show parsed action before stop.
- [ ] Show parsed action before merge.
- [ ] Show parsed action before push.
- [ ] Require explicit confirmation for destructive operations.

Acceptance:

- [ ] Accidental stop/merge/push is hard to trigger.

## Phase 9: Review and Continue Loops

Goal: support multi-agent workflows without agents talking directly.

### Slice 9.1: Review Context Builder

- [ ] Include original task prompt.
- [ ] Include current diff.
- [ ] Include recent logs.
- [ ] Include test/lint output when available.
- [ ] Tell review agent to write `REVIEW.md`.

Acceptance:

- [ ] Review task has enough context to be useful.

### Slice 9.2: Continue Context Builder

- [ ] Include original task prompt.
- [ ] Include current diff.
- [ ] Include review notes if present.
- [ ] Include user continuation instruction.
- [ ] Run in existing task worktree.

Acceptance:

- [ ] Continue task can address review comments in place.

### Slice 9.3: Parent/Child Display

- [ ] Link review tasks to parent task.
- [ ] Show relationships in CLI status.
- [ ] Show relationships in TUI detail view.

Acceptance:

- [ ] User can understand which review belongs to which implementation task.

## Phase 10: Hardening and Documentation

Goal: make v1 usable without hidden behavior.

### Slice 10.1: Doctor

- [ ] Add `orchestra doctor`.
- [ ] Check Bun.
- [ ] Check tmux.
- [ ] Check git.
- [ ] Check configured agent binaries.
- [ ] Check repo state.
- [ ] Check global/per-repo DB access.

Acceptance:

- [ ] Common setup problems are reported with fixes.

### Slice 10.2: README and Quickstart

- [ ] Add README.
- [ ] Add install instructions.
- [ ] Add quickstart.
- [ ] Add TUI command examples.
- [ ] Add CLI command examples.
- [ ] Add supported agent setup notes.

Acceptance:

- [ ] A new user can run a basic task from docs.

### Slice 10.3: Troubleshooting

- [ ] Document missing tmux.
- [ ] Document missing agent binary.
- [ ] Document failed worktree creation.
- [ ] Document stuck sessions.
- [ ] Document dirty repo merge failure.
- [ ] Document failed push recovery.

Acceptance:

- [ ] Known failure modes have documented recovery paths.

### Slice 10.4: Final v1 Pass

- [ ] Run full test suite.
- [ ] Run typecheck.
- [ ] Manually test full TUI flow.
- [ ] Manually test full CLI flow.
- [ ] Update this plan with final v1 status.

Acceptance:

- [ ] v1 is usable end to end on a local repo.

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
