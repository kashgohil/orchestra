#!/usr/bin/env bun

import { formatHelp, formatUnknownCommand } from "./help"
import { runAgentsCommand } from "./agents"

export interface CliOptions {
  readonly cwd?: string
  readonly stdout?: (message: string) => void
  readonly stderr?: (message: string) => void
}

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

export async function runCli(argv: string[], options: CliOptions = {}): Promise<number> {
  const [command] = argv
  const stdout = options.stdout ?? console.log
  const stderr = options.stderr ?? console.error

  if (!command || HELP_FLAGS.has(command)) {
    stdout(formatHelp())
    return 0
  }

  if (!PLACEHOLDER_COMMANDS.has(command)) {
    stderr(formatUnknownCommand(command))
    return 1
  }

  if (command === "agents") {
    stdout(await runAgentsCommand(options.cwd === undefined ? {} : { cwd: options.cwd }))
    return 0
  }

  stdout(
    [
      `Command '${command}' is planned but not implemented yet.`,
      "See ORCHESTRA_PLAN.md for the current phase and slice checklist.",
    ].join("\n"),
  )
  return 0
}

if (import.meta.main) {
  runCli(process.argv.slice(2)).then(
    (exitCode) => {
      process.exitCode = exitCode
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    },
  )
}
