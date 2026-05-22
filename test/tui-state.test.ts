import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import {
  createTaskBranchName,
  createTmuxSessionName,
  getRepoId,
  getTaskArtifactDir,
  getTaskWorktreePath,
  type Task,
} from "../src/core"
import { openRepoStore } from "../src/store"
import { loadTuiState, selectAdjacentTaskId, tailLines } from "../src/tui"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("TUI state", () => {
  test("loads an empty repo without requiring tasks", () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-tui-home-")
    const state = loadTuiState({
      cwd: repoRoot,
      homeDir,
      now: fixedClock(),
    })

    expect(state.error).toBeUndefined()
    expect(state.repo?.rootPath).toBe(repoRoot)
    expect(state.tasks).toEqual([])
    expect(state.loadedAt).toBe("2026-05-22T10:00:00.000Z")
  })

  test("loads selected task details from the repo store", () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-tui-home-")
    const task = createTestTask(repoRoot, "task-20260522-100000-tui", "Render TUI state")
    const store = openRepoStore(repoRoot)

    store.createTask(task)
    store.appendTaskEvent({
      id: "event-1",
      taskId: task.id,
      type: "task.created",
      level: "info",
      message: "Created task.",
      createdAt: "2026-05-22T10:00:00.000Z",
    })
    store.close()

    const state = loadTuiState({
      cwd: repoRoot,
      homeDir,
      selectedTaskId: task.id,
      now: fixedClock(),
    })

    expect(state.selectedTaskId).toBe(task.id)
    expect(state.detail?.events.map((event) => event.type)).toEqual(["task.created"])
  })

  test("selects adjacent tasks and tails log output", () => {
    const tasks = [
      { id: "task-1" },
      { id: "task-2" },
      { id: "task-3" },
    ] as unknown as readonly Task[]

    expect(selectAdjacentTaskId(tasks, "task-2", "next")).toBe("task-3")
    expect(selectAdjacentTaskId(tasks, "task-1", "previous")).toBe("task-3")
    expect(tailLines("a\nb\nc\nd\n", 2)).toBe("c\nd")
  })
})

function fixedClock(): () => Date {
  return () => new Date("2026-05-22T10:00:00.000Z")
}

function createTestTask(repoRoot: string, taskId: string, prompt: string): Task {
  return {
    id: taskId,
    repoId: getRepoId(repoRoot),
    kind: "run",
    agentId: "codex",
    status: "stopped",
    prompt,
    sourceRepoPath: repoRoot,
    sourceBranch: "main",
    baseCommit: runGitText(["rev-parse", "HEAD"], repoRoot),
    taskBranch: createTaskBranchName({ taskId, prompt }),
    worktreePath: getTaskWorktreePath(repoRoot, taskId),
    tmuxSessionName: createTmuxSessionName(taskId),
    artifactPath: getTaskArtifactDir(repoRoot, taskId),
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  }
}

function createGitRepo(): string {
  const repoRoot = createTempDir("orchestra-tui-state-")

  runGit(["init", "--initial-branch=main"], repoRoot)
  runGit(["config", "user.name", "Orchestra Test"], repoRoot)
  runGit(["config", "user.email", "orchestra@example.test"], repoRoot)
  writeFileSync(path.join(repoRoot, "README.md"), "# Test Repo\n", "utf8")
  runGit(["add", "README.md"], repoRoot)
  runGit(["commit", "-m", "Initial commit"], repoRoot)

  return repoRoot
}

function createTempDir(prefix: string): string {
  const tempRoot = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)))
  tempRoots.push(tempRoot)

  return tempRoot
}

function runGit(args: readonly string[], cwd: string): void {
  const subprocess = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  if (subprocess.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed\n${subprocess.stdout.toString()}\n${subprocess.stderr.toString()}`,
    )
  }
}

function runGitText(args: readonly string[], cwd: string): string {
  const subprocess = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  if (subprocess.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed\n${subprocess.stdout.toString()}\n${subprocess.stderr.toString()}`,
    )
  }

  return subprocess.stdout.toString().trim()
}
