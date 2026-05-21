export type OrchestraErrorCode =
  | "AGENT_NOT_FOUND"
  | "AGENT_UNAVAILABLE"
  | "CONFIG_INVALID"
  | "DIRTY_SOURCE_REPO"
  | "INVALID_STATUS_TRANSITION"
  | "MERGE_CONFLICT"
  | "NOT_GIT_REPO"
  | "PUSH_FAILED"
  | "STORE_UNAVAILABLE"
  | "TASK_NOT_FOUND"
  | "TMUX_SESSION_NOT_FOUND"
  | "TMUX_UNAVAILABLE"
  | "UNSAFE_OPERATION"
  | "WORKTREE_EXISTS"
  | "WORKTREE_MISSING"

export interface OrchestraErrorOptions {
  readonly cause?: unknown
  readonly hint?: string
}

export class OrchestraError extends Error {
  readonly code: OrchestraErrorCode
  readonly hint?: string

  constructor(code: OrchestraErrorCode, message: string, options: OrchestraErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = "OrchestraError"
    this.code = code

    if (options.hint !== undefined) {
      this.hint = options.hint
    }
  }
}

export function isOrchestraError(error: unknown): error is OrchestraError {
  return error instanceof OrchestraError
}
