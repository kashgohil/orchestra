import { existsSync, writeFileSync } from "node:fs"
import path from "node:path"

import { loadOrchestraConfig, ORCHESTRA_CONFIG_FILE, type OrchestraConfig } from "../config"
import type { TmuxCommandExecutor } from "../tmux"
import { reconcileTaskSessions } from "../tmux"
import { openGlobalIndexStore, type KnownRepoRecord } from "../store/global-index-store"
import { openRepoStore } from "../store/repo-store"
import { discoverGitRepo, type GitRepoInfo } from "../git/repo"
import { createRepoSlug } from "./names"
import { getRepoStorePath } from "./paths"
import { isActiveTaskStatus } from "./task-status"
import type { AbsolutePath, Task } from "./types"

export interface OrchestraRuntimeContext {
  readonly cwd?: AbsolutePath
  readonly homeDir?: AbsolutePath
  readonly now?: () => Date
  readonly tmuxExecutor?: TmuxCommandExecutor
}

export interface InitializeOrchestraRepoResult {
  readonly repo: KnownRepoRecord
  readonly repoInfo: GitRepoInfo
  readonly configPath: AbsolutePath
  readonly configCreated: boolean
}

export interface RepoTaskStatusResult {
  readonly repo: KnownRepoRecord
  readonly repoInfo: GitRepoInfo
  readonly tasks: readonly Task[]
}

export const DEFAULT_ORCHESTRA_CONFIG = {
  defaultAgent: "codex",
  remote: "origin",
  branchPattern: "orchestra/{taskId}-{slug}",
  agents: {
    codex: { command: "codex" },
    claude: { command: "claude" },
    cursor: { command: "cursor-agent" },
    antigravity: { command: "antigravity" },
    gemini: { command: "gemini" },
    opencode: { command: "opencode" },
  },
  checks: {
    test: "",
    lint: "",
  },
} as const satisfies OrchestraConfig

export function initializeOrchestraRepo(
  context: OrchestraRuntimeContext = {},
): InitializeOrchestraRepoResult {
  const repoInfo = discoverGitRepo(context.cwd)
  const configPath = path.join(repoInfo.rootPath, ORCHESTRA_CONFIG_FILE)
  const configCreated = ensureDefaultConfig(configPath)
  const repoStore = openRepoStore(repoInfo.rootPath)
  const globalStore = openGlobalIndexStore(context.homeDir === undefined ? {} : { homeDir: context.homeDir })

  try {
    const repo = registerRepo({
      repoInfo,
      globalStore,
      ...(context.now === undefined ? {} : { now: context.now }),
    })

    updateRepoTaskSummary({
      repoId: repo.id,
      tasks: repoStore.listTasks(),
      globalStore,
      ...(context.now === undefined ? {} : { now: context.now }),
    })

    return {
      repo,
      repoInfo,
      configPath,
      configCreated,
    }
  } finally {
    repoStore.close()
    globalStore.close()
  }
}

export function getCurrentRepoTaskStatus(
  context: OrchestraRuntimeContext = {},
): RepoTaskStatusResult {
  const repoInfo = discoverGitRepo(context.cwd)
  const repoStore = openRepoStore(repoInfo.rootPath)
  const globalStore = openGlobalIndexStore(context.homeDir === undefined ? {} : { homeDir: context.homeDir })

  try {
    const repo = registerRepo({
      repoInfo,
      globalStore,
      ...(context.now === undefined ? {} : { now: context.now }),
    })
    reconcileTaskSessions({
      tasks: repoStore.listTasks(),
      store: repoStore,
      ...(context.tmuxExecutor === undefined ? {} : { executor: context.tmuxExecutor }),
      ...(context.now === undefined ? {} : { now: context.now }),
    })
    const tasks = repoStore.listTasks()

    updateRepoTaskSummary({
      repoId: repo.id,
      tasks,
      globalStore,
      ...(context.now === undefined ? {} : { now: context.now }),
    })

    return {
      repo,
      repoInfo,
      tasks,
    }
  } finally {
    repoStore.close()
    globalStore.close()
  }
}

export function getRepoId(repoRootPath: AbsolutePath): string {
  return createRepoSlug(repoRootPath)
}

export function formatDefaultConfig(): string {
  return `${JSON.stringify(DEFAULT_ORCHESTRA_CONFIG, null, 2)}\n`
}

function ensureDefaultConfig(configPath: AbsolutePath): boolean {
  if (existsSync(configPath)) {
    return false
  }

  writeFileSync(configPath, formatDefaultConfig(), "utf8")

  return true
}

function registerRepo(input: {
  readonly repoInfo: GitRepoInfo
  readonly globalStore: ReturnType<typeof openGlobalIndexStore>
  readonly now?: () => Date
}): KnownRepoRecord {
  const repoSlug = createRepoSlug(input.repoInfo.rootPath)
  const now = input.now?.().toISOString()

  return input.globalStore.registerRepo({
    id: repoSlug,
    slug: repoSlug,
    rootPath: input.repoInfo.rootPath,
    displayName: path.basename(input.repoInfo.rootPath),
    storePath: getRepoStorePath(input.repoInfo.rootPath),
    ...(now === undefined ? {} : { now }),
  })
}

function updateRepoTaskSummary(input: {
  readonly repoId: string
  readonly tasks: readonly Task[]
  readonly globalStore: ReturnType<typeof openGlobalIndexStore>
  readonly now?: () => Date
}): void {
  const latestTask = [...input.tasks].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
  )[0]
  const updatedAt = input.now?.().toISOString()

  input.globalStore.updateRepoTaskSummary({
    repoId: input.repoId,
    latestTaskId: latestTask?.id ?? null,
    latestTaskStatus: latestTask?.status ?? null,
    latestTaskAgentId: latestTask?.agentId ?? null,
    latestTaskPrompt: latestTask?.prompt ?? null,
    latestTaskUpdatedAt: latestTask?.updatedAt ?? null,
    runningTaskCount: input.tasks.filter((task) => isActiveTaskStatus(task.status)).length,
    ...(updatedAt === undefined ? {} : { updatedAt }),
  })
}
