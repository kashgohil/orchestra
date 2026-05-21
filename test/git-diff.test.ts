import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import {
  createTaskBranchName,
  createTmuxSessionName,
  getTaskArtifactDir,
  getTaskArtifactManifest,
  type Task,
} from "../src/core"
import {
  createTaskWorktree,
  formatWorktreeDiff,
  getWorktreeChangedFiles,
  getWorktreeUnifiedDiff,
  writeTaskDiffPatch,
} from "../src/git"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("git diff helpers", () => {
  test("shows changed files and unified diff for tracked and untracked changes", () => {
    const repoRoot = createGitRepo()
    const task = createTaskWithWorktree(repoRoot)

    writeFileSync(path.join(task.worktreePath, "README.md"), "# Test Repo\n\nUpdated.\n", "utf8")
    writeFileSync(path.join(task.worktreePath, "notes.txt"), "New notes.\n", "utf8")

    expect(getWorktreeChangedFiles(task.worktreePath)).toEqual([
      {
        path: "README.md",
        rawStatus: " M",
        status: "modified",
      },
      {
        path: "notes.txt",
        rawStatus: "??",
        status: "untracked",
      },
    ])

    const diff = getWorktreeUnifiedDiff(task.worktreePath)

    expect(diff).toContain("diff --git a/README.md b/README.md")
    expect(diff).toContain("+Updated.")
    expect(diff).toContain("diff --git a/notes.txt b/notes.txt")
    expect(diff).toContain("new file mode 100644")
    expect(diff).toContain("+New notes.")
    expect(formatWorktreeDiff(task.worktreePath)).toBe(diff)
  })

  test("writes task diff patch on demand", async () => {
    const repoRoot = createGitRepo()
    const task = createTaskWithWorktree(repoRoot)

    writeFileSync(path.join(task.worktreePath, "README.md"), "# Test Repo\n\nPatch me.\n", "utf8")

    const patchPath = writeTaskDiffPatch(task)

    expect(patchPath).toBe(getTaskArtifactManifest(task).files.diff)
    await expect(Bun.file(patchPath).text()).resolves.toContain("+Patch me.")
  })

  test("returns clear output for empty diffs", () => {
    const repoRoot = createGitRepo()
    const task = createTaskWithWorktree(repoRoot)

    expect(getWorktreeChangedFiles(task.worktreePath)).toEqual([])
    expect(getWorktreeUnifiedDiff(task.worktreePath)).toBe("")
    expect(formatWorktreeDiff(task.worktreePath)).toBe("No changes in task worktree.\n")
  })
})

function createTaskWithWorktree(repoRoot: string): Task {
  const taskId = "task-20260522-100000-diff"
  const prompt = "Inspect diff"
  const taskBranch = createTaskBranchName({ taskId, prompt })
  const worktree = createTaskWorktree({
    repoRootPath: repoRoot,
    taskId,
    prompt,
    taskBranch,
  })

  return {
    id: taskId,
    repoId: "repo-1",
    kind: "run",
    agentId: "codex",
    status: "completed",
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
  const tempRoot = mkdtempSync(path.join(tmpdir(), "orchestra-diff-"))
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
