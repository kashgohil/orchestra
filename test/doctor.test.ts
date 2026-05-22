import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import { runCli } from "../src/cli/main"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("doctor command", () => {
  test("reports a usable local setup", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-doctor-home-")
    const output: string[] = []

    const exitCode = await runCli(["doctor"], {
      cwd: repoRoot,
      homeDir,
      commandResolver: (command) => (command === "codex" ? "/usr/local/bin/codex" : undefined),
      tmuxExecutor: {
        run: (args) => ({
          exitCode: args[0] === "-V" ? 0 : 1,
          stdout: args[0] === "-V" ? "tmux 3.4\n" : "",
          stderr: "",
        }),
      },
      stdout: (message) => output.push(message),
    })
    const text = output.join("\n")

    expect(exitCode).toBe(0)
    expect(text).toContain("Orchestra Doctor")
    expect(text).toContain("[OK  ] bun:")
    expect(text).toContain("[OK  ] git:")
    expect(text).toContain("[OK  ] repo:")
    expect(text).toContain("[OK  ] tmux: tmux 3.4")
    expect(text).toContain("[OK  ] global-db:")
    expect(text).toContain("[OK  ] repo-db:")
    expect(text).toContain("codex")
    expect(text).toContain("available")
  })

  test("returns non-zero with fixes for missing tmux and agents", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-doctor-home-")
    const output: string[] = []

    const exitCode = await runCli(["doctor"], {
      cwd: repoRoot,
      homeDir,
      commandResolver: () => undefined,
      tmuxExecutor: {
        run: () => ({
          exitCode: 1,
          stdout: "",
          stderr: "tmux not found",
        }),
      },
      stdout: (message) => output.push(message),
    })
    const text = output.join("\n")

    expect(exitCode).toBe(1)
    expect(text).toContain("[FAIL] tmux: tmux not found")
    expect(text).toContain("fix: Install tmux")
    expect(text).toContain("[FAIL] agents: No supported agent CLI was detected.")
    expect(text).toContain("Install or configure at least one supported agent")
  })

  test("warns when source repo has uncommitted changes", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-doctor-home-")
    const output: string[] = []

    writeFileSync(path.join(repoRoot, "dirty.txt"), "dirty\n", "utf8")

    const exitCode = await runCli(["doctor"], {
      cwd: repoRoot,
      homeDir,
      commandResolver: (command) => (command === "codex" ? "/usr/local/bin/codex" : undefined),
      tmuxExecutor: {
        run: () => ({
          exitCode: 0,
          stdout: "tmux 3.4\n",
          stderr: "",
        }),
      },
      stdout: (message) => output.push(message),
    })
    const text = output.join("\n")

    expect(exitCode).toBe(0)
    expect(text).toContain("[WARN] repo-state: Source repo has uncommitted changes.")
    expect(text).toContain("Commit, stash, or intentionally keep")
  })
})

function createGitRepo(): string {
  const tempRoot = createTempDir("orchestra-doctor-repo-")
  const repoRoot = path.join(tempRoot, "repo")

  mkdirSync(repoRoot)
  runGit(["init", "--initial-branch=main"], repoRoot)
  runGit(["config", "user.name", "Orchestra Test"], repoRoot)
  runGit(["config", "user.email", "orchestra@example.test"], repoRoot)
  writeFileSync(path.join(repoRoot, ".gitignore"), ".orchestra/\n.orchestra-worktrees/\n", "utf8")
  writeFileSync(path.join(repoRoot, "README.md"), "# Test Repo\n", "utf8")
  runGit(["add", ".gitignore", "README.md"], repoRoot)
  runGit(["commit", "-m", "Initial commit"], repoRoot)

  return repoRoot
}

function createTempDir(prefix: string): string {
  const tempRoot = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)))
  tempRoots.push(tempRoot)

  return tempRoot
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
