import { getCurrentRepoTaskStatus, type OrchestraRuntimeContext, type Task } from "../core"
import { formatTable, truncate } from "./table"

export interface StatusCommandOptions extends OrchestraRuntimeContext {
  readonly json?: boolean
}

export function runStatusCommand(options: StatusCommandOptions = {}): string {
  const result = getCurrentRepoTaskStatus(options)

  if (options.json === true) {
    return JSON.stringify(result, null, 2)
  }

  if (result.tasks.length === 0) {
    return [`Repo: ${result.repo.rootPath}`, "No tasks found."].join("\n")
  }

  return [
    `Repo: ${result.repo.rootPath}`,
    "",
    formatTable(result.tasks, [
      {
        header: "task",
        value: (task) => task.id,
      },
      {
        header: "parent",
        value: (task) => task.parentTaskId ?? "-",
      },
      {
        header: "children",
        value: (task) => formatChildTaskIds(task, result.tasks),
      },
      {
        header: "status",
        value: (task) => task.status,
      },
      {
        header: "agent",
        value: (task) => String(task.agentId),
      },
      {
        header: "kind",
        value: (task) => task.kind,
      },
      {
        header: "updated",
        value: (task) => task.updatedAt,
      },
      {
        header: "prompt",
        value: (task: Task) => truncate(task.prompt.replace(/\s+/g, " "), 56),
      },
    ]),
  ].join("\n")
}

function formatChildTaskIds(task: Task, tasks: readonly Task[]): string {
  const childTaskIds = tasks.filter((candidate) => candidate.parentTaskId === task.id).map((child) => child.id)

  return childTaskIds.length === 0 ? "-" : truncate(childTaskIds.join(","), 48)
}
