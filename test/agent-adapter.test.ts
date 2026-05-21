import { describe, expect, test } from "bun:test"

import { createTaskBranchName, createTmuxSessionName, getTaskArtifactDir, getTaskWorktreePath } from "../src/core"
import { buildArgs, createAgentAdapter } from "../src/agents"
import type { Task } from "../src/core"

describe("agent adapter framework", () => {
  test("builds launch commands without requiring the binary to exist", () => {
    const adapter = createAgentAdapter({
      id: "fixture",
      displayName: "Fixture Agent",
      defaultCommand: "fixture-agent",
      defaultArgs: ["--work"],
      requiresTty: true,
    })
    const task = createTestTask()

    expect(
      adapter.buildLaunchCommand({
        task,
        prompt: "Fix tests",
      }),
    ).toEqual({
      command: "fixture-agent",
      args: ["--work", "Fix tests"],
      cwd: task.worktreePath,
      env: {},
    })
  })

  test("respects exact command override templates", () => {
    const adapter = createAgentAdapter({
      id: "fixture",
      displayName: "Fixture Agent",
      defaultCommand: "fixture-agent",
      defaultArgs: ["--prompt", "{prompt}"],
      requiresTty: true,
    })
    const task = createTestTask()

    expect(
      adapter.buildLaunchCommand({
        task,
        prompt: "Fix safely",
        commandOverride: {
          command: "custom-agent",
          args: ["run", "--message={prompt}", "--json"],
          env: {
            CUSTOM_ENV: "1",
          },
        },
      }),
    ).toEqual({
      command: "custom-agent",
      args: ["run", "--message=Fix safely", "--json"],
      cwd: task.worktreePath,
      env: {
        CUSTOM_ENV: "1",
      },
    })
  })

  test("can disable implicit prompt appending for exact overrides", () => {
    expect(
      buildArgs(
        {
          command: "custom-agent",
          args: ["resume"],
          appendPrompt: false,
        },
        ["{prompt}"],
        "Do not append",
      ),
    ).toEqual(["resume"])
  })

  test("detects missing commands without throwing", async () => {
    const adapter = createAgentAdapter({
      id: "fixture",
      displayName: "Fixture Agent",
      defaultCommand: "fixture-agent",
      defaultArgs: [],
      requiresTty: true,
    })

    await expect(
      adapter.detect({
        env: {},
        commandResolver: () => undefined,
      }),
    ).resolves.toEqual({
      available: false,
      command: "fixture-agent",
      reason: "Command 'fixture-agent' was not found on PATH.",
    })
  })

  test("uses command overrides during detection", async () => {
    const adapter = createAgentAdapter({
      id: "fixture",
      displayName: "Fixture Agent",
      defaultCommand: "fixture-agent",
      defaultArgs: [],
      requiresTty: true,
    })

    await expect(
      adapter.detect({
        env: {},
        commandOverride: {
          command: "custom-agent",
        },
        commandResolver: (command) => (command === "custom-agent" ? "/bin/custom-agent" : undefined),
      }),
    ).resolves.toEqual({
      available: true,
      command: "/bin/custom-agent",
    })
  })
})

function createTestTask(): Task {
  const taskId = "task-20260522-100000-agent"
  const prompt = "Test agent"
  const repoRoot = "/tmp/orchestra-agent-repo"

  return {
    id: taskId,
    repoId: "repo-1",
    kind: "run",
    agentId: "fixture",
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
