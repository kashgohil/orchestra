import { existsSync } from "node:fs"
import path from "node:path"

import { OrchestraError } from "../core/errors"
import { getWorktreeRoot } from "../core/paths"
import type { AbsolutePath, Task, TaskStatus } from "../core/types"
import { runGitCommand } from "./command"

export interface CleanupTaskWorktreeResult {
  readonly removed: boolean
  readonly worktreePath: AbsolutePath
  readonly reason?: string
}

const CLEANUP_ALLOWED_STATUSES = new Set<TaskStatus>(["stopped", "completed", "merged"])

export function canCleanupTaskWorktree(status: TaskStatus): boolean {
  return CLEANUP_ALLOWED_STATUSES.has(status)
}

export function cleanupTaskWorktree(task: Task): CleanupTaskWorktreeResult {
  assertCleanupAllowed(task)
  assertOrchestraOwnedWorktreePath(task)

  if (!existsSync(task.worktreePath)) {
    return {
      removed: false,
      worktreePath: task.worktreePath,
      reason: "Worktree path does not exist.",
    }
  }

  const result = runGitCommand(["worktree", "remove", task.worktreePath], {
    cwd: task.sourceRepoPath,
    allowFailure: true,
  })

  if (result.exitCode !== 0) {
    throw new OrchestraError("UNSAFE_OPERATION", `Could not remove worktree: ${task.worktreePath}`, {
      hint: result.stderr.trim() || "Git refused to remove the worktree. Inspect it manually.",
    })
  }

  return {
    removed: true,
    worktreePath: task.worktreePath,
  }
}

export function assertCleanupAllowed(task: Task): void {
  if (canCleanupTaskWorktree(task.status)) {
    return
  }

  throw new OrchestraError(
    "UNSAFE_OPERATION",
    `Task '${task.id}' with status '${task.status}' cannot be cleaned up.`,
    {
      hint: "Only stopped, completed, and merged task worktrees can be cleaned up.",
    },
  )
}

export function assertOrchestraOwnedWorktreePath(task: Task): void {
  const sourceRepoPath = path.resolve(task.sourceRepoPath)
  const worktreePath = path.resolve(task.worktreePath)
  const worktreeRoot = path.resolve(getWorktreeRoot(sourceRepoPath))

  if (worktreePath === sourceRepoPath) {
    throw new OrchestraError("UNSAFE_OPERATION", "Refusing to clean up the source repository path.", {
      hint: "Task worktree path must be separate from the source repository.",
    })
  }

  const relativePath = path.relative(worktreeRoot, worktreePath)

  if (relativePath.length === 0 || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new OrchestraError(
      "UNSAFE_OPERATION",
      `Refusing to clean up a path outside Orchestra's worktree root: ${worktreePath}`,
      {
        hint: `Expected a path inside ${worktreeRoot}.`,
      },
    )
  }
}
