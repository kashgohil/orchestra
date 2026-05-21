import path from "node:path"

import { OrchestraError } from "../core/errors"
import type { AbsolutePath } from "../core/types"

export interface GitCommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface RunGitCommandOptions {
  readonly cwd: AbsolutePath
  readonly allowFailure?: boolean
}

export function runGitCommand(args: readonly string[], options: RunGitCommandOptions): GitCommandResult {
  const subprocess = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd: path.resolve(options.cwd),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const result = {
    exitCode: subprocess.exitCode,
    stdout: subprocess.stdout.toString(),
    stderr: subprocess.stderr.toString(),
  }

  if (!options.allowFailure && result.exitCode !== 0) {
    throw new OrchestraError("GIT_COMMAND_FAILED", `git ${args.join(" ")} failed.`, {
      hint: result.stderr.trim() || result.stdout.trim() || "Git returned a non-zero exit code.",
    })
  }

  return result
}

export function runGitText(args: readonly string[], options: RunGitCommandOptions): string {
  return runGitCommand(args, options).stdout.trim()
}
