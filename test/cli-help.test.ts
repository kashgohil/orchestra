import { describe, expect, test } from "bun:test"

import { COMMANDS, formatHelp, formatUnknownCommand } from "../src/cli/help"
import { runCli } from "../src/cli/main"

describe("CLI scaffold", () => {
  test("help lists planned commands", () => {
    const help = formatHelp()

    expect(help).toContain("Orchestra")
    expect(help).toContain("orchestra [command] [options]")
    expect(help).toContain("run <prompt>")
    expect(help).toContain("merge <task-id> --push")
    expect(COMMANDS.length).toBeGreaterThan(0)
  })

  test("unknown command output is actionable", () => {
    expect(formatUnknownCommand("nope")).toContain("orchestra --help")
  })

  test("runCli returns non-zero for unknown commands", async () => {
    expect(await runCli(["nope"])).toBe(1)
  })

  test("bare command and tui alias launch the TUI", async () => {
    const launched: string[] = []

    expect(
      await runCli([], {
        cwd: "/tmp/repo",
        tuiLauncher: (options) => {
          launched.push(options.cwd ?? "")
        },
      }),
    ).toBe(0)
    expect(
      await runCli(["tui"], {
        cwd: "/tmp/repo",
        tuiLauncher: (options) => {
          launched.push(options.cwd ?? "")
        },
      }),
    ).toBe(0)
    expect(launched).toEqual(["/tmp/repo", "/tmp/repo"])
  })
})
