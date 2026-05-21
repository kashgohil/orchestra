export const BUILT_IN_AGENT_IDS = [
  "codex",
  "claude",
  "cursor",
  "antigravity",
  "gemini",
  "opencode",
] as const

export const TASK_STATUSES = [
  "queued",
  "starting",
  "running",
  "stopped",
  "failed",
  "completed",
  "merged",
] as const

export const TASK_KINDS = ["run", "review", "continue"] as const

export type AbsolutePath = string
export type AgentId = BuiltInAgentId | (string & {})
export type BuiltInAgentId = (typeof BUILT_IN_AGENT_IDS)[number]
export type GitBranchName = string
export type GitCommitSha = string
export type ISODateString = string
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type RepoId = string
export type TaskArtifactKind =
  | "task"
  | "plan"
  | "result"
  | "review"
  | "event-log"
  | "stdout"
  | "stderr"
  | "diff"
export type TaskEventLevel = "debug" | "info" | "warn" | "error"
export type TaskEventType =
  | "task.created"
  | "task.started"
  | "task.output"
  | "task.stopped"
  | "task.failed"
  | "task.completed"
  | "task.merged"
  | "task.pushed"
  | "task.reviewed"
export type TaskId = string
export type TaskKind = (typeof TASK_KINDS)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TmuxSessionName = string

export interface JsonObject {
  readonly [key: string]: JsonValue
}

export interface RepoRecord {
  readonly id: RepoId
  readonly slug: string
  readonly rootPath: AbsolutePath
  readonly displayName: string
  readonly currentBranch?: GitBranchName
  readonly headCommit?: GitCommitSha
  readonly createdAt: ISODateString
  readonly updatedAt: ISODateString
}

export interface Task {
  readonly id: TaskId
  readonly repoId: RepoId
  readonly parentTaskId?: TaskId
  readonly kind: TaskKind
  readonly agentId: AgentId
  readonly status: TaskStatus
  readonly prompt: string
  readonly sourceRepoPath: AbsolutePath
  readonly sourceBranch: GitBranchName
  readonly baseCommit: GitCommitSha
  readonly taskBranch: GitBranchName
  readonly worktreePath: AbsolutePath
  readonly tmuxSessionName: TmuxSessionName
  readonly artifactPath: AbsolutePath
  readonly createdAt: ISODateString
  readonly updatedAt: ISODateString
  readonly completedAt?: ISODateString
  readonly failureReason?: string
}

export interface TaskArtifact {
  readonly taskId: TaskId
  readonly kind: TaskArtifactKind
  readonly path: AbsolutePath
  readonly createdAt: ISODateString
  readonly updatedAt: ISODateString
}

export interface TaskEvent {
  readonly id: string
  readonly taskId: TaskId
  readonly type: TaskEventType
  readonly level: TaskEventLevel
  readonly message: string
  readonly data?: JsonObject
  readonly createdAt: ISODateString
}

export interface AgentCommandOverride {
  readonly command: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

export interface AgentDetectionContext {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly commandOverride?: AgentCommandOverride
}

export interface AgentDetectionResult {
  readonly available: boolean
  readonly command?: string
  readonly version?: string
  readonly reason?: string
}

export interface AgentLaunchCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: AbsolutePath
  readonly env?: Readonly<Record<string, string>>
}

export interface AgentPromptEnvelopeInput {
  readonly task: Task
  readonly instruction: string
  readonly context?: JsonObject
}

export interface AgentLaunchInput {
  readonly task: Task
  readonly prompt: string
  readonly commandOverride?: AgentCommandOverride
}

export interface AgentAdapter {
  readonly id: AgentId
  readonly displayName: string
  readonly requiresTty: boolean
  detect(context: AgentDetectionContext): Promise<AgentDetectionResult>
  buildLaunchCommand(input: AgentLaunchInput): AgentLaunchCommand
  defaultPromptEnvelope(input: AgentPromptEnvelopeInput): string
}
