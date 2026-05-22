<p align="center">
  <picture>
    <source srcset="./assets/orchestra.svg" type="image/svg+xml">
    <img src="./assets/orchestra.png" alt="Orchestra app icon" width="128" height="128">
  </picture>
</p>

# Orchestra

Orchestra is a local command center for coding agents.

It runs tools like Codex, Claude Code, Cursor Agent, Antigravity/Gemini, and OpenCode
on your machine, isolates each task in its own git worktree, keeps long-running work
inside managed tmux sessions, and gives you one TUI for starting, watching, attaching,
reviewing, continuing, merging, and pushing agent work.

The goal is not to replace the agents. Orchestra is the conductor around them.

## What It Does

- Starts coding-agent tasks from one CLI/TUI.
- Creates an isolated git worktree per task.
- Keeps every task attachable through tmux.
- Persists task state, logs, diffs, and artifacts.
- Supports multi-agent review and continue loops.
- Lets you apply, commit, and explicitly push completed work.
- Keeps a plain CLI available for scripting and recovery.

## Intended Workflow

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

The TUI is meant to feel closer to OpenCode than a passive dashboard: you give it
commands, it creates and manages agent tasks, and you can attach to the underlying
tmux session whenever an agent needs interactive attention. It accepts both natural
commands and deterministic slash commands.

## CLI

```bash
orchestra init
orchestra agents
orchestra run "fix failing auth tests" --agent codex
orchestra status
orchestra attach task-123
orchestra logs task-123
orchestra diff task-123
orchestra review task-123 --agent claude
orchestra continue task-123 "address review feedback" --agent codex
orchestra merge task-123
orchestra merge task-123 --push
orchestra cleanup
orchestra doctor
```

## Install

Requirements:

- Bun
- Git
- tmux
- At least one supported local agent CLI

From this repo:

```bash
bun install
bun run build
bun link
orchestra --help
```

If your shell cannot find the linked command, run the built CLI directly from this
clone while you fix your PATH:

```bash
bun dist/orchestra.js --help
```

## Quickstart

Run these commands inside the repo where you want agents to work:

```bash
orchestra doctor
orchestra init
orchestra agents
orchestra
```

In the TUI, type commands like:

```text
ask codex to fix failing auth tests
review task-123 with claude
continue task-123 with codex address the review
diff task-123
merge task-123
merge task-123 and push
```

The same workflow is available through the plain CLI:

```bash
orchestra run "fix failing auth tests" --agent codex
orchestra status
orchestra logs task-123
orchestra diff task-123
orchestra review task-123 --agent claude
orchestra continue task-123 "address review feedback" --agent codex
orchestra merge task-123
orchestra merge task-123 --push
```

Stop, merge, and push are explicit. Quitting the TUI does not stop running tasks.

## Architecture

```text
Orchestra CLI / OpenTUI
        |
        v
Core Orchestrator
        |
        +-- Agent adapters
        |     codex, claude, cursor, antigravity/gemini, opencode
        |
        +-- tmux sessions
        |
        +-- git worktrees
        |
        +-- SQLite state
        |
        +-- task artifacts and logs
```

Agents do not talk directly to each other. They communicate through artifacts:

```text
TASK.md
PLAN.md
RESULT.md
REVIEW.md
LOG.jsonl
stdout.log
stderr.log
git diff
```

## Current Status

Completed:

- Persistent implementation plan.
- Bun TypeScript project scaffold.
- Minimal CLI entrypoint and help output.
- Placeholder command list.
- Scaffold tests and typecheck.
- Core domain types and task lifecycle helpers.
- Deterministic path, branch, task ID, and tmux session naming helpers.
- Per-repo SQLite task store.
- Global repo index store.
- Task artifact service for `TASK.md`, logs, events, and agent-editable files.
- Git repo discovery, worktree creation, diff helpers, and cleanup safety.
- Agent adapter framework, detection, launch templates, and prompt envelopes.
- Managed tmux session model, runner, attach/stop controls, and reconciliation.
- CLI workflow commands for init, agents, status, run, logs, diff, attach, stop, cleanup, review, and continue.
- Merge, local commit, and explicit push workflow.
- OpenTUI command center with task dashboard, command composer, task details, logs, diffs, keybindings, and destructive-action confirmations.
- Natural and slash TUI command parsing for run, review, continue, diff, logs, attach, stop, merge, and explicit push.
- Review and continue prompt context with parent task details, current diffs, recent logs, test/lint output, review notes, and visible parent/child task relationships.
- Doctor checks for Bun, Git, tmux, repo state, DB access, and supported agent binaries.

See [ORCHESTRA_PLAN.md](./ORCHESTRA_PLAN.md) for the full phased implementation plan.

## Supported Agents

Built-in adapters:

- `codex` command: `codex`
- `claude` command: `claude`
- `cursor` command: `cursor-agent`
- `antigravity` command: `antigravity`
- `gemini` command: `gemini -p <prompt>`
- `opencode` command: `opencode run <prompt>`

Run `orchestra agents` or `orchestra doctor` to see which commands are available
on your machine. Override commands in `orchestra.config.json` when a binary lives
outside your PATH:

```json
{
  "defaultAgent": "codex",
  "agents": {
    "codex": {
      "command": "/opt/homebrew/bin/codex"
    },
    "claude": {
      "command": "claude"
    }
  }
}
```

## Troubleshooting

### Missing tmux

`orchestra doctor` reports `tmux` as failed when `tmux -V` cannot run.

Install tmux, verify `tmux -V`, then rerun `orchestra doctor`. Running tasks need
tmux because Orchestra keeps agents in attachable managed sessions.

### Missing Agent Binary

`orchestra agents` and `orchestra doctor` show missing agents when the command is
not on PATH.

Install the agent CLI or add an explicit command override in `orchestra.config.json`.
Only one supported agent needs to be available for basic use.

### Failed Worktree Creation

Worktree creation can fail when the target path already exists, the repo is in an
invalid git state, or Git cannot create a branch.

Check `orchestra status`, remove stale Orchestra-owned worktrees with
`orchestra cleanup`, and inspect `.orchestra/tasks/<task-id>/LOG.jsonl` for the
exact failure.

### Stuck Sessions

Use `orchestra status` to find the task, then:

```bash
orchestra attach task-123
orchestra logs task-123
orchestra stop task-123
```

`orchestra stop` only targets the selected Orchestra-managed tmux session.

### Dirty Repo Merge Failure

`orchestra merge` refuses to apply task changes when the source repo has unrelated
dirty files.

Commit or stash your local changes, rerun `orchestra diff task-123`, then retry
`orchestra merge task-123`.

### Failed Push Recovery

`orchestra merge task-123 --push` creates the local merge commit before pushing.
If the push fails, the local commit remains intact.

Fix the remote, branch permissions, or network issue, then push manually or rerun
the merge/push workflow after confirming the repo state.

## App Icon

- [SVG icon](./assets/orchestra.svg)
- [PNG icon](./assets/orchestra.png)

## Development

Requirements:

- Bun
- Git
- tmux

Install dependencies:

```bash
bun install
```

Run the CLI:

```bash
bun run dev -- --help
```

Run checks:

```bash
bun run typecheck
bun test
bun run build
```

Run the built CLI:

```bash
bun dist/orchestra.js --help
```

## Design Principles

- Local-first.
- Thin conductor, not a platform.
- Worktree isolation by default.
- tmux for interactive, attachable sessions.
- Explicit stop, merge, and push behavior.
- TUI for daily use, CLI for automation and recovery.
- Durable artifacts instead of fragile chat memory.
