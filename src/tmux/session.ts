import { OrchestraError } from "../core/errors"
import { createTmuxSessionName } from "../core/names"
import type { Task, TaskId, TmuxSessionName } from "../core/types"
import { bunTmuxCommandExecutor, type TmuxCommandExecutor } from "./command"

export interface TmuxAvailability {
  readonly available: boolean
  readonly command: "tmux"
  readonly version?: string
  readonly reason?: string
}

export function detectTmux(
  executor: TmuxCommandExecutor = bunTmuxCommandExecutor,
): TmuxAvailability {
  const result = executor.run(["-V"])

  if (result.exitCode !== 0) {
    return {
      available: false,
      command: "tmux",
      reason: result.stderr.trim() || result.stdout.trim() || "tmux command failed.",
    }
  }

  return {
    available: true,
    command: "tmux",
    version: result.stdout.trim(),
  }
}

export function getTaskTmuxSessionName(task: Pick<Task, "id" | "tmuxSessionName">): TmuxSessionName {
  return task.tmuxSessionName || createTmuxSessionName(task.id)
}

export function isManagedTmuxSessionName(sessionName: string): boolean {
  return /^orchestra-[a-z0-9][a-z0-9-]*$/.test(sessionName)
}

export function assertManagedTmuxSessionName(sessionName: string): void {
  if (isManagedTmuxSessionName(sessionName)) {
    return
  }

  throw new OrchestraError("UNSAFE_OPERATION", `Unsafe tmux session name: ${sessionName}`, {
    hint: "Orchestra-managed tmux sessions must start with 'orchestra-' and contain only lowercase letters, numbers, and hyphens.",
  })
}

export function createManagedTmuxSessionName(taskId: TaskId): TmuxSessionName {
  const sessionName = createTmuxSessionName(taskId)
  assertManagedTmuxSessionName(sessionName)

  return sessionName
}

export function listManagedTmuxSessions(
  executor: TmuxCommandExecutor = bunTmuxCommandExecutor,
): readonly TmuxSessionName[] {
  const result = executor.run(["list-sessions", "-F", "#{session_name}"])

  if (result.exitCode !== 0) {
    return []
  }

  return result.stdout
    .split("\n")
    .map((sessionName) => sessionName.trim())
    .filter(isManagedTmuxSessionName)
}

export function isTmuxSessionAlive(
  sessionName: TmuxSessionName,
  executor: TmuxCommandExecutor = bunTmuxCommandExecutor,
): boolean {
  assertManagedTmuxSessionName(sessionName)

  return executor.run(["has-session", "-t", sessionName]).exitCode === 0
}
