import { describe, expect, test } from "bun:test"

import { buildAgentLaunchCommandById } from "../src/agents"
import {
  OrchestraError,
  createTaskBranchName,
  createTmuxSessionName,
  getTaskArtifactDir,
  getTaskWorktreePath,
  type AgentId,
  type Task,
} from "../src/core"

describe("built-in agent launch commands", () => {
  test.each([
    ["codex", "codex", ["Fix tests"]],
    ["claude", "claude", ["Fix tests"]],
    ["cursor", "cursor-agent", ["Fix tests"]],
    ["antigravity", "antigravity", ["Fix tests"]],
    ["gemini", "gemini", ["-p", "Fix tests"]],
    ["opencode", "opencode", ["run", "Fix tests"]],
  ] as const)("builds a tmux-ready command for %s", (agentId, command, args) => {
    const task = createTestTask(agentId)

    expect(
      buildAgentLaunchCommandById({
        agentId,
        task,
        prompt: "Fix tests",
      }),
    ).toEqual({
      command,
      args,
      cwd: task.worktreePath,
      env: {},
    })
  })

  test("uses exact configured command templates", () => {
    const task = createTestTask("codex")

    expect(
      buildAgentLaunchCommandById({
        agentId: "codex",
        task,
        prompt: "Fix safely",
        config: {
          agents: {
            codex: {
              command: "codex-custom",
              args: ["exec", "--cwd", "{prompt}"],
              env: {
                CODEX_HOME: "/tmp/codex-home",
              },
            },
          },
        },
      }),
    ).toEqual({
      command: "codex-custom",
      args: ["exec", "--cwd", "Fix safely"],
      cwd: task.worktreePath,
      env: {
        CODEX_HOME: "/tmp/codex-home",
      },
    })
  })

  test("passes prompt as an argument, not a shell-concatenated string", () => {
    const task = createTestTask("cursor")
    const prompt = 'Fix "quoted" tests && rm -rf nope'

    expect(
      buildAgentLaunchCommandById({
        agentId: "cursor",
        task,
        prompt,
      }).args,
    ).toEqual([prompt])
  })

  test("throws a typed error for unknown agents", () => {
    expect(() =>
      buildAgentLaunchCommandById({
        agentId: "unknown-agent",
        task: createTestTask("unknown-agent"),
        prompt: "Fix tests",
      }),
    ).toThrow(OrchestraError)
  })
})

function createTestTask(agentId: AgentId): Task {
  const taskId = "task-20260522-100000-launch"
  const prompt = "Test launch"
  const repoRoot = "/tmp/orchestra-launch-repo"

  return {
    id: taskId,
    repoId: "repo-1",
    kind: "run",
    agentId,
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
