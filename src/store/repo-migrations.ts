export interface RepoStoreMigration {
  readonly version: number
  readonly name: string
  readonly sql: string
}

export const REPO_STORE_MIGRATIONS = [
  {
    version: 1,
    name: "create_tasks_and_events",
    sql: `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        parent_task_id TEXT,
        kind TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        prompt TEXT NOT NULL,
        source_repo_path TEXT NOT NULL,
        source_branch TEXT NOT NULL,
        base_commit TEXT NOT NULL,
        task_branch TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        tmux_session_name TEXT NOT NULL,
        artifact_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        failure_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_repo_status_created
        ON tasks (repo_id, status, created_at);

      CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id
        ON tasks (parent_task_id);

      CREATE TABLE IF NOT EXISTS task_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        data_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_task_events_task_created
        ON task_events (task_id, created_at);
    `,
  },
] as const satisfies readonly RepoStoreMigration[]
