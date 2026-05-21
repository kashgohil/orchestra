import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

import { ORCHESTRA_CONFIG_FILE } from "../config"
import { getTaskArtifactManifest } from "../core/artifact-service"
import { OrchestraError } from "../core/errors"
import { createTaskSlug } from "../core/names"
import { isActiveTaskStatus } from "../core/task-status"
import type { AbsolutePath, Task } from "../core/types"
import { getWorktreeChangedFiles, writeTaskDiffPatch, type WorktreeChangedFile } from "./diff"
import { discoverGitRepo } from "./repo"
import { runGitCommand, runGitText } from "./command"

export interface MergePreconditionResult {
  readonly task: Task
  readonly changedFiles: readonly WorktreeChangedFile[]
}

export interface ApplyTaskChangesResult {
  readonly commitSha: string
  readonly commitMessage: string
  readonly changedFiles: readonly WorktreeChangedFile[]
  readonly patchPath: AbsolutePath
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

export function applyTaskChangesAndCommit(task: Task): ApplyTaskChangesResult {
  const preconditions = assertTaskMergePreconditions(task)
  const patchPath = applyTaskChangesToSourceRepo(task)
  const stagedPaths = getSourceRepoUserChangedPaths(task.sourceRepoPath)

  if (stagedPaths.length === 0) {
    throw new OrchestraError("MERGE_CONFLICT", `Task '${task.id}' did not apply any source changes.`, {
      hint: "Inspect the task diff and source repo manually.",
    })
  }

  runGitCommand(["add", "-A", "--", ...stagedPaths], {
    cwd: task.sourceRepoPath,
  })

  const commitMessage = formatTaskMergeCommitMessage(task)
  const commitResult = runGitCommand(["commit", "-m", commitMessage], {
    cwd: task.sourceRepoPath,
    allowFailure: true,
  })

  if (commitResult.exitCode !== 0) {
    throw new OrchestraError("GIT_COMMAND_FAILED", "Could not create merge commit.", {
      hint: commitResult.stderr.trim() || commitResult.stdout.trim() || "Git commit failed.",
    })
  }

  return {
    commitSha: runGitText(["rev-parse", "HEAD"], { cwd: task.sourceRepoPath }),
    commitMessage,
    changedFiles: preconditions.changedFiles,
    patchPath,
  }
}

export function formatTaskMergeCommitMessage(task: Task): string {
  const summary = createTaskSlug(task.prompt, 72)

  return `orchestra: merge ${task.id} ${summary}`
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

function applyTaskChangesToSourceRepo(task: Task): AbsolutePath {
  const patchPath = writeTaskDiffPatch(task)
  const trackedPatchPath = writeTrackedPatch(task)
  const untrackedFiles = getUntrackedWorktreeFilePaths(task.worktreePath)

  assertUntrackedTargetsAvailable(task.sourceRepoPath, untrackedFiles)
  applyTrackedPatch(task, trackedPatchPath)
  copyUntrackedFiles({
    fromRoot: task.worktreePath,
    toRoot: task.sourceRepoPath,
    relativePaths: untrackedFiles,
  })

  return patchPath
}

function writeTrackedPatch(task: Task): AbsolutePath {
  const patchPath = path.join(getTaskArtifactManifest(task).directory, "tracked.patch")
  const trackedDiff = runGitCommand(["diff", "--no-ext-diff", "--binary", "HEAD", "--"], {
    cwd: task.worktreePath,
  }).stdout

  mkdirSync(path.dirname(patchPath), { recursive: true })
  writeFileSync(patchPath, trackedDiff, "utf8")

  return patchPath
}

function applyTrackedPatch(task: Task, patchPath: AbsolutePath): void {
  if (statSync(patchPath).size === 0) {
    return
  }

  const checkResult = runGitCommand(["apply", "--check", "--binary", patchPath], {
    cwd: task.sourceRepoPath,
    allowFailure: true,
  })

  if (checkResult.exitCode !== 0) {
    throw new OrchestraError("MERGE_CONFLICT", `Task '${task.id}' patch does not apply cleanly.`, {
      hint: checkResult.stderr.trim() || checkResult.stdout.trim() || "Resolve source changes manually.",
    })
  }

  const applyResult = runGitCommand(["apply", "--binary", patchPath], {
    cwd: task.sourceRepoPath,
    allowFailure: true,
  })

  if (applyResult.exitCode !== 0) {
    throw new OrchestraError("MERGE_CONFLICT", `Task '${task.id}' patch failed to apply.`, {
      hint: applyResult.stderr.trim() || applyResult.stdout.trim() || "Resolve source changes manually.",
    })
  }
}

function getUntrackedWorktreeFilePaths(worktreePath: AbsolutePath): readonly string[] {
  const output = runGitCommand(["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: worktreePath,
  }).stdout

  if (output.length === 0) {
    return []
  }

  return output.split("\0").filter((relativePath) => relativePath.length > 0)
}

function assertUntrackedTargetsAvailable(
  sourceRepoPath: AbsolutePath,
  relativePaths: readonly string[],
): void {
  for (const relativePath of relativePaths) {
    const targetPath = safeJoin(sourceRepoPath, relativePath)

    if (existsSync(targetPath)) {
      throw new OrchestraError("MERGE_CONFLICT", `Cannot copy untracked task file over existing path: ${relativePath}`, {
        hint: "Move or remove the existing source path before merging.",
      })
    }
  }
}

function copyUntrackedFiles(input: {
  readonly fromRoot: AbsolutePath
  readonly toRoot: AbsolutePath
  readonly relativePaths: readonly string[]
}): void {
  for (const relativePath of input.relativePaths) {
    const sourcePath = safeJoin(input.fromRoot, relativePath)
    const targetPath = safeJoin(input.toRoot, relativePath)

    if (!statSync(sourcePath).isFile()) {
      continue
    }

    mkdirSync(path.dirname(targetPath), { recursive: true })
    copyFileSync(sourcePath, targetPath)
  }
}

function safeJoin(rootPath: AbsolutePath, relativePath: string): AbsolutePath {
  const resolvedRoot = path.resolve(rootPath)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)
  const relativeToRoot = path.relative(resolvedRoot, resolvedPath)

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new OrchestraError("UNSAFE_OPERATION", `Path escapes repo root: ${relativePath}`)
  }

  return resolvedPath
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
