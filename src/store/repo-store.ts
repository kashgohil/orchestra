import { mkdirSync } from "node:fs"
import path from "node:path"
import { Database } from "bun:sqlite"

import { OrchestraError } from "../core/errors"
import { getRepoStateDir, getRepoStorePath } from "../core/paths"
import type { AbsolutePath, JsonObject, Task, TaskEvent, TaskId, TaskStatus } from "../core/types"
import { REPO_STORE_MIGRATIONS } from "./repo-migrations"

type SqlParams = Record<string, string | number | boolean | null>

interface MigrationRow {
  readonly version: number
}

interface TaskRow {
  readonly id: string
  readonly repo_id: string
  readonly parent_task_id: string | null
  readonly kind: Task["kind"]
  readonly agent_id: string
  readonly status: TaskStatus
  readonly prompt: string
  readonly source_repo_path: string
  readonly source_branch: string
  readonly base_commit: string
  readonly task_branch: string
  readonly worktree_path: string
  readonly tmux_session_name: string
  readonly artifact_path: string
  readonly created_at: string
  readonly updated_at: string
  readonly completed_at: string | null
  readonly failure_reason: string | null
}

interface TaskEventRow {
  readonly id: string
  readonly task_id: string
  readonly type: TaskEvent["type"]
  readonly level: TaskEvent["level"]
  readonly message: string
  readonly data_json: string | null
  readonly created_at: string
}

export interface UpdateTaskInput {
  readonly status?: TaskStatus
  readonly updatedAt?: string
  readonly completedAt?: string | null
  readonly failureReason?: string | null
}

export class RepoStore {
  readonly repoRootPath: AbsolutePath
  readonly dbPath: AbsolutePath

  private readonly db: Database

  constructor(repoRootPath: AbsolutePath) {
    this.repoRootPath = path.resolve(repoRootPath)
    this.dbPath = getRepoStorePath(this.repoRootPath)
    mkdirSync(getRepoStateDir(this.repoRootPath), { recursive: true })
    this.db = new Database(this.dbPath, { create: true, readwrite: true, strict: true })
  }

