import { existsSync } from "node:fs"

import type {
  AgentAdapter,
  AgentCommandOverride,
  AgentDetectionContext,
  AgentDetectionResult,
  AgentLaunchCommand,
  AgentLaunchInput,
  AgentPromptEnvelopeInput,
} from "../core/types"

export type CommandResolver = (command: string) => string | undefined

export interface AgentAdapterDefinition {
  readonly id: string
  readonly displayName: string
  readonly defaultCommand: string
  readonly defaultArgs: readonly string[]
  readonly requiresTty: boolean
  readonly defaultEnv?: Readonly<Record<string, string>>
  readonly promptEnvelope?: (input: AgentPromptEnvelopeInput) => string
}

export function createAgentAdapter(definition: AgentAdapterDefinition): AgentAdapter {
  return {
    id: definition.id,
    displayName: definition.displayName,
    requiresTty: definition.requiresTty,
    async detect(context: AgentDetectionContext): Promise<AgentDetectionResult> {
      const command = context.commandOverride?.command ?? definition.defaultCommand
      const resolvedCommand = resolveCommand(command, context.commandResolver)

      if (resolvedCommand === undefined) {
        return {
          available: false,
          command,
          reason: `Command '${command}' was not found on PATH.`,
        }
      }

      return {
        available: true,
        command: resolvedCommand,
      }
    },
    buildLaunchCommand(input: AgentLaunchInput): AgentLaunchCommand {
      return buildAgentLaunchCommand(definition, input)
    },
    defaultPromptEnvelope(input: AgentPromptEnvelopeInput): string {
      return definition.promptEnvelope?.(input) ?? input.instruction
    },
  }
}

export function buildAgentLaunchCommand(
  definition: AgentAdapterDefinition,
  input: AgentLaunchInput,
): AgentLaunchCommand {
  const override = input.commandOverride
  const command = override?.command ?? definition.defaultCommand
  const args = buildArgs(override, definition.defaultArgs, input.prompt)

  return {
    command,
    args,
    cwd: input.task.worktreePath,
    env: {
      ...definition.defaultEnv,
      ...override?.env,
    },
  }
}

export function buildArgs(
  override: AgentCommandOverride | undefined,
  defaultArgs: readonly string[],
  prompt: string,
): readonly string[] {
  const argsTemplate = override?.args ?? defaultArgs
  const hasPromptPlaceholder = argsTemplate.some((arg) => arg.includes("{prompt}"))
  const renderedArgs = argsTemplate.map((arg) => arg.replaceAll("{prompt}", prompt))

  if (hasPromptPlaceholder || override?.appendPrompt === false) {
    return renderedArgs
  }

  return [...renderedArgs, prompt]
}

function resolveCommand(
  command: string,
  commandResolver: CommandResolver | undefined,
): string | undefined {
  if (command.includes("/") && existsSync(command)) {
    return command
  }

  return commandResolver?.(command) ?? Bun.which(command) ?? undefined
}
