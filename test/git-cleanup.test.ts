import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import {
  OrchestraError,
  createTaskBranchName,
  createTmuxSessionName,
  getTaskArtifactDir,
  getTaskWorktreePath,
  getWorktreeRoot,
  type Task,
  type TaskStatus,
} from "../src/core"
import { cleanupTaskWorktree, createTaskWorktree } from "../src/git"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("git cleanup safety", () => {
  test("removes stopped Orchestra-owned worktrees", () => {
    const repoRoot = createGitRepo()
    const task = createTaskWithWorktree(repoRoot, "stopped")

    expect(existsSync(task.worktreePath)).toBe(true)

    expect(cleanupTaskWorktree(task)).toEqual({
      removed: true,
      worktreePath: task.worktreePath,
    })
    expect(existsSync(task.worktreePath)).toBe(false)
  })

  test("refuses to remove running task worktrees", () => {
    const repoRoot = createGitRepo()
    const task = createTaskWithWorktree(repoRoot, "running")

    expect(() => cleanupTaskWorktree(task)).toThrow(OrchestraError)
    expect(existsSync(task.worktreePath)).toBe(true)
  })

  test("refuses to remove the source repository path", () => {
    const repoRoot = createGitRepo()
    const task = {
      ...createTaskWithWorktree(repoRoot, "stopped"),
      worktreePath: repoRoot,
    }

    expect(() => cleanupTaskWorktree(task)).toThrow(OrchestraError)
    expect(existsSync(repoRoot)).toBe(true)
  })

  test("refuses to remove paths outside the Orchestra worktree root", () => {
    const repoRoot = createGitRepo()
    const outsidePath = createSiblingPath(repoRoot, "outside-worktree")
    const task = {
      ...createTaskWithWorktree(repoRoot, "completed"),
      worktreePath: outsidePath,
    }

    expect(() => cleanupTaskWorktree(task)).toThrow(OrchestraError)
    expect(existsSync(outsidePath)).toBe(true)
  })

  test("does not force-remove dirty completed worktrees", () => {
    const repoRoot = createGitRepo()
    const task = createTaskWithWorktree(repoRoot, "completed")

    writeFileSync(path.join(task.worktreePath, "README.md"), "# Test Repo\n\nDirty.\n", "utf8")

    expect(() => cleanupTaskWorktree(task)).toThrow(OrchestraError)
    expect(existsSync(task.worktreePath)).toBe(true)
  })

  test("returns a skipped result for already-missing worktrees", () => {
    const repoRoot = createGitRepo()
    const task = createTaskWithWorktree(repoRoot, "merged")

    runGit(["worktree", "remove", task.worktreePath], repoRoot)

    expect(cleanupTaskWorktree(task)).toEqual({
      removed: false,
      worktreePath: task.worktreePath,
      reason: "Worktree path does not exist.",
    })
  })
})

function createTaskWithWorktree(repoRoot: string, status: TaskStatus): Task {
  const taskId = `task-20260522-100000-cleanup-${status}`
  const prompt = "Clean up worktree"
  const taskBranch = createTaskBranchName({ taskId, prompt })
  const worktreeRoot = getWorktreeRoot(repoRoot)
  const worktree = createTaskWorktree({
    repoRootPath: repoRoot,
    taskId,
    prompt,
    taskBranch,
  })

  tempRoots.push(worktreeRoot)

  return {
    id: taskId,
    repoId: "repo-1",
    kind: "run",
    agentId: "codex",
    status,
    prompt,
    sourceRepoPath: repoRoot,
    sourceBranch: "main",
    baseCommit: worktree.baseCommit,
    taskBranch,
    worktreePath: worktree.worktreePath,
    tmuxSessionName: createTmuxSessionName(taskId),
    artifactPath: getTaskArtifactDir(repoRoot, taskId),
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  }
}

function createTempDir(): string {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "orchestra-cleanup-"))
  const realTempRoot = realpathSync(tempRoot)
  tempRoots.push(realTempRoot)

  return realTempRoot
}

function createSiblingPath(repoRoot: string, name: string): string {
  const siblingPath = path.join(path.dirname(repoRoot), `${name}-${path.basename(repoRoot)}`)
  tempRoots.push(siblingPath)
  writeFileSync(siblingPath, "do not remove\n", "utf8")

  return siblingPath
}

function createGitRepo(): string {
  const repoRoot = createTempDir()

  runGit(["init", "--initial-branch=main"], repoRoot)
  runGit(["config", "user.name", "Orchestra Test"], repoRoot)
  runGit(["config", "user.email", "orchestra@example.test"], repoRoot)
  writeFileSync(path.join(repoRoot, "README.md"), "# Test Repo\n", "utf8")
  runGit(["add", "README.md"], repoRoot)
  runGit(["commit", "-m", "Initial commit"], repoRoot)

  return repoRoot
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
