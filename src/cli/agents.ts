import { detectAgents, formatAgentDetectionReports, type AgentDetectionOptions } from "../agents"
import { loadOrchestraConfig } from "../config"

export interface AgentsCommandOptions extends AgentDetectionOptions {
  readonly cwd?: string
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

  return formatAgentDetectionReports(reports)
}
