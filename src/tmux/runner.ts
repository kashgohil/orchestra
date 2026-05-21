import { randomUUID } from "node:crypto"

import {
  appendTaskEventLog,
  appendTaskOutput,
  getTaskArtifactManifest,
  initializeTaskArtifacts,
} from "../core/artifact-service"
import type { AgentLaunchCommand, JsonObject, Task, TaskEvent, TaskId, TaskStatus } from "../core/types"
import { runTmuxCommand, type TmuxCommandExecutor } from "./command"
import { assertManagedTmuxSessionName } from "./session"
import { shellCommand, shellQuote } from "./shell"

export interface TaskStatusUpdate {
  readonly status?: TaskStatus
  readonly updatedAt?: string
  readonly completedAt?: string | null
  readonly failureReason?: string | null
}

export interface TaskSessionStore {
  updateTask(taskId: TaskId, input: TaskStatusUpdate): Task
  appendTaskEvent(event: TaskEvent): TaskEvent
}

export interface StartTaskSessionInput {
  readonly task: Task
  readonly launchCommand: AgentLaunchCommand
  readonly store: TaskSessionStore
  readonly executor?: TmuxCommandExecutor
  readonly now?: () => Date
}

export interface StartTaskSessionResult {
  readonly task: Task
  readonly sessionName: string
  readonly tmuxArgs: readonly string[]
}

export function startTaskSession(input: StartTaskSessionInput): StartTaskSessionResult {
  const now = input.now ?? (() => new Date())
  const sessionName = input.task.tmuxSessionName
  assertManagedTmuxSessionName(sessionName)
  initializeTaskArtifacts(input.task)

  input.store.updateTask(input.task.id, {
    status: "starting",
    updatedAt: now().toISOString(),
  })

  const tmuxArgs = buildStartSessionArgs(input.task, input.launchCommand)

  try {
    runTmuxCommand(tmuxArgs, input.executor)
  } catch (error) {
    const failedTask = input.store.updateTask(input.task.id, {
      status: "failed",
      updatedAt: now().toISOString(),
      failureReason: error instanceof Error ? error.message : String(error),
    })
    const event = createTaskEvent({
      task: failedTask,
      type: "task.failed",
      level: "error",
      message: "Failed to start tmux session.",
      data: {
        sessionName,
        error: error instanceof Error ? error.message : String(error),
      },
      now,
    })

    input.store.appendTaskEvent(event)
    appendTaskEventLog(failedTask, event)

    throw error
  }

  const runningTask = input.store.updateTask(input.task.id, {
    status: "running",
    updatedAt: now().toISOString(),
  })
  const event = createTaskEvent({
    task: runningTask,
    type: "task.started",
    level: "info",
    message: "Started tmux session.",
    data: {
      sessionName,
      command: input.launchCommand.command,
      args: [...input.launchCommand.args],
      cwd: input.launchCommand.cwd,
    },
    now,
  })

  input.store.appendTaskEvent(event)
  appendTaskEventLog(runningTask, event)
  appendTaskOutput(runningTask, "stdout", `[orchestra] started tmux session ${sessionName}\n`)

  return {
    task: runningTask,
    sessionName,
    tmuxArgs,
  }
}

export function buildStartSessionArgs(
  task: Task,
  launchCommand: AgentLaunchCommand,
): readonly string[] {
  assertManagedTmuxSessionName(task.tmuxSessionName)

  return [
    "new-session",
    "-d",
    "-s",
    task.tmuxSessionName,
    "-c",
    launchCommand.cwd,
    `bash -lc ${shellQuote(buildTaskSessionScript(task, launchCommand))}`,
  ]
}

export function buildTaskSessionScript(task: Task, launchCommand: AgentLaunchCommand): string {
  const artifacts = getTaskArtifactManifest(task)
  const command = shellCommand(launchCommand)

  return [
    "set -o pipefail",
    `echo ${shellQuote(`[orchestra] running task ${task.id}`)}`,
    `${command} > >(tee -a ${shellQuote(artifacts.files.stdout)}) 2> >(tee -a ${shellQuote(
      artifacts.files.stderr,
    )} >&2)`,
    "exit_code=$?",
    `echo ${shellQuote("[orchestra] agent exited with code")} "$exit_code" >> ${shellQuote(
      artifacts.files.stdout,
    )}`,
    "exit $exit_code",
  ].join("\n")
}

function createTaskEvent(input: {
  readonly task: Task
  readonly type: TaskEvent["type"]
  readonly level: TaskEvent["level"]
  readonly message: string
  readonly data?: JsonObject
  readonly now: () => Date
}): TaskEvent {
  return {
    id: `event-${randomUUID()}`,
    taskId: input.task.id,
    type: input.type,
    level: input.level,
    message: input.message,
    ...(input.data === undefined ? {} : { data: input.data }),
    createdAt: input.now().toISOString(),
  }
}
