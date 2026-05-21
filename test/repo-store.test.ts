import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import {
  createTaskBranchName,
  createTaskId,
  createTmuxSessionName,
  getRepoStorePath,
  getTaskArtifactDir,
  getTaskWorktreePath,
  type Task,
  type TaskEvent,
} from "../src/core"
import { openRepoStore, RepoStore } from "../src/store"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("RepoStore", () => {
  test("initializes the per-repo sqlite database idempotently", () => {
    const repoRoot = createTempRepoRoot()

    const firstStore = openRepoStore(repoRoot)
    expect(firstStore.dbPath).toBe(getRepoStorePath(repoRoot))
    expect(firstStore.getAppliedMigrationVersions()).toEqual([1])
    firstStore.initialize()
    expect(firstStore.getAppliedMigrationVersions()).toEqual([1])
    firstStore.close()

    const secondStore = openRepoStore(repoRoot)
    expect(secondStore.getAppliedMigrationVersions()).toEqual([1])
    secondStore.close()
  })

  test("creates, reads, updates, and lists tasks", () => {
    const repoRoot = createTempRepoRoot()
    const store = openRepoStore(repoRoot)
    const firstTask = createTestTask(repoRoot, "task-20260521-100000-first", "Fix auth tests")
    const secondTask = createTestTask(repoRoot, "task-20260521-100001-second", "Review billing retry")

    store.createTask(firstTask)
    store.createTask(secondTask)

    expect(store.getTask(firstTask.id)).toEqual(firstTask)
    expect(store.listTasks().map((task) => task.id)).toEqual([secondTask.id, firstTask.id])

    const updatedTask = store.updateTask(firstTask.id, {
      status: "running",
      updatedAt: "2026-05-21T10:03:00.000Z",
    })

    expect(updatedTask.status).toBe("running")
    expect(updatedTask.updatedAt).toBe("2026-05-21T10:03:00.000Z")
    expect(store.getTask("missing-task")).toBeNull()
    store.close()
  })

  test("persists tasks after reopening the database", () => {
    const repoRoot = createTempRepoRoot()
    const task = createTestTask(repoRoot, createTaskId({ now: new Date("2026-05-21T10:00:00Z"), token: "persist" }), "Persist state")

    const firstStore = openRepoStore(repoRoot)
    firstStore.createTask(task)
    firstStore.close()

    const secondStore = openRepoStore(repoRoot)
    expect(secondStore.getTask(task.id)).toEqual(task)
    secondStore.close()
  })

  test("appends and lists task events with structured data", () => {
    const repoRoot = createTempRepoRoot()
    const store = openRepoStore(repoRoot)
    const task = createTestTask(repoRoot, "task-20260521-100000-events", "Collect events")
    const event: TaskEvent = {
      id: "event-1",
      taskId: task.id,
      type: "task.created",
      level: "info",
      message: "Task created.",
      data: {
        agentId: "codex",
        attempt: 1,
      },
      createdAt: "2026-05-21T10:00:01.000Z",
    }

    store.createTask(task)
    store.appendTaskEvent(event)

    expect(store.listTaskEvents(task.id)).toEqual([event])
    expect(store.listTaskEvents("missing-task")).toEqual([])
    store.close()
  })

  test("throws a typed error when updating a missing task", () => {
    const repoRoot = createTempRepoRoot()
    const store = openRepoStore(repoRoot)

    expect(() => store.updateTask("missing-task", { status: "running" })).toThrow("Task 'missing-task' was not found.")
    store.close()
  })
})

function createTempRepoRoot(): string {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "orchestra-repo-store-"))
  tempRoots.push(tempRoot)

  return tempRoot
}

function createTestTask(repoRoot: string, taskId: string, prompt: string): Task {
  return {
    id: taskId,
    repoId: "repo-1",
    kind: "run",
    agentId: "codex",
    status: "queued",
    prompt,
    sourceRepoPath: repoRoot,
    sourceBranch: "main",
    baseCommit: "0123456789abcdef",
    taskBranch: createTaskBranchName({ taskId, prompt }),
    worktreePath: getTaskWorktreePath(repoRoot, taskId),
    tmuxSessionName: createTmuxSessionName(taskId),
    artifactPath: getTaskArtifactDir(repoRoot, taskId),
    createdAt: taskId.includes("second")
      ? "2026-05-21T10:01:00.000Z"
      : "2026-05-21T10:00:00.000Z",
    updatedAt: taskId.includes("second")
      ? "2026-05-21T10:01:00.000Z"
      : "2026-05-21T10:00:00.000Z",
  }
}
