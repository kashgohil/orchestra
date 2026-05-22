import { runAgentsCommand } from "../cli/agents"
import { parseArgs, type ParsedArgs } from "../cli/args"
import { formatCliError } from "../cli/errors"
import { runInitCommand } from "../cli/init"
import { runStatusCommand } from "../cli/status"
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
} from "../cli/tasks"
import { OrchestraError, type TaskId } from "../core"
import type { TuiCommandResult, TuiRuntimeContext, TuiViewMode } from "./types"

export type TuiShortcutAction = "open" | "attach" | "diff" | "logs" | "stop" | "merge"

export function parseComposerCommand(input: string): readonly string[] {
  const trimmed = input.trim()

  if (trimmed.length === 0) {
    return []
  }

  const normalized = trimmed.startsWith("/") ? trimmed.slice(1) : trimOrchestraPrefix(trimmed)

  return splitCommandLine(normalized)
}

export async function executeTuiCommand(
  input: string,
  context: TuiRuntimeContext = {},
): Promise<TuiCommandResult> {
  const [command, ...rawArgs] = parseComposerCommand(input)

  if (command === undefined) {
    return {
      ok: false,
      message: "Enter a command.",
    }
  }

  try {
    const args = parseArgs(rawArgs)
    const message = await executeCommand(command, args, context)
    const viewMode = viewModeFor(command)

    return {
      ok: true,
      message,
      refresh: shouldRefresh(command),
      ...(viewMode === undefined ? {} : { viewMode }),
    }
  } catch (error) {
    return {
      ok: false,
      message: formatCliError(error),
    }
  }
}

export function commandForShortcut(action: TuiShortcutAction, selectedTaskId: TaskId | undefined): string {
  if (selectedTaskId === undefined) {
    return ""
  }

  switch (action) {
    case "open":
      return `logs ${selectedTaskId} --events`
    case "attach":
      return `attach ${selectedTaskId}`
    case "diff":
      return `diff ${selectedTaskId}`
    case "logs":
      return `logs ${selectedTaskId}`
    case "stop":
      return `stop ${selectedTaskId}`
    case "merge":
      return `merge ${selectedTaskId}`
  }
}

async function executeCommand(
  command: string,
  args: ParsedArgs,
  context: TuiRuntimeContext,
): Promise<string> {
  switch (command) {
    case "init":
      return runInitCommand(context)
    case "agents":
      return runAgentsCommand({
        ...(context.cwd === undefined ? {} : { cwd: context.cwd }),
      })
    case "status":
      return runStatusCommand(context)
    case "run":
      return runTaskCommand(args, context)
    case "logs":
      return runLogsCommand(args, context)
    case "diff":
      return runDiffCommand(args, context)
    case "attach":
      return runAttachCommand(args, context)
    case "stop":
      return runStopCommand(args, context)
    case "cleanup":
      return runCleanupCommand(args, context)
    case "review":
      return runReviewCommand(args, context)
    case "continue":
      return runContinueCommand(args, context)
    case "merge":
      return runMergeCommand(args, context)
    default:
      throw new OrchestraError("CONFIG_INVALID", `Unknown TUI command '${command}'.`, {
        hint: "Use commands like `/run fix tests --agent codex`, `/logs <task-id>`, `/diff <task-id>`, `/stop <task-id>`, or `/merge <task-id>`.",
      })
  }
}

function shouldRefresh(command: string): boolean {
  return new Set(["init", "run", "stop", "cleanup", "review", "continue", "merge"]).has(command)
}

function viewModeFor(command: string): TuiViewMode | undefined {
  if (command === "diff") {
    return "diff"
  }

  if (command === "logs") {
    return "logs"
  }

  return undefined
}

function trimOrchestraPrefix(input: string): string {
  return input.startsWith("orchestra ") ? input.slice("orchestra ".length).trimStart() : input
}

function splitCommandLine(input: string): readonly string[] {
  const args: string[] = []
  let current = ""
  let quote: "'" | '"' | undefined
  let escaped = false

  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current)
        current = ""
      }
      continue
    }

    current += char
  }

  if (escaped) {
    current += "\\"
  }

  if (current.length > 0) {
    args.push(current)
  }

  return args
}
