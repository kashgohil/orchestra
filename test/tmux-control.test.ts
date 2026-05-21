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
} from "../src/core"
import {
  attachTaskSession,
  getAttachTaskSessionCommand,
  stopTaskSession,
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

describe("tmux attach and stop", () => {
  test("builds an attach command for the selected task session", () => {
    const task = createTestTask()

    expect(getAttachTaskSessionCommand(task)).toEqual([
      "tmux",
      "attach-session",
      "-t",
      task.tmuxSessionName,
    ])
  })

  test("runs attach against only the selected managed session", () => {
    const task = createTestTask()
    const executor = scriptedTmuxExecutor({
      [`attach-session -t ${task.tmuxSessionName}`]: 0,
    })

    attachTaskSession(task, executor)

    expect(executor.calls).toEqual([["attach-session", "-t", task.tmuxSessionName]])
  })

  test("kills only the selected managed session and marks the task stopped", () => {
    const task = createTestTask()
    const store = new FakeTaskSessionStore(task)
    const executor = scriptedTmuxExecutor({
      [`has-session -t ${task.tmuxSessionName}`]: 0,
      [`kill-session -t ${task.tmuxSessionName}`]: 0,
    })

    const result = stopTaskSession({
      task,
      store,
      executor,
      now: fixedClock(),
    })

    expect(result.killed).toBe(true)
    expect(result.task.status).toBe("stopped")
    expect(executor.calls).toEqual([
      ["has-session", "-t", task.tmuxSessionName],
      ["kill-session", "-t", task.tmuxSessionName],
    ])
    expect(store.events[0]?.type).toBe("task.stopped")
    expect(readTaskEventLog(result.task)).toEqual(store.events)
  })

  test("marks missing sessions stopped without killing unrelated sessions", () => {
    const task = createTestTask()
    const store = new FakeTaskSessionStore(task)
    const executor = scriptedTmuxExecutor({
      [`has-session -t ${task.tmuxSessionName}`]: 1,
    })

    const result = stopTaskSession({
      task,
      store,
      executor,
      now: fixedClock(),
    })

    expect(result.killed).toBe(false)
    expect(result.task.status).toBe("stopped")
    expect(result.task.failureReason).toBe("tmux session was not running.")
    expect(executor.calls).toEqual([["has-session", "-t", task.tmuxSessionName]])
    expect(store.events[0]?.level).toBe("warn")
  })
})

class FakeTaskSessionStore implements TaskSessionStore {
  task: Task
  readonly events: TaskEvent[] = []

  constructor(task: Task) {
    this.task = task
  }

  updateTask(_taskId: TaskId, input: TaskStatusUpdate): Task {
    const nextTask = {
      ...this.task,
      status: input.status ?? this.task.status,
      updatedAt: input.updatedAt ?? this.task.updatedAt,
    }

    this.task =
      input.failureReason === undefined
        ? nextTask
        : input.failureReason === null
          ? removeFailureReason(nextTask)
          : {
              ...nextTask,
              failureReason: input.failureReason,
            }

    return this.task
  }

  appendTaskEvent(event: TaskEvent): TaskEvent {
    this.events.push(event)

    return event
  }
}

function removeFailureReason(task: Task): Task {
  const { failureReason: _failureReason, ...taskWithoutFailureReason } = task

  return taskWithoutFailureReason
}

function scriptedTmuxExecutor(results: Record<string, 0 | 1>): TmuxCommandExecutor & {
  readonly calls: readonly (readonly string[])[]
} {
  const calls: (readonly string[])[] = []

  return {
    calls,
    run(args: readonly string[]) {
      calls.push(args)
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

function createTestTask(): Task {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orchestra-tmux-control-"))
  tempRoots.push(repoRoot)

  const taskId = "task-20260522-100000-control"
  const prompt = "Control tmux"

  return {
    id: taskId,
    repoId: "repo-1",
    kind: "run",
    agentId: "codex",
    status: "running",
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
