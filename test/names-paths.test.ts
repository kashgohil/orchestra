import path from "node:path"
import { describe, expect, test } from "bun:test"

import {
  createRepoSlug,
  createTaskBranchName,
  createTaskId,
  createTaskSlug,
  createTmuxSessionName,
  getRepoStateDir,
  getRepoStorePath,
  getTaskArtifactDir,
  getTaskArtifactPath,
  getTaskArtifactPaths,
  getTaskWorktreePath,
  getWorktreeRoot,
  sanitizeNameComponent,
} from "../src/core"

const REPO_ROOT = "/Users/kgohil/Projects/My Repo"
const TASK_ID = "task-20260521-123456-abc123"

describe("name helpers", () => {
  test("sanitizes unsafe input into lowercase ASCII components", () => {
    expect(sanitizeNameComponent(" Fix Auth Bug!! ")).toBe("fix-auth-bug")
    expect(sanitizeNameComponent("Cafe\u0301 + Billing / Retry")).toBe("cafe-billing-retry")
    expect(sanitizeNameComponent("!!!", { fallback: "task" })).toBe("task")
    expect(sanitizeNameComponent("alpha beta gamma", { maxLength: 10 })).toBe("alpha-beta")
  })

  test("creates deterministic task ids when time and token are provided", () => {
    expect(
      createTaskId({
        now: new Date("2026-05-21T12:34:56.789Z"),
        token: "A B/C",
      }),
    ).toBe("task-20260521-123456-a-b-c")
  })

  test("creates deterministic repo slugs with a path hash", () => {
    const slug = createRepoSlug(REPO_ROOT)

    expect(slug).toMatch(/^my-repo-[a-f0-9]{8}$/)
    expect(createRepoSlug(REPO_ROOT)).toBe(slug)
  })

  test("creates branch and task slugs without shell-unsafe characters", () => {
    const branch = createTaskBranchName({
      taskId: TASK_ID,
      prompt: "Fix Auth Bug!! Then add tests.",
    })

    expect(createTaskSlug("Fix Auth Bug!! Then add tests.")).toBe("fix-auth-bug-then-add-tests")
    expect(branch).toBe("orchestra/task-20260521-123456-abc123-fix-auth-bug-then-add-tests")
    expect(branch).toMatch(/^[a-z0-9][a-z0-9/-]*[a-z0-9]$/)
    expect(branch).not.toContain(" ")
    expect(branch).not.toContain("..")
  })

  test("creates tmux session names without tmux target separators", () => {
    const sessionName = createTmuxSessionName(TASK_ID)

    expect(sessionName).toBe("orchestra-task-20260521-123456-abc123")
    expect(sessionName).not.toContain(":")
    expect(sessionName).toMatch(/^[a-z0-9-]+$/)
  })
})

describe("path helpers", () => {
  test("creates deterministic repo state paths", () => {
    expect(getRepoStateDir(REPO_ROOT)).toBe(path.join(REPO_ROOT, ".orchestra"))
    expect(getRepoStorePath(REPO_ROOT)).toBe(path.join(REPO_ROOT, ".orchestra", "orchestra.sqlite"))
  })

  test("creates deterministic artifact paths", () => {
    const artifactDir = path.join(REPO_ROOT, ".orchestra", "tasks", TASK_ID)

    expect(getTaskArtifactDir(REPO_ROOT, TASK_ID)).toBe(artifactDir)
    expect(getTaskArtifactPath(REPO_ROOT, TASK_ID, "task")).toBe(path.join(artifactDir, "TASK.md"))
    expect(getTaskArtifactPath(REPO_ROOT, TASK_ID, "event-log")).toBe(path.join(artifactDir, "LOG.jsonl"))
    expect(getTaskArtifactPaths(REPO_ROOT, TASK_ID)).toEqual({
      task: path.join(artifactDir, "TASK.md"),
      plan: path.join(artifactDir, "PLAN.md"),
      result: path.join(artifactDir, "RESULT.md"),
      review: path.join(artifactDir, "REVIEW.md"),
      "event-log": path.join(artifactDir, "LOG.jsonl"),
      stdout: path.join(artifactDir, "stdout.log"),
      stderr: path.join(artifactDir, "stderr.log"),
      diff: path.join(artifactDir, "diff.patch"),
    })
  })

  test("creates sibling worktree paths", () => {
    const repoSlug = createRepoSlug(REPO_ROOT)

    expect(getWorktreeRoot(REPO_ROOT)).toBe(
      path.join("/Users/kgohil/Projects", ".orchestra-worktrees", repoSlug),
    )
    expect(getTaskWorktreePath(REPO_ROOT, TASK_ID)).toBe(
      path.join("/Users/kgohil/Projects", ".orchestra-worktrees", repoSlug, TASK_ID),
    )
  })
})
