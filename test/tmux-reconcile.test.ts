import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import {
  createTaskBranchName,
  createTmuxSessionName,
  getTaskArtifactDir,
  getTaskWorktreePath,
  readTaskEventLog,
  type Task,
  type TaskEvent,
  type TaskId,
  type TaskStatus,
} from "../src/core"
import {
  reconcileTaskSessions,
  type TaskSessionStore,
  type TaskStatusUpdate,
  type TmuxCommandExecutor,
} from "../src/tmux"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("tmux session reconciliation", () => {
  test("marks running tasks failed when their tmux session is missing", () => {
    const runningTask = createTestTask("running", "running")
    const store = new FakeTaskSessionStore([runningTask])
    const result = reconcileTaskSessions({
      tasks: [runningTask],
      store,
      executor: scriptedTmuxExecutor({
        [`has-session -t ${runningTask.tmuxSessionName}`]: 1,
      }),
      now: fixedClock(),
    })

    expect(result).toEqual([
      {
        taskId: runningTask.id,
        previousStatus: "running",
        nextStatus: "failed",
        changed: true,
        reason: "tmux session is no longer alive.",
      },
    ])
    expect(store.requireTask(runningTask.id).status).toBe("failed")
    expect(store.requireTask(runningTask.id).failureReason).toBe("tmux session is no longer alive.")
    expect(store.events[0]?.type).toBe("task.failed")
    expect(readTaskEventLog(store.requireTask(runningTask.id))).toEqual(store.events)
  })

  test("does not mutate running tasks with live sessions", () => {
    const runningTask = createTestTask("running", "live")
    const store = new FakeTaskSessionStore([runningTask])
    const result = reconcileTaskSessions({
      tasks: [runningTask],
      store,
      executor: scriptedTmuxExecutor({
        [`has-session -t ${runningTask.tmuxSessionName}`]: 0,
      }),
      now: fixedClock(),
    })

    expect(result).toEqual([
      {
        taskId: runningTask.id,
        previousStatus: "running",
        nextStatus: "running",
        changed: false,
      },
    ])
    expect(store.events).toEqual([])
  })

  test("does not mutate completed, merged, stopped, failed, or queued tasks", () => {
    const tasks = [
      createTestTask("completed", "completed"),
      createTestTask("merged", "merged"),
      createTestTask("stopped", "stopped"),
      createTestTask("failed", "failed"),
      createTestTask("queued", "queued"),
    ]
    const store = new FakeTaskSessionStore(tasks)
    const result = reconcileTaskSessions({
      tasks,
      store,
      executor: scriptedTmuxExecutor({}),
      now: fixedClock(),
    })

    expect(result.map((item) => item.changed)).toEqual([false, false, false, false, false])
    expect(store.events).toEqual([])
    expect(tasks.map((task) => store.requireTask(task.id).status)).toEqual([
      "completed",
      "merged",
      "stopped",
      "failed",
      "queued",
    ])
  })
})

class FakeTaskSessionStore implements TaskSessionStore {
  readonly tasks = new Map<string, Task>()
  readonly events: TaskEvent[] = []

  constructor(tasks: readonly Task[]) {
    for (const task of tasks) {
      this.tasks.set(task.id, task)
    }
  }

  requireTask(taskId: TaskId): Task {
    const task = this.tasks.get(taskId)

    if (task === undefined) {
      throw new Error(`Missing test task ${taskId}`)
    }

    return task
  }

  updateTask(taskId: TaskId, input: TaskStatusUpdate): Task {
    const currentTask = this.requireTask(taskId)
    const nextTask = {
      ...currentTask,
      status: input.status ?? currentTask.status,
      updatedAt: input.updatedAt ?? currentTask.updatedAt,
      ...(input.failureReason === undefined ? {} : { failureReason: input.failureReason ?? "" }),
    }

    this.tasks.set(taskId, nextTask)

    return nextTask
  }

  appendTaskEvent(event: TaskEvent): TaskEvent {
    this.events.push(event)

    return event
  }
}

function scriptedTmuxExecutor(results: Record<string, 0 | 1>): TmuxCommandExecutor {
  return {
    run(args: readonly string[]) {
      const key = args.join(" ")
      const exitCode = results[key] ?? 99

      return {
        exitCode,
        stdout: "",
        stderr: exitCode === 0 ? "" : `tmux failed: ${key}`,
      }
    },
  }
}

function fixedClock(): () => Date {
  return () => new Date("2026-05-22T10:00:00.000Z")
}

function createTestTask(status: TaskStatus, suffix: string): Task {
  const repoRoot = mkdtempSync(path.join(tmpdir(), `orchestra-tmux-reconcile-${suffix}-`))
  tempRoots.push(repoRoot)

  const taskId = `task-20260522-100000-reconcile-${suffix}`
  const prompt = "Reconcile tmux"

  return {
    id: taskId,
    repoId: "repo-1",
    kind: "run",
    agentId: "codex",
    status,
    prompt,
    sourceRepoPath: repoRoot,
    sourceBranch: "main",
    baseCommit: "0123456789abcdef",
    taskBranch: createTaskBranchName({ taskId, prompt }),
    worktreePath: getTaskWorktreePath(repoRoot, taskId),
    tmuxSessionName: createTmuxSessionName(taskId),
    artifactPath: getTaskArtifactDir(repoRoot, taskId),
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  }
}
