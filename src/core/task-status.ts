import { OrchestraError } from "./errors"
import { TASK_STATUSES, type TaskStatus } from "./types"

const TASK_STATUS_SET = new Set<string>(TASK_STATUSES)

const TASK_STATUS_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  queued: ["starting", "stopped", "failed"],
  starting: ["running", "stopped", "failed"],
  running: ["completed", "stopped", "failed"],
  stopped: ["starting"],
  failed: ["starting"],
  completed: ["merged"],
  merged: [],
}

export const ACTIVE_TASK_STATUSES = ["queued", "starting", "running"] as const satisfies readonly TaskStatus[]
export const INACTIVE_TASK_STATUSES = [
  "stopped",
  "failed",
  "completed",
  "merged",
] as const satisfies readonly TaskStatus[]

const ACTIVE_TASK_STATUS_SET = new Set<TaskStatus>(ACTIVE_TASK_STATUSES)
const INACTIVE_TASK_STATUS_SET = new Set<TaskStatus>(INACTIVE_TASK_STATUSES)

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUS_SET.has(value)
}

export function getAllowedTaskStatusTransitions(status: TaskStatus): readonly TaskStatus[] {
  return TASK_STATUS_TRANSITIONS[status]
}

export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || TASK_STATUS_TRANSITIONS[from].includes(to)
}

export function assertTaskStatusTransition(from: TaskStatus, to: TaskStatus): void {
  if (canTransitionTaskStatus(from, to)) {
    return
  }

  throw new OrchestraError(
    "INVALID_STATUS_TRANSITION",
    `Cannot transition task status from '${from}' to '${to}'.`,
    {
      hint: `Allowed next statuses: ${TASK_STATUS_TRANSITIONS[from].join(", ") || "none"}.`,
    },
  )
}

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return ACTIVE_TASK_STATUS_SET.has(status)
}

export function isInactiveTaskStatus(status: TaskStatus): boolean {
  return INACTIVE_TASK_STATUS_SET.has(status)
}
