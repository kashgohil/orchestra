import { getAgentOverride, type OrchestraConfig } from "../config"
import { OrchestraError } from "../core/errors"
import type { AgentId, AgentLaunchCommand, JsonObject, Task } from "../core/types"
import { getBuiltInAgentAdapter } from "./definitions"

export interface BuildAgentLaunchInput {
  readonly agentId: AgentId
  readonly task: Task
  readonly prompt: string
  readonly config?: OrchestraConfig
}

export function buildAgentLaunchCommandById(input: BuildAgentLaunchInput): AgentLaunchCommand {
  const adapter = getBuiltInAgentAdapter(input.agentId)

  if (adapter === undefined) {
    throw new OrchestraError("AGENT_NOT_FOUND", `Agent '${input.agentId}' is not registered.`)
  }

  const commandOverride = getAgentOverride(input.config ?? {}, adapter.id)

  return adapter.buildLaunchCommand({
    task: input.task,
    prompt: input.prompt,
    ...(commandOverride === undefined ? {} : { commandOverride }),
  })
}

export interface BuildAgentPromptEnvelopeInput {
  readonly agentId: AgentId
  readonly task: Task
  readonly instruction: string
  readonly context?: JsonObject
}

export function buildAgentPromptEnvelopeById(input: BuildAgentPromptEnvelopeInput): string {
  const adapter = getBuiltInAgentAdapter(input.agentId)

  if (adapter === undefined) {
    throw new OrchestraError("AGENT_NOT_FOUND", `Agent '${input.agentId}' is not registered.`)
  }

  return adapter.defaultPromptEnvelope({
    task: input.task,
    instruction: input.instruction,
    ...(input.context === undefined ? {} : { context: input.context }),
  })
}
