import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import { OrchestraError } from "../src/core"
import {
  discoverCurrentBranch,
  discoverGitRepo,
  discoverGitRoot,
  discoverHeadCommit,
  discoverRemotes,
} from "../src/git"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("git repo discovery", () => {
  test("detects repo root, current branch, head commit, and remotes", () => {
    const repoRoot = createGitRepo()
    const remoteRoot = createBareGitRepo()

    runGit(["remote", "add", "origin", remoteRoot], repoRoot)

    const repoInfo = discoverGitRepo(path.join(repoRoot, "nested"))

    expect(repoInfo.rootPath).toBe(repoRoot)
    expect(repoInfo.currentBranch).toBe("main")
    expect(repoInfo.headCommit).toMatch(/^[a-f0-9]{40}$/)
    expect(repoInfo.remotes).toEqual([
      {
        name: "origin",
        fetchUrl: remoteRoot,
        pushUrl: remoteRoot,
      },
    ])
  })

  test("returns an empty remote list when no remotes are configured", () => {
    const repoRoot = createGitRepo()

    expect(discoverRemotes(repoRoot)).toEqual([])
  })

  test("detects individual repo fields", () => {
    const repoRoot = createGitRepo()

    expect(discoverGitRoot(repoRoot)).toBe(repoRoot)
    expect(discoverCurrentBranch(repoRoot)).toBe("main")
    expect(discoverHeadCommit(repoRoot)).toMatch(/^[a-f0-9]{40}$/)
  })

  test("fails outside git repos with an actionable typed error", () => {
    const nonRepoPath = createTempDir()

    expect(() => discoverGitRoot(nonRepoPath)).toThrow(OrchestraError)

    try {
      discoverGitRoot(nonRepoPath)
    } catch (error) {
      expect(error).toBeInstanceOf(OrchestraError)
      expect((error as OrchestraError).code).toBe("NOT_GIT_REPO")
      expect((error as OrchestraError).hint).toBe("Run this command inside a git repository.")
    }
  })
})

function createTempDir(): string {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "orchestra-git-"))
  const realTempRoot = realpathSync(tempRoot)
  tempRoots.push(realTempRoot)

  return realTempRoot
}

function createGitRepo(): string {
  const repoRoot = createTempDir()
  const nestedDir = path.join(repoRoot, "nested")

  runGit(["init", "--initial-branch=main"], repoRoot)
  runGit(["config", "user.name", "Orchestra Test"], repoRoot)
  runGit(["config", "user.email", "orchestra@example.test"], repoRoot)
  mkdirSync(nestedDir)
  writeFileSync(path.join(repoRoot, "README.md"), "# Test Repo\n", "utf8")
  runGit(["add", "README.md"], repoRoot)
  runGit(["commit", "-m", "Initial commit"], repoRoot)

  return repoRoot
}

function createBareGitRepo(): string {
  const repoRoot = createTempDir()

  runGit(["init", "--bare"], repoRoot)

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
