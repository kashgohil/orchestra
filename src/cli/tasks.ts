import {
  attachToTask,
  cleanupTasks,
  getTaskDiff,
  getTaskLogs,
  mergeTask,
  OrchestraError,
  startContinueTask,
  startReviewTask,
  startRunTask,
  stopTask,
  type CleanupTaskResult,
  type OrchestraRuntimeContext,
} from "../core"
import { hasFlag, readFlag, requirePositional, type ParsedArgs } from "./args"
import { formatTable } from "./table"

export function runTaskCommand(args: ParsedArgs, context: OrchestraRuntimeContext = {}): string {
  const prompt = args.positionals.join(" ").trim()
  const agentId = readFlag(args, "agent")
  const taskIdToken = readFlag(args, "token")

  if (prompt.length === 0) {
    throw new OrchestraError("CONFIG_INVALID", "Missing required prompt.")
  }

  const result = startRunTask({
    ...context,
    prompt,
    ...(agentId === undefined ? {} : { agentId }),
    ...(taskIdToken === undefined ? {} : { taskIdToken }),
  })

  return [
    "Started task.",
    `Task: ${result.task.id}`,
    `Status: ${result.task.status}`,
    `Agent: ${result.task.agentId}`,
    `Session: ${result.sessionName}`,
    `Worktree: ${result.task.worktreePath}`,
    `Artifacts: ${result.task.artifactPath}`,
  ].join("\n")
}

export function runLogsCommand(args: ParsedArgs, context: OrchestraRuntimeContext = {}): string {
  const taskId = requirePositional(args, 0, "task ID")
  const logs = getTaskLogs(taskId, context)

  if (hasFlag(args, "events")) {
    if (hasFlag(args, "json")) {
      return JSON.stringify(logs.events, null, 2)
    }

    return logs.events.length === 0
      ? `No events for task ${logs.task.id}.`
      : logs.events
          .map((event) => `${event.createdAt}  ${event.level.padEnd(5)}  ${event.type}  ${event.message}`)
          .join("\n")
  }

  const stream = hasFlag(args, "stderr") ? "stderr" : "stdout"
  const output = stream === "stderr" ? logs.stderr : logs.stdout

  return output.length === 0 ? `No ${stream} logs for task ${logs.task.id}.` : output.replace(/\n$/g, "")
}

export function runDiffCommand(args: ParsedArgs, context: OrchestraRuntimeContext = {}): string {
  const taskId = requirePositional(args, 0, "task ID")

  return getTaskDiff(taskId, context).diff.replace(/\n$/g, "")
}

export function runAttachCommand(args: ParsedArgs, context: OrchestraRuntimeContext = {}): string {
  const taskId = requirePositional(args, 0, "task ID")
  const result = attachToTask(taskId, context)

  return [`Attached to task ${result.task.id}.`, `Command: ${result.command.join(" ")}`].join("\n")
}

export function runStopCommand(args: ParsedArgs, context: OrchestraRuntimeContext = {}): string {
  const taskId = requirePositional(args, 0, "task ID")
  const result = stopTask(taskId, context)

  return [
    result.killed ? "Stopped task session." : "Marked task stopped.",
    `Task: ${result.task.id}`,
    `Status: ${result.task.status}`,
    `Session: ${result.sessionName}`,
  ].join("\n")
}

export function runCleanupCommand(args: ParsedArgs, context: OrchestraRuntimeContext = {}): string {
  const results = cleanupTasks(context)

  if (hasFlag(args, "json")) {
    return JSON.stringify(results, null, 2)
  }

  if (results.length === 0) {
    return "No tasks found."
  }

  return formatTable(results, [
    {
      header: "task",
      value: (result) => result.task.id,
    },
    {
      header: "status",
      value: (result) => result.task.status,
    },
    {
      header: "cleanup",
      value: formatCleanupState,
    },
    {
      header: "worktree",
      value: (result) => result.worktreePath,
    },
  ])
}

export function runReviewCommand(args: ParsedArgs, context: OrchestraRuntimeContext = {}): string {
  const parentTaskId = requirePositional(args, 0, "task ID")
  const agentId = readFlag(args, "agent")
  const taskIdToken = readFlag(args, "token")
  const result = startReviewTask({
    ...context,
    parentTaskId,
    ...(agentId === undefined ? {} : { agentId }),
    ...(taskIdToken === undefined ? {} : { taskIdToken }),
  })

  return formatStartedChildTask("Started review task.", result)
}

export function runContinueCommand(args: ParsedArgs, context: OrchestraRuntimeContext = {}): string {
  const parentTaskId = requirePositional(args, 0, "task ID")
  const instruction = args.positionals.slice(1).join(" ").trim()
  const agentId = readFlag(args, "agent")
  const taskIdToken = readFlag(args, "token")

  if (instruction.length === 0) {
    throw new OrchestraError("CONFIG_INVALID", "Missing required continuation instruction.")
  }

  const result = startContinueTask({
    ...context,
    parentTaskId,
    instruction,
    ...(agentId === undefined ? {} : { agentId }),
    ...(taskIdToken === undefined ? {} : { taskIdToken }),
  })

  return formatStartedChildTask("Started continue task.", result)
}

export function runMergeCommand(args: ParsedArgs, context: OrchestraRuntimeContext = {}): string {
  const taskId = requirePositional(args, 0, "task ID")
  const result = mergeTask(taskId, {
    ...context,
    push: hasFlag(args, "push"),
  })

  return [
    "Merged task.",
    `Task: ${result.task.id}`,
    `Status: ${result.task.status}`,
    `Commit: ${result.commitSha}`,
    `Pushed: ${result.pushed ? "yes" : "no"}`,
    ...(result.remote === undefined ? [] : [`Remote: ${result.remote}`]),
    ...(result.branch === undefined ? [] : [`Branch: ${result.branch}`]),
  ].join("\n")
}

function formatCleanupState(result: CleanupTaskResult): string {
  if (result.removed) {
    return "removed"
  }

  return result.reason === undefined ? "skipped" : `skipped: ${result.reason}`
}

function formatStartedChildTask(label: string, result: { readonly task: { readonly id: string; readonly status: string; readonly agentId: string; readonly parentTaskId?: string; readonly worktreePath: string; readonly artifactPath: string }; readonly sessionName: string }): string {
  return [
    label,
    `Task: ${result.task.id}`,
    ...(result.task.parentTaskId === undefined ? [] : [`Parent: ${result.task.parentTaskId}`]),
    `Status: ${result.task.status}`,
    `Agent: ${result.task.agentId}`,
    `Session: ${result.sessionName}`,
    `Worktree: ${result.task.worktreePath}`,
    `Artifacts: ${result.task.artifactPath}`,
  ].join("\n")
}
