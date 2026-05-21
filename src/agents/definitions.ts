import { BUILT_IN_AGENT_IDS, type AgentAdapter, type AgentId } from "../core/types"
import { createAgentAdapter, type AgentAdapterDefinition } from "./adapter"

export const AGENT_DEFINITIONS = [
  {
    id: "codex",
    displayName: "Codex",
    defaultCommand: "codex",
    defaultArgs: [],
    requiresTty: true,
  },
  {
    id: "claude",
    displayName: "Claude Code",
    defaultCommand: "claude",
    defaultArgs: [],
    requiresTty: true,
  },
  {
    id: "cursor",
    displayName: "Cursor Agent",
    defaultCommand: "cursor-agent",
    defaultArgs: [],
    requiresTty: true,
  },
  {
    id: "antigravity",
    displayName: "Antigravity",
    defaultCommand: "antigravity",
    defaultArgs: [],
    requiresTty: true,
  },
  {
    id: "gemini",
    displayName: "Gemini CLI",
    defaultCommand: "gemini",
    defaultArgs: ["-p", "{prompt}"],
    requiresTty: true,
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    defaultCommand: "opencode",
    defaultArgs: ["run", "{prompt}"],
    requiresTty: true,
  },
] as const satisfies readonly AgentAdapterDefinition[]

export const BUILT_IN_AGENT_ADAPTERS = AGENT_DEFINITIONS.map(createAgentAdapter)

export function listBuiltInAgentAdapters(): readonly AgentAdapter[] {
  return BUILT_IN_AGENT_ADAPTERS
}

export function getBuiltInAgentAdapter(agentId: AgentId): AgentAdapter | undefined {
  return BUILT_IN_AGENT_ADAPTERS.find((adapter) => adapter.id === agentId)
}

export function isBuiltInAgentId(agentId: string): boolean {
  return BUILT_IN_AGENT_IDS.includes(agentId as (typeof BUILT_IN_AGENT_IDS)[number])
}
