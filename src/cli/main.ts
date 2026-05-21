#!/usr/bin/env bun

import { formatHelp, formatUnknownCommand } from "./help"

const HELP_FLAGS = new Set(["-h", "--help", "help"])
const PLACEHOLDER_COMMANDS = new Set([
  "init",
  "agents",
  "run",
  "status",
  "open",
  "logs",
  "diff",
  "attach",
  "stop",
  "review",
  "continue",
  "merge",
  "cleanup",
  "doctor",
  "tui",
])

export function runCli(argv: string[]): number {
  const [command] = argv

  if (!command || HELP_FLAGS.has(command)) {
    console.log(formatHelp())
    return 0
  }

  if (!PLACEHOLDER_COMMANDS.has(command)) {
    console.error(formatUnknownCommand(command))
    return 1
  }

  console.log(
    [
      `Command '${command}' is planned but not implemented yet.`,
      "See ORCHESTRA_PLAN.md for the current phase and slice checklist.",
    ].join("\n"),
  )
  return 0
}

if (import.meta.main) {
  process.exitCode = runCli(process.argv.slice(2))
}
