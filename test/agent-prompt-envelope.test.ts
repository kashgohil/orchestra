import { describe, expect, test } from "bun:test"

import { buildAgentPromptEnvelopeById, formatAgentPromptEnvelope } from "../src/agents"
import {
  createTaskBranchName,
  createTmuxSessionName,
  getTaskArtifactDir,
  getTaskArtifactManifest,
  getTaskWorktreePath,
  type Task,
} from "../src/core"

describe("agent prompt envelopes", () => {
  test("includes required task context and artifact paths", () => {
    const task = createTestTask("run")
    const artifacts = getTaskArtifactManifest(task)
    const prompt = formatAgentPromptEnvelope({
      task,
      instruction: "Fix the auth tests.",
    })

    expect(prompt).toContain("Fix the auth tests.")
    expect(prompt).toContain(`Task ID: ${task.id}`)
    expect(prompt).toContain(`Source repo: ${task.sourceRepoPath}`)
    expect(prompt).toContain(`Worktree: ${task.worktreePath}`)
    expect(prompt).toContain(`Task brief: ${artifacts.files.task}`)
    expect(prompt).toContain(`Result summary: ${artifacts.files.result}`)
    expect(prompt).toContain("Write the final implementation summary to `RESULT.md`.")
    expect(prompt).toContain("Do not coordinate directly with other agents.")
  })

  test("review tasks tell agents to write review notes", () => {
    const task = createTestTask("review", "task-parent")
    const prompt = buildAgentPromptEnvelopeById({
      agentId: "claude",
      task,
      instruction: "Review this diff.",
      context: {
        diffPath: "/tmp/diff.patch",
      },
    })

    expect(prompt).toContain("Task kind: review")
    expect(prompt).toContain("Parent task: task-parent")
    expect(prompt).toContain("Write review findings and recommendations to `REVIEW.md`.")
    expect(prompt).toContain("current diff, recent logs, and test/lint output")
    expect(prompt).toContain('"diffPath": "/tmp/diff.patch"')
  })

  test("continue tasks include parent context and continuation instructions", () => {
    const task = createTestTask("continue", "task-parent")
    const prompt = buildAgentPromptEnvelopeById({
      agentId: "codex",
      task,
      instruction: "Address the review comments.",
      context: {
        reviewPath: "/tmp/REVIEW.md",
      },
    })

    expect(prompt).toContain("Task kind: continue")
    expect(prompt).toContain("Parent task: task-parent")
    expect(prompt).toContain("Address the review comments.")
    expect(prompt).toContain("current diff, and continuation instruction")
    expect(prompt).toContain("If review notes exist, address them directly")
    expect(prompt).toContain('"reviewPath": "/tmp/REVIEW.md"')
  })
})

function createTestTask(kind: Task["kind"], parentTaskId?: string): Task {
  const taskId = `task-20260522-100000-${kind}`
  const prompt = `${kind} prompt`
  const repoRoot = "/tmp/orchestra-prompt-repo"

  return {
    id: taskId,
    repoId: "repo-1",
    ...(parentTaskId === undefined ? {} : { parentTaskId }),
    kind,
    agentId: "codex",
    status: "queued",
    prompt,
    sourceRepoPath: repoRoot,
    sourceBranch: "main",
    baseCommit: "0123456789abcdef",
    taskBranch: createTaskBranchName({ taskId, prompt }),
    worktreePath: getTaskWorktreePath(repoRoot, taskId),
    tmuxSessionName: createTmuxSessionName(taskId),
    artifactPath: getTaskArtifactDir(repoRoot, taskId),
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  }
}
