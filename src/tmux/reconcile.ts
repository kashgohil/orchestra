import { appendTaskEventLog } from "../core/artifact-service"
import { createTaskEvent } from "../core/task-events"
import type { Task } from "../core/types"
import { type TmuxCommandExecutor } from "./command"
import { isTmuxSessionAlive } from "./session"
import type { TaskSessionStore } from "./runner"

export interface ReconcileTaskSessionsInput {
  readonly tasks: readonly Task[]
  readonly store: TaskSessionStore
  readonly executor?: TmuxCommandExecutor
  readonly now?: () => Date
}

export interface ReconciledTaskSession {
  readonly taskId: string
  readonly previousStatus: Task["status"]
  readonly nextStatus: Task["status"]
  readonly changed: boolean
  readonly reason?: string
}

export function reconcileTaskSessions(
  input: ReconcileTaskSessionsInput,
): readonly ReconciledTaskSession[] {
  return input.tasks.map((task) => reconcileTaskSession({ ...input, task }))
}

function reconcileTaskSession(
  input: ReconcileTaskSessionsInput & { readonly task: Task },
): ReconciledTaskSession {
  const now = input.now ?? (() => new Date())
  const task = input.task

  if (task.status !== "starting" && task.status !== "running") {
    return {
      taskId: task.id,
      previousStatus: task.status,
      nextStatus: task.status,
      changed: false,
    }
  }

  if (isTmuxSessionAlive(task.tmuxSessionName, input.executor)) {
    return {
      taskId: task.id,
      previousStatus: task.status,
      nextStatus: task.status,
      changed: false,
    }
  }

  const reason = "tmux session is no longer alive."
  const failedTask = input.store.updateTask(task.id, {
    status: "failed",
    updatedAt: now().toISOString(),
    failureReason: reason,
  })
  const event = createTaskEvent({
    task: failedTask,
    type: "task.failed",
    level: "warn",
    message: "Marked task failed because tmux session is missing.",
    data: {
      sessionName: task.tmuxSessionName,
      previousStatus: task.status,
      reason,
    },
    now,
  })

  input.store.appendTaskEvent(event)
  appendTaskEventLog(failedTask, event)

  return {
    taskId: task.id,
    previousStatus: task.status,
    nextStatus: "failed",
    changed: true,
    reason,
  }
}
