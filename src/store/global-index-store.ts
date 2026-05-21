import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { Database } from "bun:sqlite"

import { OrchestraError } from "../core/errors"
import type { AbsolutePath, AgentId, RepoId, TaskId, TaskStatus } from "../core/types"
import { GLOBAL_INDEX_MIGRATIONS } from "./global-migrations"

type SqlParams = Record<string, string | number | boolean | null>

interface MigrationRow {
  readonly version: number
}

interface KnownRepoRow {
  readonly id: string
  readonly slug: string
  readonly root_path: string
  readonly display_name: string
  readonly store_path: string
  readonly created_at: string
  readonly updated_at: string
  readonly last_seen_at: string
}

interface RepoTaskSummaryRow {
  readonly repo_id: string
  readonly latest_task_id: string | null
  readonly latest_task_status: TaskStatus | null
  readonly latest_task_agent_id: string | null
  readonly latest_task_prompt: string | null
  readonly latest_task_updated_at: string | null
  readonly running_task_count: number
  readonly updated_at: string
}

export interface GlobalIndexStoreOptions {
  readonly homeDir?: AbsolutePath
  readonly dbPath?: AbsolutePath
}

export interface RegisterRepoInput {
  readonly id: RepoId
  readonly slug: string
  readonly rootPath: AbsolutePath
  readonly displayName: string
  readonly storePath: AbsolutePath
  readonly now?: string
}

export interface KnownRepoRecord {
  readonly id: RepoId
  readonly slug: string
  readonly rootPath: AbsolutePath
  readonly displayName: string
  readonly storePath: AbsolutePath
  readonly createdAt: string
  readonly updatedAt: string
  readonly lastSeenAt: string
}

export interface UpdateRepoTaskSummaryInput {
  readonly repoId: RepoId
  readonly latestTaskId?: TaskId | null
  readonly latestTaskStatus?: TaskStatus | null
  readonly latestTaskAgentId?: AgentId | null
  readonly latestTaskPrompt?: string | null
  readonly latestTaskUpdatedAt?: string | null
  readonly runningTaskCount?: number
  readonly updatedAt?: string
}

export interface RepoTaskSummary {
  readonly repoId: RepoId
  readonly latestTaskId?: TaskId
  readonly latestTaskStatus?: TaskStatus
  readonly latestTaskAgentId?: AgentId
  readonly latestTaskPrompt?: string
  readonly latestTaskUpdatedAt?: string
  readonly runningTaskCount: number
  readonly updatedAt: string
}

export interface IndexedRepo {
  readonly repo: KnownRepoRecord
  readonly taskSummary?: RepoTaskSummary
}

export class GlobalIndexStore {
  readonly dbPath: AbsolutePath

  private readonly db: Database

