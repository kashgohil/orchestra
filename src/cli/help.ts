export const COMMANDS = [
  ["init", "Initialize Orchestra in the current git repo."],
  ["agents", "Show detected and configured local agent CLIs."],
  ["run <prompt>", "Start an agent task in an isolated worktree."],
  ["status", "List known tasks and running sessions."],
  ["open <task-id>", "Show task metadata and artifact paths."],
  ["logs <task-id>", "Print task logs."],
  ["diff <task-id>", "Show task worktree changes."],
  ["attach <task-id>", "Attach to the managed tmux session for a task."],
  ["stop <task-id>", "Stop a managed task tmux session."],
  ["review <task-id>", "Launch a review task for an existing task."],
  ["continue <task-id> <instruction>", "Continue work in an existing task worktree."],
  ["merge <task-id>", "Apply task changes and create a local commit."],
  ["merge <task-id> --push", "Apply, commit, and explicitly push task changes."],
  ["cleanup", "Clean up stopped/completed Orchestra-owned resources."],
  ["doctor", "Check local prerequisites and repo setup."],
  ["tui", "Open the Orchestra TUI command center."],
] as const

export function formatHelp(): string {
  const commandWidth = Math.max(...COMMANDS.map(([command]) => command.length))
  const commandLines = COMMANDS.map(
    ([command, description]) => `  ${command.padEnd(commandWidth)}  ${description}`,
  )

  return [
    "Orchestra",
    "",
    "Local coding-agent orchestration for Bun, tmux, git worktrees, and OpenTUI.",
    "",
    "Usage:",
    "  orchestra [command] [options]",
    "",
    "Commands:",
    ...commandLines,
    "",
    "Current status:",
    "  Core CLI workflow is being implemented. TUI, merge, and push remain planned.",
    "",
    "Examples:",
    '  orchestra run "fix failing auth tests" --agent codex',
    "  orchestra status",
    "  orchestra attach task-123",
    "  orchestra merge task-123 --push",
  ].join("\n")
}

export function formatUnknownCommand(command: string): string {
  return [
    `Unknown command: ${command}`,
    "",
    "Run `orchestra --help` to see available commands.",
  ].join("\n")
}
