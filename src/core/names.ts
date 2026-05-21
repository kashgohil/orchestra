import { createHash, randomUUID } from "node:crypto"
import path from "node:path"

import type { AbsolutePath, GitBranchName, TaskId, TmuxSessionName } from "./types"

export interface SanitizeNameOptions {
  readonly fallback?: string
  readonly maxLength?: number
}

export interface CreateTaskIdOptions {
  readonly now?: Date
  readonly token?: string
}

export interface CreateTaskBranchNameInput {
  readonly taskId: TaskId
  readonly prompt: string
  readonly prefix?: string
}

export function sanitizeNameComponent(value: string, options: SanitizeNameOptions = {}): string {
  const fallback = cleanName(options.fallback ?? "item") || "item"
  const maxLength = options.maxLength
  let result = cleanName(value) || fallback

  if (maxLength !== undefined && result.length > maxLength) {
    result = result.slice(0, maxLength).replace(/-+$/g, "") || fallback
  }

  return result
}

export function createTaskId(options: CreateTaskIdOptions = {}): TaskId {
  const timestamp = formatTaskTimestamp(options.now ?? new Date())
  const token = sanitizeNameComponent(options.token ?? randomToken(), {
    fallback: "00000000",
    maxLength: 12,
  })

  return `task-${timestamp}-${token}`
}

export function createRepoSlug(repoRootPath: AbsolutePath): string {
  const absoluteRepoPath = path.resolve(repoRootPath)
  const repoName = sanitizeNameComponent(path.basename(absoluteRepoPath), {
    fallback: "repo",
    maxLength: 48,
  })
  const hash = createHash("sha1").update(absoluteRepoPath).digest("hex").slice(0, 8)

  return `${repoName}-${hash}`
}

export function createTaskSlug(prompt: string, maxLength = 48): string {
  return sanitizeNameComponent(prompt, {
    fallback: "task",
    maxLength,
  })
}

export function createTaskBranchName(input: CreateTaskBranchNameInput): GitBranchName {
  const prefix = sanitizeNameComponent(input.prefix ?? "orchestra", {
    fallback: "orchestra",
    maxLength: 32,
  })
  const taskId = sanitizeNameComponent(input.taskId, {
    fallback: "task",
    maxLength: 48,
  })
  const slug = createTaskSlug(input.prompt, 40)

  return `${prefix}/${taskId}-${slug}`
}

export function createTmuxSessionName(taskId: TaskId): TmuxSessionName {
  const safeTaskId = sanitizeNameComponent(taskId, {
    fallback: "task",
    maxLength: 80,
  })

  return `orchestra-${safeTaskId}`
}

function cleanName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function formatTaskTimestamp(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, "0")
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = date.getUTCDate().toString().padStart(2, "0")
  const hour = date.getUTCHours().toString().padStart(2, "0")
  const minute = date.getUTCMinutes().toString().padStart(2, "0")
  const second = date.getUTCSeconds().toString().padStart(2, "0")

  return `${year}${month}${day}-${hour}${minute}${second}`
}

function randomToken(): string {
  return randomUUID().replaceAll("-", "").slice(0, 8)
}
