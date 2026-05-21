import { randomUUID } from "node:crypto"

import type { JsonObject, Task, TaskEvent } from "./types"

export interface CreateTaskEventInput {
  readonly task: Task
  readonly type: TaskEvent["type"]
  readonly level: TaskEvent["level"]
  readonly message: string
  readonly data?: JsonObject
  readonly now?: () => Date
}

export function createTaskEvent(input: CreateTaskEventInput): TaskEvent {
  const now = input.now ?? (() => new Date())

  return {
    id: `event-${randomUUID()}`,
    taskId: input.task.id,
    type: input.type,
    level: input.level,
    message: input.message,
    ...(input.data === undefined ? {} : { data: input.data }),
    createdAt: now().toISOString(),
  }
}
