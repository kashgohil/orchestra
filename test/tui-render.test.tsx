import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"

import { OrchestraTuiApp } from "../src/tui/app"
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
})
