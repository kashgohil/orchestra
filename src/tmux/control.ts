import { appendTaskEventLog } from "../core/artifact-service"
import { createTaskEvent } from "../core/task-events"
import type { Task } from "../core/types"
import { runTmuxCommand, type TmuxCommandExecutor } from "./command"
import { assertManagedTmuxSessionName, isTmuxSessionAlive } from "./session"
import type { TaskSessionStore } from "./runner"

export interface StopTaskSessionInput {
  readonly task: Task
  readonly store: TaskSessionStore
  readonly executor?: TmuxCommandExecutor
  readonly now?: () => Date
}

export interface StopTaskSessionResult {
  readonly task: Task
  readonly sessionName: string
  readonly killed: boolean
}

export function getAttachTaskSessionCommand(task: Pick<Task, "tmuxSessionName">): readonly string[] {
  assertManagedTmuxSessionName(task.tmuxSessionName)

  return ["tmux", "attach-session", "-t", task.tmuxSessionName]
}

export function attachTaskSession(
  task: Pick<Task, "tmuxSessionName">,
  executor: TmuxCommandExecutor,
): void {
  assertManagedTmuxSessionName(task.tmuxSessionName)
  runTmuxCommand(["attach-session", "-t", task.tmuxSessionName], executor)
}

export function stopTaskSession(input: StopTaskSessionInput): StopTaskSessionResult {
  const now = input.now ?? (() => new Date())
  const sessionName = input.task.tmuxSessionName
  assertManagedTmuxSessionName(sessionName)

  const alive = isTmuxSessionAlive(sessionName, input.executor)

  if (alive) {
    runTmuxCommand(["kill-session", "-t", sessionName], input.executor)
  }

  const stoppedTask = input.store.updateTask(input.task.id, {
    status: "stopped",
    updatedAt: now().toISOString(),
    ...(alive ? {} : { failureReason: "tmux session was not running." }),
  })
  const event = createTaskEvent({
    task: stoppedTask,
    type: "task.stopped",
    level: alive ? "info" : "warn",
    message: alive ? "Stopped tmux session." : "Marked task stopped because tmux session was not running.",
    data: {
      sessionName,
      killed: alive,
    },
    now,
  })

  input.store.appendTaskEvent(event)
  appendTaskEventLog(stoppedTask, event)

  return {
    task: stoppedTask,
    sessionName,
    killed: alive,
  }
}
