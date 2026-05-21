import { getAgentOverride, type OrchestraConfig } from "../config"
import type { AgentAdapter, AgentDetectionResult } from "../core/types"
import type { CommandResolver } from "./adapter"
import { listBuiltInAgentAdapters } from "./definitions"

export interface AgentDetectionOptions {
  readonly config?: OrchestraConfig
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly commandResolver?: CommandResolver
  readonly adapters?: readonly AgentAdapter[]
}

export interface AgentDetectionReport extends AgentDetectionResult {
  readonly id: string
  readonly displayName: string
  readonly requiresTty: boolean
  readonly configured: boolean
}

export async function detectAgents(
  options: AgentDetectionOptions = {},
): Promise<readonly AgentDetectionReport[]> {
  const config = options.config ?? {}
  const adapters = options.adapters ?? listBuiltInAgentAdapters()

  return Promise.all(
    adapters.map(async (adapter) => {
      const commandOverride = getAgentOverride(config, adapter.id)
      const context = {
        env: options.env ?? process.env,
        ...(commandOverride === undefined ? {} : { commandOverride }),
        ...(options.commandResolver === undefined ? {} : { commandResolver: options.commandResolver }),
      }
      const result = await adapter.detect(context)

      return {
        id: adapter.id,
        displayName: adapter.displayName,
        requiresTty: adapter.requiresTty,
        configured: commandOverride !== undefined,
        ...result,
      }
    }),
  )
}

export function formatAgentDetectionReports(reports: readonly AgentDetectionReport[]): string {
  const rows = reports.map((report) => ({
    agent: report.id,
    name: report.displayName,
    status: report.available ? "available" : "missing",
    command: report.command ?? "-",
    configured: report.configured ? "yes" : "no",
    note: report.reason ?? "",
  }))
  const widths = {
    agent: maxColumnWidth("agent", rows.map((row) => row.agent)),
    name: maxColumnWidth("name", rows.map((row) => row.name)),
    status: maxColumnWidth("status", rows.map((row) => row.status)),
    command: maxColumnWidth("command", rows.map((row) => row.command)),
    configured: maxColumnWidth("configured", rows.map((row) => row.configured)),
  }
  const header = [
    "agent".padEnd(widths.agent),
    "name".padEnd(widths.name),
    "status".padEnd(widths.status),
    "command".padEnd(widths.command),
    "configured".padEnd(widths.configured),
    "note",
  ].join("  ")
  const divider = [
    "-".repeat(widths.agent),
    "-".repeat(widths.name),
    "-".repeat(widths.status),
    "-".repeat(widths.command),
    "-".repeat(widths.configured),
    "----",
  ].join("  ")
  const body = rows.map((row) =>
    [
      row.agent.padEnd(widths.agent),
      row.name.padEnd(widths.name),
      row.status.padEnd(widths.status),
      row.command.padEnd(widths.command),
      row.configured.padEnd(widths.configured),
      row.note,
    ].join("  "),
  )

  return [header, divider, ...body].join("\n")
}

function maxColumnWidth(label: string, values: readonly string[]): number {
  return Math.max(label.length, ...values.map((value) => value.length))
}
