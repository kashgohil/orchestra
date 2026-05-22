import { detectAgents, formatAgentDetectionReports, type CommandResolver } from "../agents"
import { loadOrchestraConfig } from "../config"
import { OrchestraError, type AbsolutePath } from "../core"
import { runGitCommand } from "../git/command"
import { discoverGitRepo, type GitRepoInfo } from "../git/repo"
import { openGlobalIndexStore } from "../store/global-index-store"
import { openRepoStore } from "../store/repo-store"
import { detectTmux, type TmuxCommandExecutor } from "../tmux"

export interface DoctorCommandOptions {
  readonly cwd?: AbsolutePath
  readonly homeDir?: AbsolutePath
  readonly tmuxExecutor?: TmuxCommandExecutor
  readonly commandResolver?: CommandResolver
}

export interface DoctorCommandResult {
  readonly exitCode: number
  readonly output: string
}

interface DoctorCheck {
  readonly name: string
  readonly status: "ok" | "warn" | "fail"
  readonly message: string
  readonly fix?: string
}

export async function runDoctorCommand(options: DoctorCommandOptions = {}): Promise<DoctorCommandResult> {
  const checks: DoctorCheck[] = []
  let repoInfo: GitRepoInfo | undefined

  checks.push(checkBun())
  checks.push(checkGitCommand(options.cwd))

  try {
    repoInfo = discoverGitRepo(options.cwd)
    checks.push({
      name: "repo",
      status: "ok",
      message: `${repoInfo.rootPath} on ${repoInfo.currentBranch} at ${repoInfo.headCommit.slice(0, 8)}`,
    })
    checks.push(checkRepoState(repoInfo))
  } catch (error) {
    checks.push({
      name: "repo",
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
      fix: error instanceof OrchestraError && error.hint !== undefined ? error.hint : "Run doctor inside a git repository.",
    })
  }

  checks.push(checkTmux(options.tmuxExecutor))
  checks.push(checkGlobalStore(options))

  if (repoInfo !== undefined) {
    checks.push(checkRepoStore(repoInfo))
  }

  const agentReport = await checkAgents({
    ...options,
    ...(repoInfo === undefined ? {} : { repoRoot: repoInfo.rootPath }),
  })
  checks.push(agentReport.check)

  return {
    exitCode: checks.some((check) => check.status === "fail") ? 1 : 0,
    output: formatDoctorReport(checks, agentReport.details),
  }
}

function checkBun(): DoctorCheck {
  const version = process.versions.bun

  if (version === undefined) {
    return {
      name: "bun",
      status: "fail",
      message: "Bun runtime was not detected.",
      fix: "Run Orchestra with Bun.",
    }
  }

  return {
    name: "bun",
    status: "ok",
    message: version,
  }
}

function checkGitCommand(cwd: AbsolutePath | undefined): DoctorCheck {
  const result = runGitCommand(["--version"], {
    cwd: cwd ?? process.cwd(),
    allowFailure: true,
  })

  if (result.exitCode !== 0) {
    return {
      name: "git",
      status: "fail",
      message: result.stderr.trim() || result.stdout.trim() || "git command failed.",
      fix: "Install Git and make sure `git --version` works.",
    }
  }

  return {
    name: "git",
    status: "ok",
    message: result.stdout.trim(),
  }
}

function checkRepoState(repoInfo: GitRepoInfo): DoctorCheck {
  const result = runGitCommand(["status", "--porcelain=v1"], {
    cwd: repoInfo.rootPath,
    allowFailure: true,
  })

  if (result.exitCode !== 0) {
    return {
      name: "repo-state",
      status: "fail",
      message: result.stderr.trim() || result.stdout.trim() || "Unable to inspect git status.",
      fix: "Fix the git repository state, then rerun `orchestra doctor`.",
    }
  }

  if (result.stdout.trim().length > 0) {
    return {
      name: "repo-state",
      status: "warn",
      message: "Source repo has uncommitted changes.",
      fix: "Commit, stash, or intentionally keep the changes before merging Orchestra tasks.",
    }
  }

  return {
    name: "repo-state",
    status: "ok",
    message: "Source repo is clean.",
  }
}

function checkTmux(executor: TmuxCommandExecutor | undefined): DoctorCheck {
  const tmux = detectTmux(executor)

  if (!tmux.available) {
    return {
      name: "tmux",
      status: "fail",
      message: tmux.reason ?? "tmux command failed.",
      fix: "Install tmux and make sure `tmux -V` works.",
    }
  }

  return {
    name: "tmux",
    status: "ok",
    message: tmux.version ?? "available",
  }
}

function checkGlobalStore(options: Pick<DoctorCommandOptions, "homeDir">): DoctorCheck {
  try {
    const store = openGlobalIndexStore(options.homeDir === undefined ? {} : { homeDir: options.homeDir })

    try {
      const versions = store.getAppliedMigrationVersions()

      return {
        name: "global-db",
        status: "ok",
        message: `${store.dbPath} (${versions.length} migrations)`,
      }
    } finally {
      store.close()
    }
  } catch (error) {
    return {
      name: "global-db",
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
      fix: "Check permissions for `~/.orchestra` or set a writable home directory.",
    }
  }
}

function checkRepoStore(repoInfo: GitRepoInfo): DoctorCheck {
  try {
    const store = openRepoStore(repoInfo.rootPath)

    try {
      const versions = store.getAppliedMigrationVersions()

      return {
        name: "repo-db",
        status: "ok",
        message: `${store.dbPath} (${versions.length} migrations)`,
      }
    } finally {
      store.close()
    }
  } catch (error) {
    return {
      name: "repo-db",
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
      fix: "Check permissions for the repo `.orchestra` directory.",
    }
  }
}

async function checkAgents(options: DoctorCommandOptions & { readonly repoRoot?: AbsolutePath }): Promise<{
  readonly check: DoctorCheck
  readonly details: string
}> {
  const loadedConfig = loadOrchestraConfig(options.repoRoot ?? options.cwd)
  const reports = await detectAgents({
    config: loadedConfig.config,
    ...(options.commandResolver === undefined ? {} : { commandResolver: options.commandResolver }),
  })
  const availableCount = reports.filter((report) => report.available).length
  const configuredCount = reports.filter((report) => report.configured).length
  const details = formatAgentDetectionReports(reports)

  if (availableCount === 0) {
    return {
      check: {
        name: "agents",
        status: "fail",
        message: "No supported agent CLI was detected.",
        fix: "Install or configure at least one supported agent: codex, claude, cursor, antigravity, gemini, or opencode.",
      },
      details,
    }
  }

  return {
    check: {
      name: "agents",
      status: configuredCount > 0 ? "ok" : "warn",
      message: `${availableCount} available, ${configuredCount} configured override${configuredCount === 1 ? "" : "s"}.`,
      ...(configuredCount > 0 ? {} : { fix: "Optionally run `orchestra init` and configure preferred agent commands in orchestra.config.json." }),
    },
    details,
  }
}

function formatDoctorReport(checks: readonly DoctorCheck[], agentDetails: string): string {
  const lines = [
    "Orchestra Doctor",
    "",
    ...checks.flatMap(formatDoctorCheck),
    "",
    "Agents:",
    agentDetails,
  ]

  return lines.join("\n")
}

function formatDoctorCheck(check: DoctorCheck): readonly string[] {
  const status = check.status.toUpperCase().padEnd(4)
  const lines = [`[${status}] ${check.name}: ${check.message}`]

  if (check.fix !== undefined) {
    lines.push(`       fix: ${check.fix}`)
  }

  return lines
}
