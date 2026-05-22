import type { AbsolutePath, Task, TaskEvent, TaskId } from "../core"
import type { WorktreeChangedFile } from "../git"

export interface TuiRuntimeContext {
  readonly cwd?: AbsolutePath
  readonly homeDir?: AbsolutePath
  readonly now?: () => Date
}

export interface TuiRepoView {
  readonly rootPath: AbsolutePath
  readonly currentBranch: string
  readonly headCommit: string
}

export interface TuiTaskDetail {
  readonly task: Task
  readonly events: readonly TaskEvent[]
  readonly stdoutTail: string
  readonly stderrTail: string
  readonly changedFiles: readonly WorktreeChangedFile[]
  readonly error?: string
}

export interface TuiState {
  readonly repo?: TuiRepoView
  readonly tasks: readonly Task[]
  readonly selectedTaskId?: TaskId
  readonly detail?: TuiTaskDetail
  readonly error?: string
  readonly loadedAt: string
}

export type TuiViewMode = "overview" | "logs" | "diff"

export interface TuiCommandResult {
  readonly ok: boolean
  readonly message: string
  readonly refresh?: boolean
  readonly viewMode?: TuiViewMode
}
