import path from "node:path"

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
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`)
  }

  return result
}

export function runGitText(args: readonly string[], options: RunGitCommandOptions): string {
  return runGitCommand(args, options).stdout.trim()
}
