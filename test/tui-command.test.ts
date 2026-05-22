import { describe, expect, test } from "bun:test"

import {
  commandForShortcut,
  executeTuiCommand,
  getTuiCommandConfirmation,
  parseComposerCommand,
  parseTuiCommand,
} from "../src/tui"

describe("TUI command helpers", () => {
  test("parses slash commands, orchestra-prefixed commands, and quoted arguments", () => {
    expect(parseComposerCommand('/run "fix auth tests" --agent codex')).toEqual([
      "run",
      "fix auth tests",
      "--agent",
      "codex",
    ])
    expect(parseComposerCommand("/run codex fix auth tests")).toEqual([
      "run",
      "fix",
      "auth",
      "tests",
      "--agent",
      "codex",
    ])
    expect(parseComposerCommand("orchestra logs task-123 --events")).toEqual([
      "logs",
      "task-123",
      "--events",
    ])
  })

  test("parses documented slash commands deterministically", () => {
    expect(parseComposerCommand("/review task-123 --agent claude")).toEqual([
      "review",
      "task-123",
      "--agent",
      "claude",
    ])
    expect(parseComposerCommand("/continue task-123 --agent codex address comments")).toEqual([
      "continue",
      "task-123",
      "--agent",
      "codex",
      "address",
      "comments",
    ])
    expect(parseComposerCommand("/diff task-123")).toEqual(["diff", "task-123"])
    expect(parseComposerCommand("/logs task-123")).toEqual(["logs", "task-123"])
    expect(parseComposerCommand("/attach task-123")).toEqual(["attach", "task-123"])
    expect(parseComposerCommand("/stop task-123")).toEqual(["stop", "task-123"])
    expect(parseComposerCommand("/merge task-123")).toEqual(["merge", "task-123"])
    expect(parseComposerCommand("/merge task-123 --push")).toEqual(["merge", "task-123", "--push"])
  })

  test("parses documented natural commands deterministically", () => {
    expect(parseComposerCommand("ask codex to fix failing tests")).toEqual([
      "run",
      "fix",
      "failing",
      "tests",
      "--agent",
      "codex",
    ])
    expect(parseComposerCommand("run claude review task-123")).toEqual([
      "review",
      "task-123",
      "--agent",
      "claude",
    ])
    expect(parseComposerCommand("review task-123 with claude")).toEqual([
      "review",
      "task-123",
      "--agent",
      "claude",
    ])
    expect(parseComposerCommand("continue task-123 with codex address the review")).toEqual([
      "continue",
      "task-123",
      "address",
      "the",
      "review",
      "--agent",
      "codex",
    ])
    expect(parseComposerCommand("diff task-123")).toEqual(["diff", "task-123"])
    expect(parseComposerCommand("logs task-123")).toEqual(["logs", "task-123"])
    expect(parseComposerCommand("attach task-123")).toEqual(["attach", "task-123"])
    expect(parseComposerCommand("stop task-123")).toEqual(["stop", "task-123"])
    expect(parseComposerCommand("merge task-123")).toEqual(["merge", "task-123"])
    expect(parseComposerCommand("merge task-123 and push")).toEqual(["merge", "task-123", "--push"])
  })

  test("parses conversational prompts as run tasks", () => {
    expect(parseComposerCommand("fix failing tests")).toEqual(["run", "fix", "failing", "tests"])
    expect(parseComposerCommand("codex fix failing tests")).toEqual([
      "run",
      "fix",
      "failing",
      "tests",
      "--agent",
      "codex",
    ])
    expect(parseComposerCommand("can you ask claude to inspect the diff")).toEqual([
      "run",
      "inspect",
      "the",
      "diff",
      "--agent",
      "claude",
    ])
  })

  test("returns parse source metadata for command display", () => {
    expect(parseTuiCommand("ask codex to fix tests")?.source).toBe("natural")
    expect(parseTuiCommand("/run codex fix tests")?.source).toBe("slash")
    expect(parseTuiCommand("orchestra run fix tests --agent codex")?.source).toBe("cli")
    expect(parseTuiCommand("fix tests")?.source).toBe("natural")
  })

  test("formats confirmations from parsed destructive commands", () => {
    expect(getTuiCommandConfirmation("stop task-123")?.message).toContain("stop task task-123")
    expect(getTuiCommandConfirmation("merge task-123")?.message).toContain("merge task task-123")
    expect(getTuiCommandConfirmation("merge task-123 and push")?.message).toContain(
      "merge and push task task-123",
    )
    expect(getTuiCommandConfirmation("diff task-123")).toBeUndefined()
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
    expect(result.message).toContain("ask codex")
  })
})
