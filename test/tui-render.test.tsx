import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"

import { OrchestraTuiApp } from "../src/tui/app"
import type { Task } from "../src/core"
import type { TuiState } from "../src/tui"

const renderers: { destroy(): void }[] = []

afterEach(() => {
  for (const renderer of renderers.splice(0)) {
    act(() => {
      renderer.destroy()
    })
  }
})

describe("OpenTUI app", () => {
  test("renders the empty-state command center", async () => {
    const state: TuiState = {
      repo: {
        rootPath: "/repo",
        currentBranch: "main",
        headCommit: "0123456789abcdef",
      },
      tasks: [],
      loadedAt: "2026-05-22T10:00:00.000Z",
    }
    const result = await testRender(<OrchestraTuiApp initialState={state} refreshMs={60_000} />, {
      width: 110,
      height: 32,
    })
    renderers.push(result.renderer)

    await act(async () => {
      await result.renderOnce()
    })

    const frame = result.captureCharFrame()

    expect(frame).toContain("Orchestra")
    expect(frame).toContain("No tasks in this repo.")
    expect(frame).toContain("ask codex to fix failing tests")
  })

  test("renders parent and child relationships in task detail", async () => {
    const parentTask = createRenderTask("task-parent", "run")
    const reviewTask = createRenderTask("task-review", "review", parentTask.id)
    const state: TuiState = {
      repo: {
        rootPath: "/repo",
        currentBranch: "main",
        headCommit: "0123456789abcdef",
      },
      tasks: [parentTask, reviewTask],
      selectedTaskId: parentTask.id,
      detail: {
        task: parentTask,
        events: [],
        stdoutTail: "",
        stderrTail: "",
        changedFiles: [],
      },
      loadedAt: "2026-05-22T10:00:00.000Z",
    }
    const result = await testRender(<OrchestraTuiApp initialState={state} refreshMs={60_000} />, {
      width: 140,
      height: 36,
    })
    renderers.push(result.renderer)

    await act(async () => {
      await result.renderOnce()
    })

    const frame = result.captureCharFrame()

    expect(frame).toContain("Relationships")
    expect(frame).toContain("children task-review:review:running")
  })
})

function createRenderTask(id: string, kind: Task["kind"], parentTaskId?: string): Task {
  return {
    id,
    repoId: "repo-1",
    ...(parentTaskId === undefined ? {} : { parentTaskId }),
    kind,
    agentId: kind === "review" ? "claude" : "codex",
    status: "running",
    prompt: `${kind} prompt`,
    sourceRepoPath: "/repo",
    sourceBranch: "main",
    baseCommit: "0123456789abcdef",
    taskBranch: "orchestra/task",
    worktreePath: "/repo/.orchestra-worktrees/task",
    tmuxSessionName: `orchestra-${id}`,
    artifactPath: `/repo/.orchestra/tasks/${id}`,
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  }
}
