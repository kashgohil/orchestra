import { existsSync } from "node:fs"
import path from "node:path"

import { ORCHESTRA_CONFIG_FILE } from "../config"
import { OrchestraError } from "../core/errors"
import { isActiveTaskStatus } from "../core/task-status"
import type { AbsolutePath, Task } from "../core/types"
import { getWorktreeChangedFiles, type WorktreeChangedFile } from "./diff"
import { discoverGitRepo } from "./repo"
import { runGitCommand } from "./command"

export interface MergePreconditionResult {
  readonly task: Task
  readonly changedFiles: readonly WorktreeChangedFile[]
}

export function assertTaskMergePreconditions(task: Task): MergePreconditionResult {
  assertTaskIsMergeable(task)
  assertSourceRepoExists(task.sourceRepoPath)
  assertTaskWorktreeExists(task.worktreePath)
  assertSourceRepoCleanForMerge(task.sourceRepoPath)

  const changedFiles = getWorktreeChangedFiles(task.worktreePath)

  if (changedFiles.length === 0) {
    throw new OrchestraError("UNSAFE_OPERATION", `Task '${task.id}' has no changes to merge.`, {
      hint: "Use `orchestra diff <task-id>` to inspect task worktree changes.",
    })
  }

  return {
    task,
    changedFiles,
  }
}

export function assertTaskIsMergeable(task: Task): void {
  if (task.status === "merged") {
    return
  }

  if (!isActiveTaskStatus(task.status)) {
    return
  }

  throw new OrchestraError("UNSAFE_OPERATION", `Task '${task.id}' is still '${task.status}'.`, {
    hint: "Stop the task or wait for it to finish before merging.",
  })
}

export function assertSourceRepoExists(sourceRepoPath: AbsolutePath): void {
  if (!existsSync(sourceRepoPath)) {
    throw new OrchestraError("REPO_NOT_FOUND", `Source repo path does not exist: ${sourceRepoPath}`)
  }

  const repoInfo = discoverGitRepo(sourceRepoPath)

  if (path.resolve(repoInfo.rootPath) !== path.resolve(sourceRepoPath)) {
    throw new OrchestraError("REPO_NOT_FOUND", `Source repo path is not a git repo root: ${sourceRepoPath}`, {
      hint: `Detected git root: ${repoInfo.rootPath}`,
    })
  }
}

export function assertTaskWorktreeExists(worktreePath: AbsolutePath): void {
  if (!existsSync(worktreePath)) {
    throw new OrchestraError("WORKTREE_MISSING", `Task worktree path does not exist: ${worktreePath}`)
  }

  const repoInfo = discoverGitRepo(worktreePath)

  if (path.resolve(repoInfo.rootPath) !== path.resolve(worktreePath)) {
    throw new OrchestraError("WORKTREE_MISSING", `Task worktree path is not a git worktree root: ${worktreePath}`, {
      hint: `Detected git root: ${repoInfo.rootPath}`,
    })
  }
}

export function assertSourceRepoCleanForMerge(sourceRepoPath: AbsolutePath): void {
  const changedPaths = getSourceRepoUserChangedPaths(sourceRepoPath)

  if (changedPaths.length === 0) {
    return
  }

  throw new OrchestraError("DIRTY_SOURCE_REPO", "Source repo has uncommitted changes.", {
    hint: `Commit, stash, or discard these paths first: ${changedPaths.join(", ")}`,
  })
}

export function getSourceRepoUserChangedPaths(sourceRepoPath: AbsolutePath): readonly string[] {
  return runGitCommand(["status", "--porcelain=v1"], {
    cwd: sourceRepoPath,
  })
    .stdout.replace(/\n$/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap(statusLinePaths)
    .filter((changedPath) => !isOrchestraInternalPath(changedPath))
}

export function isOrchestraInternalPath(changedPath: string): boolean {
  return (
    changedPath === ORCHESTRA_CONFIG_FILE ||
    changedPath === ".orchestra" ||
    changedPath.startsWith(".orchestra/")
  )
}

function statusLinePaths(line: string): readonly string[] {
  const rawPath = line.slice(3)

  if (!rawPath.includes(" -> ")) {
    return [unquoteGitPath(rawPath)]
  }

  return rawPath.split(" -> ").map(unquoteGitPath)
}

function unquoteGitPath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) {
    return value
  }

  return value.slice(1, -1).replace(/\\"/g, '"')
}
