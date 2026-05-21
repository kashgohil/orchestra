import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

import { getTaskArtifactManifest } from "../core/artifact-service"
import type { AbsolutePath, Task } from "../core/types"
import { runGitCommand, runGitText } from "./command"

export type GitChangeStatus =
  | "added"
  | "copied"
  | "deleted"
  | "modified"
  | "renamed"
  | "untracked"
  | "unknown"

export interface WorktreeChangedFile {
  readonly path: string
  readonly status: GitChangeStatus
  readonly rawStatus: string
}

export function getWorktreeChangedFiles(worktreePath: AbsolutePath): readonly WorktreeChangedFile[] {
  const statusOutput = runGitCommand(["status", "--porcelain=v1"], { cwd: worktreePath }).stdout.replace(
    /\n$/,
    "",
  )

  if (statusOutput.length === 0) {
    return []
  }

  return statusOutput.split("\n").map(parseStatusLine)
}

export function getWorktreeUnifiedDiff(worktreePath: AbsolutePath): string {
  const trackedDiff = runGitCommand(["diff", "--no-ext-diff", "--binary", "HEAD", "--"], {
    cwd: worktreePath,
  }).stdout
  const untrackedDiff = getUntrackedFilePaths(worktreePath)
    .map((relativePath) => formatUntrackedFileDiff(worktreePath, relativePath))
    .join("")

  return `${trackedDiff}${untrackedDiff}`
}

export function formatWorktreeDiff(worktreePath: AbsolutePath): string {
  const diff = getWorktreeUnifiedDiff(worktreePath)

  return diff.length === 0 ? "No changes in task worktree.\n" : diff
}

export function writeTaskDiffPatch(task: Task): AbsolutePath {
  const patchPath = getTaskArtifactManifest(task).files.diff

  mkdirSync(path.dirname(patchPath), { recursive: true })
  writeFileSync(patchPath, getWorktreeUnifiedDiff(task.worktreePath), "utf8")

  return patchPath
}

function parseStatusLine(line: string): WorktreeChangedFile {
  const rawStatus = line.slice(0, 2)
  const rawPath = line.slice(3)
  const statusCode = rawStatus.includes("?") ? "?" : rawStatus.trim()[0]
  const filePath = rawPath.includes(" -> ") ? (rawPath.split(" -> ").at(-1) ?? rawPath) : rawPath

  return {
    path: filePath,
    rawStatus,
    status: statusFromCode(statusCode),
  }
}

function statusFromCode(statusCode: string | undefined): GitChangeStatus {
  switch (statusCode) {
    case "?":
      return "untracked"
    case "A":
      return "added"
    case "C":
      return "copied"
    case "D":
      return "deleted"
    case "M":
      return "modified"
    case "R":
      return "renamed"
    default:
      return "unknown"
  }
}

function getUntrackedFilePaths(worktreePath: AbsolutePath): readonly string[] {
  const output = runGitCommand(["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: worktreePath,
  }).stdout

  if (output.length === 0) {
    return []
  }

  return output.split("\0").filter((relativePath) => relativePath.length > 0)
}

function formatUntrackedFileDiff(worktreePath: AbsolutePath, relativePath: string): string {
  const absolutePath = path.join(worktreePath, relativePath)
  const stats = statSync(absolutePath)

  if (!stats.isFile()) {
    return ""
  }

  const content = readFileSync(absolutePath)

  if (content.includes(0)) {
    return [
      `diff --git a/${relativePath} b/${relativePath}`,
      "new file mode 100644",
      `Binary files /dev/null and b/${relativePath} differ`,
      "",
    ].join("\n")
  }

  const lines = content.toString("utf8").split("\n")
  const contentLines = lines.at(-1) === "" ? lines.slice(0, -1) : lines
  const addedLines = contentLines.map((line) => `+${line}`)

  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${relativePath}`,
    `@@ -0,0 +1,${contentLines.length} @@`,
    ...addedLines,
    "",
  ].join("\n")
}
