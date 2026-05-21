import type { AgentLaunchCommand } from "../core/types"

export function shellQuote(value: string): string {
  if (value.length === 0) {
    return "''"
  }

  return `'${value.replaceAll("'", "'\\''")}'`
}

export function shellCommand(command: AgentLaunchCommand): string {
  const envPrefix = Object.entries(command.env ?? {})
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ")
  const argv = [command.command, ...command.args].map(shellQuote).join(" ")

  return envPrefix.length === 0 ? argv : `${envPrefix} ${argv}`
}
