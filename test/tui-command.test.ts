import { describe, expect, test } from "bun:test"

import { commandForShortcut, executeTuiCommand, parseComposerCommand } from "../src/tui"

describe("TUI command helpers", () => {
  test("parses slash commands, orchestra-prefixed commands, and quoted arguments", () => {
    expect(parseComposerCommand('/run "fix auth tests" --agent codex')).toEqual([
      "run",
      "fix auth tests",
      "--agent",
      "codex",
    ])
    expect(parseComposerCommand("orchestra logs task-123 --events")).toEqual([
      "logs",
      "task-123",
      "--events",
    ])
  })

  test("formats selected-task shortcut commands", () => {
    expect(commandForShortcut("logs", "task-123")).toBe("logs task-123")
    expect(commandForShortcut("diff", "task-123")).toBe("diff task-123")
    expect(commandForShortcut("stop", undefined)).toBe("")
  })

  test("unknown commands return actionable errors", async () => {
    const result = await executeTuiCommand("/unknown")

    expect(result.ok).toBe(false)
    expect(result.message).toContain("Unknown TUI command")
    expect(result.message).toContain("/run")
  })
})