  constructor(options: GlobalIndexStoreOptions = {}) {
    this.dbPath = path.resolve(options.dbPath ?? path.join(options.homeDir ?? homedir(), ".orchestra", "index.sqlite"))
    mkdirSync(path.dirname(this.dbPath), { recursive: true })
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

    for (const migration of GLOBAL_INDEX_MIGRATIONS) {
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

  registerRepo(input: RegisterRepoInput): KnownRepoRecord {
    const existingRepo = this.getRepo(input.id)
    const now = input.now ?? new Date().toISOString()

    this.run(
      `
        INSERT INTO repos (
          id,
          slug,
          root_path,
          display_name,
          store_path,
          created_at,
          updated_at,
          last_seen_at
        )
        VALUES (
          $id,
          $slug,
          $rootPath,
          $displayName,
          $storePath,
          $createdAt,
          $updatedAt,
          $lastSeenAt
        )
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          root_path = excluded.root_path,
          display_name = excluded.display_name,
          store_path = excluded.store_path,
          updated_at = excluded.updated_at,
          last_seen_at = excluded.last_seen_at
      `,
      {
        id: input.id,
        slug: input.slug,
        rootPath: path.resolve(input.rootPath),
        displayName: input.displayName,
        storePath: path.resolve(input.storePath),
        createdAt: existingRepo?.createdAt ?? now,
        updatedAt: now,
        lastSeenAt: now,
      },
    )

    return this.requireRepo(input.id)
  }

  getRepo(repoId: RepoId): KnownRepoRecord | null {
    const row = this.db
      .query<KnownRepoRow, SqlParams>("SELECT * FROM repos WHERE id = $repoId")
      .get({ repoId })

    return row === null ? null : knownRepoFromRow(row)
  }

  requireRepo(repoId: RepoId): KnownRepoRecord {
    const repo = this.getRepo(repoId)

    if (repo === null) {
      throw new OrchestraError(
        "REPO_NOT_FOUND",
        `Repo '${repoId}' was not found in the global index.`,
      )
    }

    return repo
  }

  listRepos(): readonly KnownRepoRecord[] {
    return this.db
      .query<KnownRepoRow, []>("SELECT * FROM repos ORDER BY last_seen_at DESC, display_name ASC")
      .all()
      .map(knownRepoFromRow)
  }

  updateRepoTaskSummary(input: UpdateRepoTaskSummaryInput): RepoTaskSummary {
    const existingSummary = this.getRepoTaskSummary(input.repoId)
    const now = input.updatedAt ?? new Date().toISOString()

    this.run(
      `
        INSERT INTO repo_task_summaries (
          repo_id,
          latest_task_id,
          latest_task_status,
          latest_task_agent_id,
          latest_task_prompt,
          latest_task_updated_at,
          running_task_count,
          updated_at
        )
        VALUES (
          $repoId,
          $latestTaskId,
          $latestTaskStatus,
          $latestTaskAgentId,
          $latestTaskPrompt,
          $latestTaskUpdatedAt,
          $runningTaskCount,
          $updatedAt
        )
        ON CONFLICT(repo_id) DO UPDATE SET
          latest_task_id = excluded.latest_task_id,
          latest_task_status = excluded.latest_task_status,
          latest_task_agent_id = excluded.latest_task_agent_id,
          latest_task_prompt = excluded.latest_task_prompt,
          latest_task_updated_at = excluded.latest_task_updated_at,
          running_task_count = excluded.running_task_count,
          updated_at = excluded.updated_at
      `,
      {
        repoId: input.repoId,
        latestTaskId: valueOrExisting(input.latestTaskId, existingSummary?.latestTaskId),
        latestTaskStatus: valueOrExisting(input.latestTaskStatus, existingSummary?.latestTaskStatus),
        latestTaskAgentId: valueOrExisting(input.latestTaskAgentId, existingSummary?.latestTaskAgentId),
        latestTaskPrompt: valueOrExisting(input.latestTaskPrompt, existingSummary?.latestTaskPrompt),
        latestTaskUpdatedAt: valueOrExisting(
          input.latestTaskUpdatedAt,
          existingSummary?.latestTaskUpdatedAt,
        ),
        runningTaskCount: input.runningTaskCount ?? existingSummary?.runningTaskCount ?? 0,
        updatedAt: now,
      },
    )

    return this.requireRepoTaskSummary(input.repoId)
  }

  getRepoTaskSummary(repoId: RepoId): RepoTaskSummary | null {
    const row = this.db
      .query<RepoTaskSummaryRow, SqlParams>(
        "SELECT * FROM repo_task_summaries WHERE repo_id = $repoId",
      )
      .get({ repoId })

    return row === null ? null : repoTaskSummaryFromRow(row)
  }

  requireRepoTaskSummary(repoId: RepoId): RepoTaskSummary {
    const summary = this.getRepoTaskSummary(repoId)

    if (summary === null) {
      throw new OrchestraError(
        "REPO_TASK_SUMMARY_NOT_FOUND",
        `Repo '${repoId}' has no task summary in the global index.`,
      )
    }

    return summary
  }

  listIndexedRepos(): readonly IndexedRepo[] {
    const summariesByRepoId = new Map(
      this.db
        .query<RepoTaskSummaryRow, []>("SELECT * FROM repo_task_summaries")
        .all()
        .map((row) => {
          const summary = repoTaskSummaryFromRow(row)

          return [summary.repoId, summary] as const
        }),
    )

    return this.listRepos().map((repo) => {
      const taskSummary = summariesByRepoId.get(repo.id)

      return taskSummary === undefined ? { repo } : { repo, taskSummary }
    })
  }

  private run(sql: string, params: SqlParams = {}): void {
    this.db.query<unknown, SqlParams>(sql).run(params)
  }
}

export function openGlobalIndexStore(options: GlobalIndexStoreOptions = {}): GlobalIndexStore {
  const store = new GlobalIndexStore(options)
  store.initialize()

  return store
}

function knownRepoFromRow(row: KnownRepoRow): KnownRepoRecord {
  return {
    id: row.id,
    slug: row.slug,
    rootPath: row.root_path,
    displayName: row.display_name,
    storePath: row.store_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  }
}

function repoTaskSummaryFromRow(row: RepoTaskSummaryRow): RepoTaskSummary {
  return {
    repoId: row.repo_id,
    ...(row.latest_task_id === null ? {} : { latestTaskId: row.latest_task_id }),
    ...(row.latest_task_status === null ? {} : { latestTaskStatus: row.latest_task_status }),
    ...(row.latest_task_agent_id === null ? {} : { latestTaskAgentId: row.latest_task_agent_id }),
    ...(row.latest_task_prompt === null ? {} : { latestTaskPrompt: row.latest_task_prompt }),
    ...(row.latest_task_updated_at === null
      ? {}
      : { latestTaskUpdatedAt: row.latest_task_updated_at }),
    runningTaskCount: row.running_task_count,
    updatedAt: row.updated_at,
  }
}

function valueOrExisting<T>(value: T | null | undefined, existingValue: T | undefined): T | null {
  return value === undefined ? (existingValue ?? null) : value
}
