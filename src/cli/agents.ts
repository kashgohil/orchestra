import { detectAgents, formatAgentDetectionReports, type AgentDetectionOptions } from "../agents"
import { loadOrchestraConfig } from "../config"

export interface AgentsCommandOptions extends AgentDetectionOptions {
  readonly cwd?: string
  readonly json?: boolean
}

export async function runAgentsCommand(options: AgentsCommandOptions = {}): Promise<string> {
  const loadedConfig = options.config === undefined ? loadOrchestraConfig(options.cwd).config : options.config
  const detectionOptions = {
    config: loadedConfig,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.commandResolver === undefined ? {} : { commandResolver: options.commandResolver }),
    ...(options.adapters === undefined ? {} : { adapters: options.adapters }),
  }
  const reports = await detectAgents(detectionOptions)

  if (options.json === true) {
    return JSON.stringify(reports, null, 2)
  }

  return formatAgentDetectionReports(reports)
}
