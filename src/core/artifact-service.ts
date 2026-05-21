import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { TASK_ARTIFACT_FILENAMES } from "./paths"
import type { AbsolutePath, Task, TaskArtifactKind, TaskEvent } from "./types"

export type TaskOutputStream = "stdout" | "stderr"

export interface TaskArtifactManifest {
  readonly taskId: string
  readonly directory: AbsolutePath
  readonly files: Record<TaskArtifactKind, AbsolutePath>
}

export function getTaskArtifactManifest(task: Task): TaskArtifactManifest {
  return {
    taskId: task.id,
    directory: task.artifactPath,
    files: {
      task: path.join(task.artifactPath, TASK_ARTIFACT_FILENAMES.task),
      plan: path.join(task.artifactPath, TASK_ARTIFACT_FILENAMES.plan),
      result: path.join(task.artifactPath, TASK_ARTIFACT_FILENAMES.result),
      review: path.join(task.artifactPath, TASK_ARTIFACT_FILENAMES.review),
      "event-log": path.join(task.artifactPath, TASK_ARTIFACT_FILENAMES["event-log"]),
      stdout: path.join(task.artifactPath, TASK_ARTIFACT_FILENAMES.stdout),
      stderr: path.join(task.artifactPath, TASK_ARTIFACT_FILENAMES.stderr),
      diff: path.join(task.artifactPath, TASK_ARTIFACT_FILENAMES.diff),
    },
  }
}

export function initializeTaskArtifacts(task: Task): TaskArtifactManifest {
  const manifest = getTaskArtifactManifest(task)

  mkdirSync(manifest.directory, { recursive: true })
  writeFileSync(manifest.files.task, formatTaskMarkdown(task), "utf8")
  ensureFile(manifest.files.plan)
  ensureFile(manifest.files.result)
  ensureFile(manifest.files.review)
  ensureFile(manifest.files["event-log"])
  ensureFile(manifest.files.stdout)
  ensureFile(manifest.files.stderr)

  return manifest
}

export function appendTaskEventLog(task: Task, event: TaskEvent): void {
  const manifest = getTaskArtifactManifest(task)
  mkdirSync(manifest.directory, { recursive: true })
  appendFileSync(manifest.files["event-log"], `${JSON.stringify(event)}\n`, "utf8")
}

export function readTaskEventLog(task: Task): readonly TaskEvent[] {
  const eventLogPath = getTaskArtifactManifest(task).files["event-log"]

  if (!existsSync(eventLogPath)) {
    return []
  }

  return readFileSync(eventLogPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TaskEvent)
}

export function appendTaskOutput(task: Task, stream: TaskOutputStream, output: string): void {
  const manifest = getTaskArtifactManifest(task)
  mkdirSync(manifest.directory, { recursive: true })
  appendFileSync(manifest.files[stream], output, "utf8")
}

export function readTaskOutput(task: Task, stream: TaskOutputStream): string {
  const outputPath = getTaskArtifactManifest(task).files[stream]

  if (!existsSync(outputPath)) {
    return ""
  }

  return readFileSync(outputPath, "utf8")
}

export function formatTaskMarkdown(task: Task): string {
  const lines = [
    `# ${task.id}`,
    "",
    "## Summary",
    "",
    task.prompt,
    "",
    "## Metadata",
    "",
    `- Kind: ${task.kind}`,
    `- Agent: ${task.agentId}`,
    `- Status: ${task.status}`,
    `- Repo: ${task.sourceRepoPath}`,
    `- Source branch: ${task.sourceBranch}`,
    `- Base commit: ${task.baseCommit}`,
    `- Task branch: ${task.taskBranch}`,
    `- Worktree: ${task.worktreePath}`,
    `- tmux session: ${task.tmuxSessionName}`,
    `- Artifacts: ${task.artifactPath}`,
    `- Created: ${task.createdAt}`,
    `- Updated: ${task.updatedAt}`,
  ]

  if (task.parentTaskId !== undefined) {
    lines.push(`- Parent task: ${task.parentTaskId}`)
  }

  if (task.completedAt !== undefined) {
    lines.push(`- Completed: ${task.completedAt}`)
  }

  if (task.failureReason !== undefined) {
    lines.push(`- Failure reason: ${task.failureReason}`)
  }

  return `${lines.join("\n")}\n`
}

function ensureFile(filePath: AbsolutePath): void {
  if (existsSync(filePath)) {
    return
  }

  writeFileSync(filePath, "", "utf8")
}
