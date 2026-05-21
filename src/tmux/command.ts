import { OrchestraError } from "../core/errors"

export interface TmuxCommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface TmuxCommandExecutor {
  run(args: readonly string[]): TmuxCommandResult
}

export const bunTmuxCommandExecutor: TmuxCommandExecutor = {
  run(args: readonly string[]): TmuxCommandResult {
    const subprocess = Bun.spawnSync({
      cmd: ["tmux", ...args],
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })

    return {
      exitCode: subprocess.exitCode,
      stdout: subprocess.stdout.toString(),
      stderr: subprocess.stderr.toString(),
    }
  },
}

export function runTmuxCommand(
  args: readonly string[],
  executor: TmuxCommandExecutor = bunTmuxCommandExecutor,
): TmuxCommandResult {
  const result = executor.run(args)

  if (result.exitCode !== 0) {
    throw new OrchestraError("TMUX_UNAVAILABLE", `tmux ${args.join(" ")} failed.`, {
      hint: result.stderr.trim() || result.stdout.trim() || "tmux returned a non-zero exit code.",
    })
  }

  return result
}
