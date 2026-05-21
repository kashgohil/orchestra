import { describe, expect, test } from "bun:test"

import { OrchestraError } from "../src/core"
import {
  assertManagedTmuxSessionName,
  createManagedTmuxSessionName,
  detectTmux,
  isManagedTmuxSessionName,
  isTmuxSessionAlive,
  listManagedTmuxSessions,
  type TmuxCommandExecutor,
} from "../src/tmux"

describe("tmux session model", () => {
  test("detects tmux availability through the executor", () => {
    expect(
      detectTmux(
        fakeTmuxExecutor({
          "-V": {
            exitCode: 0,
            stdout: "tmux 3.6a\n",
            stderr: "",
          },
        }),
      ),
    ).toEqual({
      available: true,
      command: "tmux",
      version: "tmux 3.6a",
    })
  })

  test("reports tmux detection failures without throwing", () => {
    expect(
      detectTmux(
        fakeTmuxExecutor({
          "-V": {
            exitCode: 1,
            stdout: "",
            stderr: "tmux: command not found",
          },
        }),
      ),
    ).toEqual({
      available: false,
      command: "tmux",
      reason: "tmux: command not found",
    })
  })

  test("creates and validates managed session names", () => {
    expect(createManagedTmuxSessionName("task-20260522-100000-alpha")).toBe(
      "orchestra-task-20260522-100000-alpha",
    )
    expect(isManagedTmuxSessionName("orchestra-task-20260522-100000-alpha")).toBe(true)
    expect(isManagedTmuxSessionName("not-orchestra")).toBe(false)
    expect(isManagedTmuxSessionName("orchestra-bad:name")).toBe(false)
    expect(() => assertManagedTmuxSessionName("other-session")).toThrow(OrchestraError)
  })

  test("lists only managed sessions", () => {
    expect(
      listManagedTmuxSessions(
        fakeTmuxExecutor({
          "list-sessions -F #{session_name}": {
            exitCode: 0,
            stdout: "orchestra-task-1\nother-session\norchestra-task-2\n",
            stderr: "",
          },
        }),
      ),
    ).toEqual(["orchestra-task-1", "orchestra-task-2"])
  })

  test("returns an empty managed session list when tmux has no server", () => {
    expect(
      listManagedTmuxSessions(
        fakeTmuxExecutor({
          "list-sessions -F #{session_name}": {
            exitCode: 1,
            stdout: "",
            stderr: "no server running",
          },
        }),
      ),
    ).toEqual([])
  })

  test("checks if managed sessions are alive", () => {
    expect(
      isTmuxSessionAlive(
        "orchestra-task-1",
        fakeTmuxExecutor({
          "has-session -t orchestra-task-1": {
            exitCode: 0,
            stdout: "",
            stderr: "",
          },
        }),
      ),
    ).toBe(true)

    expect(
      isTmuxSessionAlive(
        "orchestra-task-2",
        fakeTmuxExecutor({
          "has-session -t orchestra-task-2": {
            exitCode: 1,
            stdout: "",
            stderr: "can't find session",
          },
        }),
      ),
    ).toBe(false)
  })
})

function fakeTmuxExecutor(results: Record<string, ReturnType<TmuxCommandExecutor["run"]>>): TmuxCommandExecutor {
  return {
    run(args: readonly string[]) {
      const key = args.join(" ")
      const result = results[key]

      if (result === undefined) {
        return {
          exitCode: 99,
          stdout: "",
          stderr: `Unexpected tmux command: ${key}`,
        }
      }

      return result
    },
  }
}
