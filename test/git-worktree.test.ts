import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import { OrchestraError, createTaskBranchName, getTaskWorktreePath } from "../src/core"
import { createTaskWorktree } from "../src/git"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("git worktree creation", () => {
  test("creates an isolated sibling worktree and task branch from HEAD", () => {
    const repoRoot = createGitRepo()
    const headCommit = runGitText(["rev-parse", "HEAD"], repoRoot)
    const sourceStatusBefore = runGitText(["status", "--short"], repoRoot)
    const taskId = "task-20260522-100000-worktree"
    const prompt = "Create worktree"
    const taskBranch = createTaskBranchName({ taskId, prompt })

    const worktreeInfo = createTaskWorktree({
      repoRootPath: repoRoot,
      taskId,
      prompt,
    })

    expect(worktreeInfo).toEqual({
      repoRootPath: repoRoot,
      taskId,
      baseCommit: headCommit,
      taskBranch,
      worktreePath: getTaskWorktreePath(repoRoot, taskId),
    })
    expect(runGitText(["branch", "--show-current"], worktreeInfo.worktreePath)).toBe(taskBranch)
    expect(runGitText(["rev-parse", "HEAD"], worktreeInfo.worktreePath)).toBe(headCommit)
    expect(runGitText(["status", "--short"], repoRoot)).toBe(sourceStatusBefore)
  })

  test("uses explicit branch, base commit, and worktree path when provided", () => {
    const repoRoot = createGitRepo()
    const headCommit = runGitText(["rev-parse", "HEAD"], repoRoot)
    const customWorktreePath = path.join(path.dirname(repoRoot), "custom-worktree")

    const worktreeInfo = createTaskWorktree({
      repoRootPath: repoRoot,
      taskId: "task-20260522-100000-custom",
      prompt: "Custom worktree",
      baseCommit: headCommit,
      taskBranch: "orchestra/custom-worktree",
      worktreePath: customWorktreePath,
    })

    expect(worktreeInfo.worktreePath).toBe(customWorktreePath)
    expect(worktreeInfo.taskBranch).toBe("orchestra/custom-worktree")
    expect(runGitText(["branch", "--show-current"], customWorktreePath)).toBe("orchestra/custom-worktree")
  })

  test("refuses to use an existing worktree path", () => {
    const repoRoot = createGitRepo()
    const existingPath = path.join(path.dirname(repoRoot), "existing-worktree")

    mkdirSync(existingPath)

    expect(() =>
      createTaskWorktree({
        repoRootPath: repoRoot,
        taskId: "task-20260522-100000-existing",
        prompt: "Existing worktree",
        worktreePath: existingPath,
      }),
    ).toThrow(OrchestraError)
  })
})

function createTempDir(): string {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "orchestra-worktree-"))
  const realTempRoot = realpathSync(tempRoot)
  tempRoots.push(realTempRoot)

  return realTempRoot
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
