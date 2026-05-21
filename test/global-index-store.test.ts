import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import { OrchestraError, createRepoSlug, getRepoStorePath } from "../src/core"
import { openGlobalIndexStore } from "../src/store"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("GlobalIndexStore", () => {
  test("initializes ~/.orchestra/index.sqlite-style path idempotently", () => {
    const homeDir = createTempHome()
    const store = openGlobalIndexStore({ homeDir })

    expect(store.dbPath).toBe(path.join(homeDir, ".orchestra", "index.sqlite"))
    expect(store.getAppliedMigrationVersions()).toEqual([1])
    store.initialize()
    expect(store.getAppliedMigrationVersions()).toEqual([1])
    store.close()
  })

  test("tracks known repos without scanning the filesystem", () => {
    const homeDir = createTempHome()
    const repoRoot = path.join(homeDir, "Projects", "Example Repo")
    const repoId = "repo-1"
    const store = openGlobalIndexStore({ homeDir })
    const repo = store.registerRepo({
      id: repoId,
      slug: createRepoSlug(repoRoot),
      rootPath: repoRoot,
      displayName: "Example Repo",
      storePath: getRepoStorePath(repoRoot),
      now: "2026-05-22T10:00:00.000Z",
    })

    expect(repo).toEqual({
      id: repoId,
      slug: createRepoSlug(repoRoot),
      rootPath: path.resolve(repoRoot),
      displayName: "Example Repo",
      storePath: path.resolve(getRepoStorePath(repoRoot)),
      createdAt: "2026-05-22T10:00:00.000Z",
      updatedAt: "2026-05-22T10:00:00.000Z",
      lastSeenAt: "2026-05-22T10:00:00.000Z",
    })
    expect(store.listRepos()).toEqual([repo])
    store.close()
  })

  test("updates existing repos while preserving createdAt", () => {
    const homeDir = createTempHome()
    const repoRoot = path.join(homeDir, "Projects", "Example Repo")
    const store = openGlobalIndexStore({ homeDir })

    store.registerRepo({
      id: "repo-1",
      slug: "example-repo-old",
      rootPath: repoRoot,
      displayName: "Old Name",
      storePath: getRepoStorePath(repoRoot),
      now: "2026-05-22T10:00:00.000Z",
    })

    const updatedRepo = store.registerRepo({
      id: "repo-1",
      slug: "example-repo-new",
      rootPath: repoRoot,
      displayName: "New Name",
      storePath: getRepoStorePath(repoRoot),
      now: "2026-05-22T11:00:00.000Z",
    })

    expect(updatedRepo.createdAt).toBe("2026-05-22T10:00:00.000Z")
    expect(updatedRepo.updatedAt).toBe("2026-05-22T11:00:00.000Z")
    expect(updatedRepo.lastSeenAt).toBe("2026-05-22T11:00:00.000Z")
    expect(updatedRepo.slug).toBe("example-repo-new")
    expect(updatedRepo.displayName).toBe("New Name")
    store.close()
  })

  test("tracks latest task summary per repo", () => {
    const homeDir = createTempHome()
    const repoRoot = path.join(homeDir, "Projects", "Example Repo")
    const store = openGlobalIndexStore({ homeDir })

    store.registerRepo({
      id: "repo-1",
      slug: createRepoSlug(repoRoot),
      rootPath: repoRoot,
      displayName: "Example Repo",
      storePath: getRepoStorePath(repoRoot),
      now: "2026-05-22T10:00:00.000Z",
    })

    const summary = store.updateRepoTaskSummary({
      repoId: "repo-1",
      latestTaskId: "task-20260522-100000-alpha",
      latestTaskStatus: "running",
      latestTaskAgentId: "codex",
      latestTaskPrompt: "Fix auth tests",
      latestTaskUpdatedAt: "2026-05-22T10:05:00.000Z",
      runningTaskCount: 1,
      updatedAt: "2026-05-22T10:06:00.000Z",
    })

    expect(summary).toEqual({
      repoId: "repo-1",
      latestTaskId: "task-20260522-100000-alpha",
      latestTaskStatus: "running",
      latestTaskAgentId: "codex",
      latestTaskPrompt: "Fix auth tests",
      latestTaskUpdatedAt: "2026-05-22T10:05:00.000Z",
      runningTaskCount: 1,
      updatedAt: "2026-05-22T10:06:00.000Z",
    })

    expect(store.listIndexedRepos()).toEqual([
      {
        repo: store.requireRepo("repo-1"),
        taskSummary: summary,
      },
    ])
    store.close()
  })

  test("persists indexed repos and summaries after reopening", () => {
    const homeDir = createTempHome()
    const repoRoot = path.join(homeDir, "Projects", "Example Repo")

    const firstStore = openGlobalIndexStore({ homeDir })
    firstStore.registerRepo({
      id: "repo-1",
      slug: createRepoSlug(repoRoot),
      rootPath: repoRoot,
      displayName: "Example Repo",
      storePath: getRepoStorePath(repoRoot),
      now: "2026-05-22T10:00:00.000Z",
    })
    firstStore.updateRepoTaskSummary({
      repoId: "repo-1",
      latestTaskId: "task-20260522-100000-alpha",
      latestTaskStatus: "completed",
      runningTaskCount: 0,
      updatedAt: "2026-05-22T10:10:00.000Z",
    })
    firstStore.close()

    const secondStore = openGlobalIndexStore({ homeDir })
    expect(secondStore.listIndexedRepos()).toHaveLength(1)
    expect(secondStore.requireRepoTaskSummary("repo-1")).toMatchObject({
      repoId: "repo-1",
      latestTaskId: "task-20260522-100000-alpha",
      latestTaskStatus: "completed",
      runningTaskCount: 0,
      updatedAt: "2026-05-22T10:10:00.000Z",
    })
    secondStore.close()
  })

  test("throws typed errors for missing indexed records", () => {
    const homeDir = createTempHome()
    const store = openGlobalIndexStore({ homeDir })

    expect(() => store.requireRepo("missing-repo")).toThrow(OrchestraError)
    expect(() => store.requireRepoTaskSummary("missing-repo")).toThrow(OrchestraError)
    store.close()
  })
})

function createTempHome(): string {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "orchestra-global-index-"))
  tempRoots.push(tempRoot)

  return tempRoot
}
