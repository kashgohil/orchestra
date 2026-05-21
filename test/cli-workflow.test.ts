import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import { ORCHESTRA_CONFIG_FILE } from "../src/config"
import {
  createTaskBranchName,
  createTmuxSessionName,
  getRepoId,
  getRepoStorePath,
  getTaskArtifactDir,
  getTaskWorktreePath,
  type Task,
} from "../src/core"
import { runCli } from "../src/cli/main"
import { openRepoStore } from "../src/store"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("CLI workflow", () => {
  test("init creates repo config, repo store, and global index entries", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-cli-home-")
    const output: string[] = []

    const exitCode = await runCli(["init"], {
      cwd: repoRoot,
      homeDir,
      now: fixedClock(),
      stdout: (message) => output.push(message),
    })

    expect(exitCode).toBe(0)
    expect(output.join("\n")).toContain("Initialized Orchestra repo.")
    expect(existsSync(path.join(repoRoot, ORCHESTRA_CONFIG_FILE))).toBe(true)
    expect(existsSync(getRepoStorePath(repoRoot))).toBe(true)
    expect(existsSync(path.join(homeDir, ".orchestra", "index.sqlite"))).toBe(true)
    expect(readFileSync(path.join(repoRoot, ORCHESTRA_CONFIG_FILE), "utf8")).toContain(
      '"defaultAgent": "codex"',
    )
  })

  test("status prints an empty state and JSON task data", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-cli-home-")
    const textOutput: string[] = []
    const jsonOutput: string[] = []

    expect(
      await runCli(["status"], {
        cwd: repoRoot,
        homeDir,
        tmuxExecutor: emptyTmuxExecutor(),
        stdout: (message) => textOutput.push(message),
      }),
    ).toBe(0)
    expect(textOutput.join("\n")).toContain("No tasks found.")

    const store = openRepoStore(repoRoot)
    const task = createTestTask(repoRoot, "task-20260522-100000-status", "Fix the auth tests")
    store.createTask(task)
    store.close()

    expect(
      await runCli(["status", "--json"], {
        cwd: repoRoot,
        homeDir,
        tmuxExecutor: emptyTmuxExecutor(),
        stdout: (message) => jsonOutput.push(message),
      }),
    ).toBe(0)

    const parsed = JSON.parse(jsonOutput.join("\n")) as { tasks: readonly Task[] }
    expect(parsed.tasks).toHaveLength(1)
    expect(parsed.tasks[0]?.id).toBe(task.id)
  })

  test("agents supports JSON output", async () => {
    const output: string[] = []

    expect(
      await runCli(["agents", "--json"], {
        commandResolver: (command) => (command === "codex" ? "/bin/codex" : undefined),
        stdout: (message) => output.push(message),
      }),
    ).toBe(0)

    const reports = JSON.parse(output.join("\n")) as readonly { id: string; available: boolean }[]

    expect(reports.find((report) => report.id === "codex")?.available).toBe(true)
    expect(reports.find((report) => report.id === "opencode")?.available).toBe(false)
  })
})

function fixedClock(): () => Date {
  return () => new Date("2026-05-22T10:00:00.000Z")
}

function createTestTask(repoRoot: string, taskId: string, prompt: string): Task {
  return {
    id: taskId,
    repoId: getRepoId(repoRoot),
    kind: "run",
    agentId: "codex",
    status: "queued",
    prompt,
    sourceRepoPath: repoRoot,
    sourceBranch: "main",
    baseCommit: runGitText(["rev-parse", "HEAD"], repoRoot),
    taskBranch: createTaskBranchName({ taskId, prompt }),
    worktreePath: getTaskWorktreePath(repoRoot, taskId),
    tmuxSessionName: createTmuxSessionName(taskId),
    artifactPath: getTaskArtifactDir(repoRoot, taskId),
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  }
}

function emptyTmuxExecutor() {
  return {
    run() {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "no tmux in test",
      }
    },
  }
}

function createTempDir(prefix: string): string {
  const tempRoot = mkdtempSync(path.join(tmpdir(), prefix))
  const realTempRoot = realpathSync(tempRoot)
  tempRoots.push(realTempRoot)

  return realTempRoot
}

function createGitRepo(): string {
  const repoRoot = createTempDir("orchestra-cli-repo-")

  runGit(["init", "--initial-branch=main"], repoRoot)
  runGit(["config", "user.name", "Orchestra Test"], repoRoot)
  runGit(["config", "user.email", "orchestra@example.test"], repoRoot)
  writeFileSync(path.join(repoRoot, "README.md"), "# Test Repo\n", "utf8")
  runGit(["add", "README.md"], repoRoot)
  runGit(["commit", "-m", "Initial commit"], repoRoot)

  return repoRoot
}

function runGit(args: readonly string[], cwd: string): void {
  const subprocess = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  if (subprocess.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed\n${subprocess.stdout.toString()}\n${subprocess.stderr.toString()}`,
    )
  }
}

function runGitText(args: readonly string[], cwd: string): string {
  const subprocess = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  if (subprocess.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed\n${subprocess.stdout.toString()}\n${subprocess.stderr.toString()}`,
    )
  }

  return subprocess.stdout.toString().trim()
}
