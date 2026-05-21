import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import type { AgentCommandOverride, AgentId } from "../core/types"

export const ORCHESTRA_CONFIG_FILE = "orchestra.config.json"

export interface OrchestraConfig {
  readonly defaultAgent?: AgentId
  readonly remote?: string
  readonly branchPattern?: string
  readonly agents?: Readonly<Record<string, AgentCommandOverride>>
  readonly checks?: {
    readonly test?: string
    readonly lint?: string
  }
}

export interface LoadedOrchestraConfig {
  readonly config: OrchestraConfig
  readonly path?: string
}

export function loadOrchestraConfig(startPath: string = process.cwd()): LoadedOrchestraConfig {
  const configPath = findOrchestraConfigPath(startPath)

  if (configPath === undefined) {
    return {
      config: {},
    }
  }

  return {
    config: JSON.parse(readFileSync(configPath, "utf8")) as OrchestraConfig,
    path: configPath,
  }
}

export function findOrchestraConfigPath(startPath: string = process.cwd()): string | undefined {
  let currentPath = path.resolve(startPath)

  if (!existsSync(currentPath)) {
    currentPath = path.dirname(currentPath)
  }

  while (true) {
    const candidate = path.join(currentPath, ORCHESTRA_CONFIG_FILE)

    if (existsSync(candidate)) {
      return candidate
    }

    const parentPath = path.dirname(currentPath)

    if (parentPath === currentPath) {
      return undefined
    }

    currentPath = parentPath
  }
}

export function getAgentOverride(
  config: OrchestraConfig,
  agentId: AgentId,
): AgentCommandOverride | undefined {
  return config.agents?.[agentId]
}
