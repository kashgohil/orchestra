import { existsSync, writeFileSync } from "node:fs"
import path from "node:path"

import { buildAgentLaunchCommandById, buildAgentPromptEnvelopeById } from "../agents"
import { loadOrchestraConfig, ORCHESTRA_CONFIG_FILE, type OrchestraConfig } from "../config"
import { formatWorktreeDiff, writeTaskDiffPatch } from "../git/diff"
import { discoverGitRepo, type GitRepoInfo } from "../git/repo"
import { createTaskWorktreeFromTask } from "../git/worktree"
import { openGlobalIndexStore, type KnownRepoRecord } from "../store/global-index-store"
import { openRepoStore } from "../store/repo-store"
import { reconcileTaskSessions, startTaskSession, type TmuxCommandExecutor } from "../tmux"
import {
  appendTaskEventLog,
  initializeTaskArtifacts,
  readTaskEventLog,
  readTaskOutput,
} from "./artifact-service"
import { createRepoSlug, createTaskBranchName, createTaskId, createTmuxSessionName } from "./names"
import { getRepoStorePath, getTaskArtifactDir, getTaskWorktreePath } from "./paths"
import { createTaskEvent } from "./task-events"
import { isActiveTaskStatus } from "./task-status"
import type { AbsolutePath, AgentId, Task, TaskEvent, TaskId, TaskKind } from "./types"

export interface OrchestraRuntimeContext {
  readonly cwd?: AbsolutePath
  readonly homeDir?: AbsolutePath
  readonly now?: () => Date
  readonly tmuxExecutor?: TmuxCommandExecutor
  readonly taskIdToken?: string
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

export interface StartRunTaskInput extends OrchestraRuntimeContext {
  readonly prompt: string
  readonly agentId?: AgentId
}

export interface StartTaskResult {
  readonly task: Task
  readonly sessionName: string
  readonly tmuxArgs: readonly string[]
}

export interface TaskLogsResult {
  readonly task: Task
  readonly stdout: string
  readonly stderr: string
  readonly events: readonly TaskEvent[]
}

export interface TaskDiffResult {
  readonly task: Task
  readonly diff: string
  readonly patchPath: AbsolutePath
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

export function startRunTask(input: StartRunTaskInput): StartTaskResult {
  const repoInfo = discoverGitRepo(input.cwd)
  const loadedConfig = loadOrchestraConfig(repoInfo.rootPath)
  const repoStore = openRepoStore(repoInfo.rootPath)
  const globalStore = openGlobalIndexStore(input.homeDir === undefined ? {} : { homeDir: input.homeDir })

  try {
    const repo = registerRepo({
      repoInfo,
      globalStore,
      ...(input.now === undefined ? {} : { now: input.now }),
    })
    const agentId = input.agentId ?? loadedConfig.config.defaultAgent ?? DEFAULT_ORCHESTRA_CONFIG.defaultAgent
    const task = buildTaskRecord({
      kind: "run",
      agentId,
      prompt: input.prompt,
      repoInfo,
      repoId: repo.id,
      ...(input.taskIdToken === undefined ? {} : { token: input.taskIdToken }),
      ...(input.now === undefined ? {} : { now: input.now }),
    })

    createTaskWorktreeFromTask(task)
    persistCreatedTask({
      task,
      repoStore,
      ...(input.now === undefined ? {} : { now: input.now }),
    })

    const prompt = buildAgentPromptEnvelopeById({
      agentId,
      task,
      instruction: input.prompt,
    })
    const launchCommand = buildAgentLaunchCommandById({
      agentId,
      task,
      prompt,
      config: loadedConfig.config,
    })

    try {
      const started = startTaskSession({
        task,
        launchCommand,
        store: repoStore,
        ...(input.tmuxExecutor === undefined ? {} : { executor: input.tmuxExecutor }),
        ...(input.now === undefined ? {} : { now: input.now }),
      })

      return started
    } finally {
      updateRepoTaskSummary({
        repoId: repo.id,
        tasks: repoStore.listTasks(),
        globalStore,
        ...(input.now === undefined ? {} : { now: input.now }),
      })
    }
  } finally {
    repoStore.close()
    globalStore.close()
  }
}

export function getTaskLogs(taskId: TaskId, context: OrchestraRuntimeContext = {}): TaskLogsResult {
  const repoInfo = discoverGitRepo(context.cwd)
  const repoStore = openRepoStore(repoInfo.rootPath)

  try {
    const task = repoStore.requireTask(taskId)

    return {
      task,
      stdout: readTaskOutput(task, "stdout"),
      stderr: readTaskOutput(task, "stderr"),
      events: repoStore.listTaskEvents(task.id),
    }
  } finally {
    repoStore.close()
  }
}

export function getTaskDiff(taskId: TaskId, context: OrchestraRuntimeContext = {}): TaskDiffResult {
  const repoInfo = discoverGitRepo(context.cwd)
  const repoStore = openRepoStore(repoInfo.rootPath)

  try {
    const task = repoStore.requireTask(taskId)
    const patchPath = writeTaskDiffPatch(task)

    return {
      task,
      patchPath,
      diff: formatWorktreeDiff(task.worktreePath),
    }
  } finally {
    repoStore.close()
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

function buildTaskRecord(input: {
  readonly kind: TaskKind
  readonly agentId: AgentId
  readonly prompt: string
  readonly repoInfo: GitRepoInfo
  readonly repoId: string
  readonly parentTaskId?: TaskId
  readonly token?: string
  readonly now?: () => Date
  readonly baseCommit?: string
  readonly taskBranch?: string
  readonly worktreePath?: AbsolutePath
}): Task {
  const now = input.now?.() ?? new Date()
  const createdAt = now.toISOString()
  const taskId = createTaskId({
    now,
    ...(input.token === undefined ? {} : { token: input.token }),
  })
  const taskBranch = input.taskBranch ?? createTaskBranchName({ taskId, prompt: input.prompt })
  const worktreePath = input.worktreePath ?? getTaskWorktreePath(input.repoInfo.rootPath, taskId)

  return {
    id: taskId,
    repoId: input.repoId,
    ...(input.parentTaskId === undefined ? {} : { parentTaskId: input.parentTaskId }),
    kind: input.kind,
    agentId: input.agentId,
    status: "queued",
    prompt: input.prompt,
    sourceRepoPath: input.repoInfo.rootPath,
    sourceBranch: input.repoInfo.currentBranch,
    baseCommit: input.baseCommit ?? input.repoInfo.headCommit,
    taskBranch,
    worktreePath,
    tmuxSessionName: createTmuxSessionName(taskId),
    artifactPath: getTaskArtifactDir(input.repoInfo.rootPath, taskId),
    createdAt,
    updatedAt: createdAt,
  }
}

function persistCreatedTask(input: {
  readonly task: Task
  readonly repoStore: ReturnType<typeof openRepoStore>
  readonly now?: () => Date
}): void {
  input.repoStore.createTask(input.task)
  initializeTaskArtifacts(input.task)

  const event = createTaskEvent({
    task: input.task,
    type: "task.created",
    level: "info",
    message: "Created task.",
    data: {
      kind: input.task.kind,
      agentId: input.task.agentId,
      worktreePath: input.task.worktreePath,
    },
    ...(input.now === undefined ? {} : { now: input.now }),
  })

  input.repoStore.appendTaskEvent(event)
  appendTaskEventLog(input.task, event)
}
