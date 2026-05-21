import { describe, expect, test } from "bun:test"

import { detectAgents, formatAgentDetectionReports, listBuiltInAgentAdapters } from "../src/agents"
import { runAgentsCommand } from "../src/cli/agents"

describe("agent detection", () => {
  test("reports missing agents without throwing", async () => {
    const reports = await detectAgents({
      commandResolver: () => undefined,
    })

    expect(reports).toHaveLength(6)
    expect(reports.every((report) => report.available === false)).toBe(true)
    expect(reports.map((report) => report.id)).toEqual([
      "codex",
      "claude",
      "cursor",
      "antigravity",
      "gemini",
      "opencode",
    ])
  })

  test("respects configured command overrides", async () => {
    const reports = await detectAgents({
      config: {
        agents: {
          cursor: {
            command: "cursor-custom",
          },
        },
      },
      commandResolver: (command) => (command === "cursor-custom" ? "/bin/cursor-custom" : undefined),
    })
    const cursorReport = reports.find((report) => report.id === "cursor")

    expect(cursorReport).toMatchObject({
      id: "cursor",
      available: true,
      command: "/bin/cursor-custom",
      configured: true,
    })
  })

  test("formats detection reports for CLI output", async () => {
    const reports = await detectAgents({
      commandResolver: (command) => (command === "codex" ? "/bin/codex" : undefined),
    })
    const output = formatAgentDetectionReports(reports)

    expect(output).toContain("agent")
    expect(output).toContain("codex")
    expect(output).toContain("available")
    expect(output).toContain("missing")
  })

  test("agents command returns a table", async () => {
    const output = await runAgentsCommand({
      config: {},
      commandResolver: () => undefined,
    })

    expect(output).toContain("codex")
    expect(output).toContain("opencode")
    expect(output).toContain("missing")
  })

  test("built-in adapter registry has every first-phase agent", () => {
    expect(listBuiltInAgentAdapters().map((adapter) => adapter.id)).toEqual([
      "codex",
      "claude",
      "cursor",
      "antigravity",
      "gemini",
      "opencode",
    ])
  })
})
