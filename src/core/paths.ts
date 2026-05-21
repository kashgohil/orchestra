import path from "node:path"

import { createRepoSlug, sanitizeNameComponent } from "./names"
import type { AbsolutePath, TaskArtifactKind, TaskId } from "./types"

export const TASK_ARTIFACT_FILENAMES = {
  task: "TASK.md",
  plan: "PLAN.md",
  result: "RESULT.md",
  review: "REVIEW.md",
  "event-log": "LOG.jsonl",
  stdout: "stdout.log",
  stderr: "stderr.log",
  diff: "diff.patch",
} as const satisfies Record<TaskArtifactKind, string>

export function getRepoStateDir(repoRootPath: AbsolutePath): AbsolutePath {
  return path.join(path.resolve(repoRootPath), ".orchestra")
}

export function getRepoStorePath(repoRootPath: AbsolutePath): AbsolutePath {
  return path.join(getRepoStateDir(repoRootPath), "orchestra.sqlite")
}

export function getTaskArtifactsRoot(repoRootPath: AbsolutePath): AbsolutePath {
  return path.join(getRepoStateDir(repoRootPath), "tasks")
}

export function getTaskArtifactDir(repoRootPath: AbsolutePath, taskId: TaskId): AbsolutePath {
  return path.join(getTaskArtifactsRoot(repoRootPath), safeTaskId(taskId))
}

export function getTaskArtifactPath(
  repoRootPath: AbsolutePath,
  taskId: TaskId,
  kind: TaskArtifactKind,
): AbsolutePath {
  return path.join(getTaskArtifactDir(repoRootPath, taskId), TASK_ARTIFACT_FILENAMES[kind])
}

export function getTaskArtifactPaths(
  repoRootPath: AbsolutePath,
  taskId: TaskId,
): Record<TaskArtifactKind, AbsolutePath> {
  return {
    task: getTaskArtifactPath(repoRootPath, taskId, "task"),
    plan: getTaskArtifactPath(repoRootPath, taskId, "plan"),
    result: getTaskArtifactPath(repoRootPath, taskId, "result"),
    review: getTaskArtifactPath(repoRootPath, taskId, "review"),
    "event-log": getTaskArtifactPath(repoRootPath, taskId, "event-log"),
    stdout: getTaskArtifactPath(repoRootPath, taskId, "stdout"),
    stderr: getTaskArtifactPath(repoRootPath, taskId, "stderr"),
    diff: getTaskArtifactPath(repoRootPath, taskId, "diff"),
  }
}

export function getWorktreeRoot(repoRootPath: AbsolutePath): AbsolutePath {
  const absoluteRepoPath = path.resolve(repoRootPath)

  return path.join(path.dirname(absoluteRepoPath), ".orchestra-worktrees", createRepoSlug(absoluteRepoPath))
}

export function getTaskWorktreePath(repoRootPath: AbsolutePath, taskId: TaskId): AbsolutePath {
  return path.join(getWorktreeRoot(repoRootPath), safeTaskId(taskId))
}

function safeTaskId(taskId: TaskId): string {
  return sanitizeNameComponent(taskId, {
    fallback: "task",
    maxLength: 96,
  })
}
