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
import { parseComposerCommand, TUI_COMMAND_EXAMPLES } from "./parser"
import type { TuiCommandResult, TuiRuntimeContext, TuiViewMode } from "./types"

export type TuiShortcutAction = "open" | "attach" | "diff" | "logs" | "stop" | "merge"

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
        hint: `Try ${TUI_COMMAND_EXAMPLES.map((example) => `\`${example}\``).join(", ")}.`,
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
