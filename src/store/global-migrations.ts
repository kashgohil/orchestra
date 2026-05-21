export interface GlobalIndexMigration {
  readonly version: number
  readonly name: string
  readonly sql: string
}

export const GLOBAL_INDEX_MIGRATIONS = [
  {
    version: 1,
    name: "create_repos_and_task_summaries",
    sql: `
      CREATE TABLE IF NOT EXISTS repos (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        store_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_repos_last_seen_at
        ON repos (last_seen_at);

      CREATE TABLE IF NOT EXISTS repo_task_summaries (
        repo_id TEXT PRIMARY KEY,
        latest_task_id TEXT,
        latest_task_status TEXT,
        latest_task_agent_id TEXT,
        latest_task_prompt TEXT,
        latest_task_updated_at TEXT,
        running_task_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE
      );
    `,
  },
] as const satisfies readonly GlobalIndexMigration[]