  initialize(): void {
    this.db.run("PRAGMA foreign_keys = ON")
    this.db.run("PRAGMA journal_mode = WAL")
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `)

    const appliedVersions = new Set(
      this.db
        .query<MigrationRow, []>("SELECT version FROM schema_migrations")
        .all()
        .map((row) => row.version),
    )

    for (const migration of REPO_STORE_MIGRATIONS) {
      if (appliedVersions.has(migration.version)) {
        continue
      }

      this.db.run("BEGIN")
      try {
        this.db.run(migration.sql)
        this.run(
          `
            INSERT INTO schema_migrations (version, name, applied_at)
            VALUES ($version, $name, $appliedAt)
          `,
          {
            version: migration.version,
            name: migration.name,
            appliedAt: new Date().toISOString(),
          },
        )
        this.db.run("COMMIT")
      } catch (error) {
        this.db.run("ROLLBACK")
        throw error
      }
    }
  }

  close(): void {
    this.db.close()
  }

  getAppliedMigrationVersions(): readonly number[] {
    return this.db
      .query<MigrationRow, []>("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => row.version)
  }

  createTask(task: Task): Task {
    this.run(
      `
        INSERT INTO tasks (
          id,
          repo_id,
          parent_task_id,
          kind,
          agent_id,
          status,
          prompt,
          source_repo_path,
          source_branch,
          base_commit,
          task_branch,
          worktree_path,
          tmux_session_name,
          artifact_path,
          created_at,
          updated_at,
          completed_at,
          failure_reason
        )
        VALUES (
          $id,
          $repoId,
          $parentTaskId,
          $kind,
          $agentId,
          $status,
          $prompt,
          $sourceRepoPath,
          $sourceBranch,
          $baseCommit,
          $taskBranch,
          $worktreePath,
          $tmuxSessionName,
          $artifactPath,
          $createdAt,
          $updatedAt,
          $completedAt,
          $failureReason
        )
      `,
      taskToParams(task),
    )

    return task
  }

  getTask(taskId: TaskId): Task | null {
    const row = this.db
      .query<TaskRow, SqlParams>("SELECT * FROM tasks WHERE id = $taskId")
      .get({ taskId })

    return row === null ? null : taskFromRow(row)
  }

  requireTask(taskId: TaskId): Task {
    const task = this.getTask(taskId)

    if (task === null) {
      throw new OrchestraError("TASK_NOT_FOUND", `Task '${taskId}' was not found.`)
    }

    return task
  }

  listTasks(): readonly Task[] {
    return this.db
      .query<TaskRow, []>("SELECT * FROM tasks ORDER BY created_at DESC, id DESC")
      .all()
      .map(taskFromRow)
  }

  updateTask(taskId: TaskId, input: UpdateTaskInput): Task {
    const currentTask = this.requireTask(taskId)
    const updatedAt = input.updatedAt ?? new Date().toISOString()
    const completedAt = hasOwn(input, "completedAt")
      ? (input.completedAt ?? null)
      : (currentTask.completedAt ?? null)
    const failureReason = hasOwn(input, "failureReason")
      ? (input.failureReason ?? null)
      : (currentTask.failureReason ?? null)

    this.run(
      `
        UPDATE tasks
        SET
          status = $status,
          updated_at = $updatedAt,
          completed_at = $completedAt,
          failure_reason = $failureReason
        WHERE id = $taskId
      `,
      {
        taskId,
        status: input.status ?? currentTask.status,
        updatedAt,
        completedAt,
        failureReason,
      },
    )

    return this.requireTask(taskId)
  }

  appendTaskEvent(event: TaskEvent): TaskEvent {
    this.run(
      `
        INSERT INTO task_events (
          id,
          task_id,
          type,
          level,
          message,
          data_json,
          created_at
        )
        VALUES (
          $id,
          $taskId,
          $type,
          $level,
          $message,
          $dataJson,
          $createdAt
        )
      `,
      {
        id: event.id,
        taskId: event.taskId,
        type: event.type,
        level: event.level,
        message: event.message,
        dataJson: event.data === undefined ? null : JSON.stringify(event.data),
        createdAt: event.createdAt,
      },
    )

    return event
  }

  listTaskEvents(taskId: TaskId): readonly TaskEvent[] {
    return this.db
      .query<TaskEventRow, SqlParams>(
        "SELECT * FROM task_events WHERE task_id = $taskId ORDER BY created_at ASC, id ASC",
      )
      .all({ taskId })
      .map(taskEventFromRow)
  }

  private run(sql: string, params: SqlParams = {}): void {
    this.db.query<unknown, SqlParams>(sql).run(params)
  }
}

export function openRepoStore(repoRootPath: AbsolutePath): RepoStore {
  const store = new RepoStore(repoRootPath)
  store.initialize()

  return store
}

function taskToParams(task: Task): SqlParams {
  return {
    id: task.id,
    repoId: task.repoId,
    parentTaskId: task.parentTaskId ?? null,
    kind: task.kind,
    agentId: task.agentId,
    status: task.status,
    prompt: task.prompt,
    sourceRepoPath: task.sourceRepoPath,
    sourceBranch: task.sourceBranch,
    baseCommit: task.baseCommit,
    taskBranch: task.taskBranch,
    worktreePath: task.worktreePath,
    tmuxSessionName: task.tmuxSessionName,
    artifactPath: task.artifactPath,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt ?? null,
    failureReason: task.failureReason ?? null,
  }
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    repoId: row.repo_id,
    ...(row.parent_task_id === null ? {} : { parentTaskId: row.parent_task_id }),
    kind: row.kind,
    agentId: row.agent_id,
    status: row.status,
    prompt: row.prompt,
    sourceRepoPath: row.source_repo_path,
    sourceBranch: row.source_branch,
    baseCommit: row.base_commit,
    taskBranch: row.task_branch,
    worktreePath: row.worktree_path,
    tmuxSessionName: row.tmux_session_name,
    artifactPath: row.artifact_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
    ...(row.failure_reason === null ? {} : { failureReason: row.failure_reason }),
  }
}

function taskEventFromRow(row: TaskEventRow): TaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type,
    level: row.level,
    message: row.message,
    ...(row.data_json === null ? {} : { data: JSON.parse(row.data_json) as JsonObject }),
    createdAt: row.created_at,
  }
}

function hasOwn<T extends object, K extends PropertyKey>(
  value: T,
  key: K,
): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key)
}
