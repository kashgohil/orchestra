import { getTaskDiff, getTaskLogs, OrchestraError, startRunTask, type OrchestraRuntimeContext } from "../core"
import { hasFlag, readFlag, requirePositional, type ParsedArgs } from "./args"

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
