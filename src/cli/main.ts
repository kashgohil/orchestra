#!/usr/bin/env bun

import { formatHelp, formatUnknownCommand } from "./help"
import { runAgentsCommand } from "./agents"
import { parseArgs, hasFlag } from "./args"
import { formatCliError } from "./errors"
import { runInitCommand } from "./init"
import { runStatusCommand } from "./status"
import {
  runAttachCommand,
  runCleanupCommand,
  runContinueCommand,
  runDiffCommand,
  runLogsCommand,
  runMergeCommand,
  runReviewCommand,
  runStopCommand,
  runTaskCommand,
} from "./tasks"
import type { CommandResolver } from "../agents"
import type { TmuxCommandExecutor } from "../tmux"

export interface CliOptions {
  readonly cwd?: string
  readonly homeDir?: string
  readonly now?: () => Date
  readonly tmuxExecutor?: TmuxCommandExecutor
  readonly commandResolver?: CommandResolver
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
  const [command, ...rawArgs] = argv
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

  try {
    const args = parseArgs(rawArgs)
    const runtimeContext = {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.homeDir === undefined ? {} : { homeDir: options.homeDir }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.tmuxExecutor === undefined ? {} : { tmuxExecutor: options.tmuxExecutor }),
    }

    if (command === "init") {
      stdout(runInitCommand(runtimeContext))
      return 0
    }

    if (command === "agents") {
      stdout(
        await runAgentsCommand({
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          ...(options.commandResolver === undefined ? {} : { commandResolver: options.commandResolver }),
          json: hasFlag(args, "json"),
        }),
      )
      return 0
    }

    if (command === "status") {
      stdout(
        runStatusCommand({
          ...runtimeContext,
          json: hasFlag(args, "json"),
        }),
      )
      return 0
    }

    if (command === "run") {
      stdout(runTaskCommand(args, runtimeContext))
      return 0
    }

    if (command === "logs") {
      stdout(runLogsCommand(args, runtimeContext))
      return 0
    }

    if (command === "diff") {
      stdout(runDiffCommand(args, runtimeContext))
      return 0
    }

    if (command === "attach") {
      stdout(runAttachCommand(args, runtimeContext))
      return 0
    }

    if (command === "stop") {
      stdout(runStopCommand(args, runtimeContext))
      return 0
    }

    if (command === "cleanup") {
      stdout(runCleanupCommand(args, runtimeContext))
      return 0
    }

    if (command === "review") {
      stdout(runReviewCommand(args, runtimeContext))
      return 0
    }

    if (command === "continue") {
      stdout(runContinueCommand(args, runtimeContext))
      return 0
    }

    if (command === "merge") {
      stdout(runMergeCommand(args, runtimeContext))
      return 0
    }
  } catch (error) {
    stderr(formatCliError(error))
    return 1
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
