import { existsSync } from "node:fs"

import { getCurrentRepoTaskStatus, getTaskLogs, type Task, type TaskId } from "../core"
import { getWorktreeChangedFiles } from "../git"
import type { TuiRuntimeContext, TuiState, TuiTaskDetail } from "./types"

export interface LoadTuiStateOptions extends TuiRuntimeContext {
  readonly selectedTaskId?: TaskId
  readonly now?: () => Date
}

export function loadTuiState(options: LoadTuiStateOptions = {}): TuiState {
  const now = options.now ?? (() => new Date())

  try {
    const status = getCurrentRepoTaskStatus(options)
    const selectedTask = selectTask(status.tasks, options.selectedTaskId)

    return {
      repo: {
        rootPath: status.repoInfo.rootPath,
        currentBranch: status.repoInfo.currentBranch,
        headCommit: status.repoInfo.headCommit,
      },
      tasks: status.tasks,
      ...(selectedTask === undefined ? {} : { selectedTaskId: selectedTask.id }),
      ...(selectedTask === undefined ? {} : { detail: loadTaskDetail(selectedTask, options) }),
      loadedAt: now().toISOString(),
    }
  } catch (error) {
    return {
      tasks: [],
      error: error instanceof Error ? error.message : String(error),
      loadedAt: now().toISOString(),
    }
  }
}

export function selectTask(tasks: readonly Task[], selectedTaskId: TaskId | undefined): Task | undefined {
  return (
    tasks.find((task) => task.id === selectedTaskId) ??
    tasks.find((task) => task.status === "running" || task.status === "starting") ??
    tasks[0]
  )
}

export function selectAdjacentTaskId(
  tasks: readonly Task[],
  selectedTaskId: TaskId | undefined,
  direction: "previous" | "next",
): TaskId | undefined {
  if (tasks.length === 0) {
    return undefined
  }

  const selectedIndex = Math.max(
    0,
    tasks.findIndex((task) => task.id === selectedTaskId),
  )
  const delta = direction === "previous" ? -1 : 1
  const nextIndex = (selectedIndex + delta + tasks.length) % tasks.length

  return tasks[nextIndex]?.id
}

export function tailLines(value: string, maxLines: number): string {
  const lines = value.replace(/\n$/g, "").split("\n")

  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n")
}

function loadTaskDetail(task: Task, context: TuiRuntimeContext): TuiTaskDetail {
  try {
    const logs = getTaskLogs(task.id, context)

    return {
      task,
      events: logs.events.slice(-8),
      stdoutTail: tailLines(logs.stdout, 14),
      stderrTail: tailLines(logs.stderr, 8),
      changedFiles: existsSync(task.worktreePath) ? getWorktreeChangedFiles(task.worktreePath) : [],
    }
  } catch (error) {
    return {
      task,
      events: [],
      stdoutTail: "",
      stderrTail: "",
      changedFiles: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
