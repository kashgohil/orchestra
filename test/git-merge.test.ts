import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import {
  createTaskBranchName,
  createTmuxSessionName,
  getRepoId,
  getTaskArtifactDir,
  getTaskArtifactManifest,
  getTaskWorktreePath,
  type Task,
} from "../src/core"
import {
  applyTaskChangesAndCommit,
  assertTaskMergePreconditions,
  createTaskWorktreeFromTask,
  getSourceRepoUserChangedPaths,
} from "../src/git"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("git merge preconditions", () => {
  test("accepts stopped tasks with worktree changes", () => {
    const repoRoot = createGitRepo()
    const task = createTestTask(repoRoot, "task-20260522-100000-mergeable", "Merge changed work")

    createTaskWorktreeFromTask(task)
    writeFileSync(path.join(task.worktreePath, "feature.txt"), "feature\n", "utf8")

    const result = assertTaskMergePreconditions(task)

    expect(result.task.id).toBe(task.id)
    expect(result.changedFiles.map((file) => file.path)).toEqual(["feature.txt"])
  })

  test("refuses active tasks", () => {
    const repoRoot = createGitRepo()
    const task = {
      ...createTestTask(repoRoot, "task-20260522-100000-active", "Merge active work"),
      status: "running",
    } satisfies Task

    createTaskWorktreeFromTask(task)
    writeFileSync(path.join(task.worktreePath, "feature.txt"), "feature\n", "utf8")

    expect(() => assertTaskMergePreconditions(task)).toThrow("still 'running'")
    expect(runGitText(["status", "--short"], repoRoot)).toBe("")
  })

  test("refuses tasks with no diff", () => {
    const repoRoot = createGitRepo()
    const task = createTestTask(repoRoot, "task-20260522-100000-empty", "Empty merge")

    createTaskWorktreeFromTask(task)

    expect(() => assertTaskMergePreconditions(task)).toThrow("has no changes to merge")
  })

  test("refuses dirty source repos but ignores Orchestra state", () => {
    const repoRoot = createGitRepo()
    const task = createTestTask(repoRoot, "task-20260522-100000-dirty", "Dirty source")

    createTaskWorktreeFromTask(task)
    writeFileSync(path.join(task.worktreePath, "feature.txt"), "feature\n", "utf8")
    mkdirSync(path.join(repoRoot, ".orchestra"), { recursive: true })
    writeFileSync(path.join(repoRoot, ".orchestra", "state.sqlite"), "state\n", "utf8")
    writeFileSync(path.join(repoRoot, "orchestra.config.json"), "{}\n", "utf8")

    expect(getSourceRepoUserChangedPaths(repoRoot)).toEqual([])

    writeFileSync(path.join(repoRoot, "user-change.txt"), "dirty\n", "utf8")

    expect(() => assertTaskMergePreconditions(task)).toThrow("Source repo has uncommitted changes")
    expect(getSourceRepoUserChangedPaths(repoRoot)).toEqual(["user-change.txt"])
  })

  test("refuses missing task worktrees", () => {
    const repoRoot = createGitRepo()
    const task = createTestTask(repoRoot, "task-20260522-100000-missing", "Missing worktree")

    expect(() => assertTaskMergePreconditions(task)).toThrow("Task worktree path does not exist")
  })

  test("applies task changes, commits locally, and preserves Orchestra state", () => {
    const repoRoot = createGitRepo()
    const task = createTestTask(repoRoot, "task-20260522-100000-apply", "Apply changed work")

    createTaskWorktreeFromTask(task)
    writeFileSync(path.join(task.worktreePath, "README.md"), "# Changed Repo\n", "utf8")
    writeFileSync(path.join(task.worktreePath, "feature.txt"), "feature\n", "utf8")
    mkdirSync(path.join(repoRoot, ".orchestra"), { recursive: true })
    writeFileSync(path.join(repoRoot, ".orchestra", "state.sqlite"), "state\n", "utf8")
    writeFileSync(path.join(repoRoot, "orchestra.config.json"), "{}\n", "utf8")

    const result = applyTaskChangesAndCommit(task)
    const committedFiles = runGitText(["show", "--name-only", "--pretty=format:", "HEAD"], repoRoot)
      .split("\n")
      .filter((line) => line.length > 0)

    expect(result.commitSha).toBe(runGitText(["rev-parse", "HEAD"], repoRoot))
    expect(result.commitMessage).toContain(task.id)
    expect(runGitText(["log", "-1", "--pretty=%s"], repoRoot)).toContain(task.id)
    expect(runGitText(["show", "HEAD:README.md"], repoRoot)).toBe("# Changed Repo")
    expect(runGitText(["show", "HEAD:feature.txt"], repoRoot)).toBe("feature")
    expect(committedFiles).toEqual(["README.md", "feature.txt"])
    expect(getSourceRepoUserChangedPaths(repoRoot)).toEqual([])
    expect(runGitText(["status", "--short"], repoRoot)).toContain(".orchestra")
    expect(runGitText(["status", "--short"], repoRoot)).toContain("orchestra.config.json")
    expect(result.patchPath).toBe(getTaskArtifactManifest(task).files.diff)
  })
})

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

function createTempDir(prefix: string): string {
  const tempRoot = mkdtempSync(path.join(tmpdir(), prefix))
  const realTempRoot = realpathSync(tempRoot)
  tempRoots.push(realTempRoot)

  return realTempRoot
}

function createGitRepo(): string {
  const tempRoot = createTempDir("orchestra-merge-repo-")
  const repoRoot = path.join(tempRoot, "repo")

  mkdirSync(repoRoot)
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
