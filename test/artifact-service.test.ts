import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import {
  appendTaskEventLog,
  appendTaskOutput,
  createTaskBranchName,
  createTmuxSessionName,
  getTaskArtifactDir,
  getTaskArtifactManifest,
  getTaskWorktreePath,
  initializeTaskArtifacts,
  readTaskEventLog,
  readTaskOutput,
  type Task,
  type TaskEvent,
} from "../src/core"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("artifact service", () => {
  test("creates a consistent artifact directory and standard files", () => {
    const repoRoot = createTempRepoRoot()
    const task = createTestTask(repoRoot)
    const manifest = initializeTaskArtifacts(task)

    expect(manifest).toEqual(getTaskArtifactManifest(task))
    expect(existsSync(manifest.directory)).toBe(true)
    expect(Object.values(manifest.files).every((filePath) => path.isAbsolute(filePath))).toBe(true)
    expect(readFileSync(manifest.files.task, "utf8")).toContain("Fix artifact tests")
    expect(readFileSync(manifest.files.task, "utf8")).toContain(`- Agent: ${task.agentId}`)
    expect(readFileSync(manifest.files.plan, "utf8")).toBe("")
    expect(readFileSync(manifest.files.result, "utf8")).toBe("")
    expect(readFileSync(manifest.files.review, "utf8")).toBe("")
    expect(readFileSync(manifest.files["event-log"], "utf8")).toBe("")
    expect(readFileSync(manifest.files.stdout, "utf8")).toBe("")
    expect(readFileSync(manifest.files.stderr, "utf8")).toBe("")
  })

  test("does not overwrite agent-editable placeholder artifacts", () => {
    const repoRoot = createTempRepoRoot()
    const task = createTestTask(repoRoot)
    const manifest = initializeTaskArtifacts(task)

    writeFileSync(manifest.files.plan, "Keep this plan.\n", "utf8")
    writeFileSync(manifest.files.result, "Keep this result.\n", "utf8")
    writeFileSync(manifest.files.review, "Keep this review.\n", "utf8")

    initializeTaskArtifacts(task)

    expect(readFileSync(manifest.files.plan, "utf8")).toBe("Keep this plan.\n")
    expect(readFileSync(manifest.files.result, "utf8")).toBe("Keep this result.\n")
    expect(readFileSync(manifest.files.review, "utf8")).toBe("Keep this review.\n")
  })

  test("appends parseable JSONL task events", () => {
    const repoRoot = createTempRepoRoot()
    const task = createTestTask(repoRoot)
    const firstEvent = createTestEvent(task, "event-1", "task.created")
    const secondEvent = createTestEvent(task, "event-2", "task.started")

    initializeTaskArtifacts(task)
    appendTaskEventLog(task, firstEvent)
    appendTaskEventLog(task, secondEvent)

    const eventLogPath = getTaskArtifactManifest(task).files["event-log"]
    const eventLines = readFileSync(eventLogPath, "utf8").trim().split("\n")

    expect(eventLines).toHaveLength(2)
    expect(eventLines.map((line) => JSON.parse(line))).toEqual([firstEvent, secondEvent])
    expect(readTaskEventLog(task)).toEqual([firstEvent, secondEvent])
  })

  test("appends stdout and stderr logs without modifying the opposite stream", () => {
    const repoRoot = createTempRepoRoot()
    const task = createTestTask(repoRoot)

    initializeTaskArtifacts(task)
    appendTaskOutput(task, "stdout", "hello stdout\n")
    appendTaskOutput(task, "stderr", "hello stderr\n")
    appendTaskOutput(task, "stdout", "more stdout\n")

    expect(readTaskOutput(task, "stdout")).toBe("hello stdout\nmore stdout\n")
    expect(readTaskOutput(task, "stderr")).toBe("hello stderr\n")
  })

  test("returns empty logs when optional log files do not exist yet", () => {
    const repoRoot = createTempRepoRoot()
    const task = createTestTask(repoRoot)

    expect(readTaskEventLog(task)).toEqual([])
    expect(readTaskOutput(task, "stdout")).toBe("")
    expect(readTaskOutput(task, "stderr")).toBe("")
  })
})

function createTempRepoRoot(): string {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "orchestra-artifacts-"))
  tempRoots.push(tempRoot)

  return tempRoot
}

function createTestTask(repoRoot: string): Task {
  const taskId = "task-20260522-100000-artifacts"
  const prompt = "Fix artifact tests"

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
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  }
}

function createTestEvent(task: Task, id: string, type: TaskEvent["type"]): TaskEvent {
  return {
    id,
    taskId: task.id,
    type,
    level: "info",
    message: `${type} event`,
    data: {
      agentId: task.agentId,
    },
    createdAt: "2026-05-22T10:00:01.000Z",
  }
}
