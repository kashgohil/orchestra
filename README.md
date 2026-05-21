# 🎼 Orchestra

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

The TUI is planned to feel closer to OpenCode than a passive dashboard: you give it
commands, it creates and manages agent tasks, and you can attach to the underlying
tmux session whenever an agent needs interactive attention.

## Planned CLI

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

Orchestra is in early implementation.

Completed:

- Persistent implementation plan.
- Bun TypeScript project scaffold.
- Minimal CLI entrypoint and help output.
- Placeholder command list.
- Scaffold tests and typecheck.

Next:

- Core domain types.
- Task state storage.
- Git worktree helpers.
- Agent adapter system.
- tmux runner.
- OpenTUI command center.

See [ORCHESTRA_PLAN.md](./ORCHESTRA_PLAN.md) for the full phased implementation plan.

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

