import { OrchestraError } from "../core"

export interface ParsedArgs {
  readonly positionals: readonly string[]
  readonly flags: ReadonlyMap<string, string | boolean>
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  const positionals: string[] = []
  const flags = new Map<string, string | boolean>()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === undefined) {
      continue
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg)
      continue
    }

    const rawFlag = arg.slice(2)
    const separatorIndex = rawFlag.indexOf("=")
    const rawName = separatorIndex === -1 ? rawFlag : rawFlag.slice(0, separatorIndex)
    const inlineValue = separatorIndex === -1 ? undefined : rawFlag.slice(separatorIndex + 1)

    if (rawName === "") {
      throw new OrchestraError("CONFIG_INVALID", "Empty CLI flag is not valid.")
    }

    if (inlineValue !== undefined) {
      flags.set(rawName, inlineValue)
      continue
    }

    const nextArg = args[index + 1]

    if (nextArg !== undefined && !nextArg.startsWith("--")) {
      flags.set(rawName, nextArg)
      index += 1
      continue
    }

    flags.set(rawName, true)
  }

  return {
    positionals,
    flags,
  }
}

export function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.has(name)
}

export function readFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name)

  if (value === undefined || value === true) {
    return undefined
  }

  return typeof value === "string" ? value : undefined
}

export function requirePositional(args: ParsedArgs, index: number, label: string): string {
  const value = args.positionals[index]

  if (value === undefined || value.trim().length === 0) {
    throw new OrchestraError("CONFIG_INVALID", `Missing required ${label}.`)
  }

  return value
}
