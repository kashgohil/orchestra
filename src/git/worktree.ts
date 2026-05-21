import { existsSync } from "node:fs"
import path from "node:path"

import { OrchestraError } from "../core/errors"
import { createTaskBranchName } from "../core/names"
import { getTaskWorktreePath } from "../core/paths"
import type { AbsolutePath, GitBranchName, GitCommitSha, Task, TaskId } from "../core/types"
import { discoverGitRepo } from "./repo"
import { runGitCommand } from "./command"

export interface CreateTaskWorktreeInput {
  readonly repoRootPath: AbsolutePath
  readonly taskId: TaskId
  readonly prompt: string
  readonly baseCommit?: GitCommitSha
  readonly taskBranch?: GitBranchName
  readonly worktreePath?: AbsolutePath
}

export interface TaskWorktreeInfo {
  readonly repoRootPath: AbsolutePath
  readonly taskId: TaskId
  readonly baseCommit: GitCommitSha
  readonly taskBranch: GitBranchName
  readonly worktreePath: AbsolutePath
}

export function createTaskWorktree(input: CreateTaskWorktreeInput): TaskWorktreeInfo {
  const repoInfo = discoverGitRepo(input.repoRootPath)
  const baseCommit = input.baseCommit ?? repoInfo.headCommit
  const taskBranch = input.taskBranch ?? createTaskBranchName(input)
  const worktreePath = path.resolve(input.worktreePath ?? getTaskWorktreePath(repoInfo.rootPath, input.taskId))

  assertWorktreePathAvailable(worktreePath)

  runGitCommand(["worktree", "add", "-b", taskBranch, worktreePath, baseCommit], {
    cwd: repoInfo.rootPath,
  })

  return {
    repoRootPath: repoInfo.rootPath,
    taskId: input.taskId,
    baseCommit,
    taskBranch,
    worktreePath,
  }
}

export function createTaskWorktreeFromTask(task: Task): TaskWorktreeInfo {
  return createTaskWorktree({
    repoRootPath: task.sourceRepoPath,
    taskId: task.id,
    prompt: task.prompt,
    baseCommit: task.baseCommit,
    taskBranch: task.taskBranch,
    worktreePath: task.worktreePath,
  })
}

export function assertWorktreePathAvailable(worktreePath: AbsolutePath): void {
  if (!existsSync(worktreePath)) {
    return
  }

  throw new OrchestraError("WORKTREE_EXISTS", `Worktree path already exists: ${worktreePath}`, {
    hint: "Choose a different task ID or clean up the existing Orchestra worktree.",
  })
}
