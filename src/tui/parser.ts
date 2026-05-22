import { BUILT_IN_AGENT_IDS } from "../core"

export interface ParsedTuiCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly normalized: readonly string[]
  readonly source: "cli" | "natural" | "slash"
}

export interface TuiCommandConfirmation {
  readonly command: string
  readonly message: string
}

const AGENT_IDS = new Set<string>(BUILT_IN_AGENT_IDS)
const SIMPLE_TASK_COMMANDS = new Set(["attach", "diff", "logs", "stop"])
const KNOWN_TUI_COMMANDS = new Set([
  "init",
  "agents",
  "status",
  "run",
  "logs",
  "diff",
  "attach",
  "stop",
  "cleanup",
  "review",
  "continue",
  "merge",
])

export const TUI_COMMAND_EXAMPLES = [
  "ask codex to fix failing tests",
  "/run codex fix failing tests",
  "review task-123 with claude",
  "continue task-123 with codex address the review",
  "merge task-123 and push",
] as const

export function parseComposerCommand(input: string): readonly string[] {
  const parsed = parseTuiCommand(input)

  return parsed?.normalized ?? []
}

export function parseTuiCommand(input: string): ParsedTuiCommand | undefined {
  const trimmed = input.trim()

  if (trimmed.length === 0) {
    return undefined
  }

  const withoutPrefix = trimOrchestraPrefix(trimmed)
  const prefixed = withoutPrefix !== trimmed
  const slash = withoutPrefix.startsWith("/")
  const raw = slash ? withoutPrefix.slice(1).trimStart() : withoutPrefix
  const tokens = splitCommandLine(raw)

  if (tokens.length === 0) {
    return undefined
  }

  if (slash || prefixed) {
    return parseCliLikeCommand(tokens, slash ? "slash" : "cli")
  }

  const conversationalTokens = trimConversationalPrefix(tokens)

  return (
    parseNaturalCommand(tokens) ??
    (conversationalTokens.length === tokens.length ? undefined : parseNaturalCommand(conversationalTokens)) ??
    parseKnownCliLikeCommand(tokens) ??
    parseConversationalRunCommand(conversationalTokens)
  )
}

export function getTuiCommandConfirmation(input: string): TuiCommandConfirmation | undefined {
  const parsed = parseTuiCommand(input)

  if (parsed === undefined) {
    return undefined
  }

  if (parsed.command === "stop") {
    const taskId = firstPositional(parsed.args) ?? "<task-id>"

    return {
      command: parsed.normalized.join(" "),
      message: `Confirm parsed action: stop task ${taskId}. Press y or enter to continue.`,
    }
  }

  if (parsed.command === "merge") {
    const taskId = firstPositional(parsed.args) ?? "<task-id>"
    const action = hasLongFlag(parsed.args, "push") ? "merge and push" : "merge"

    return {
      command: parsed.normalized.join(" "),
      message: `Confirm parsed action: ${action} task ${taskId}. Press y or enter to continue.`,
    }
  }

  return undefined
}

function parseCliLikeCommand(
  tokens: readonly string[],
  source: ParsedTuiCommand["source"],
): ParsedTuiCommand {
  const [rawCommand = "", ...args] = tokens
  const command = rawCommand.toLowerCase()
  const normalizedArgs =
    command === "run" ? normalizeRunArgs(args) : command === "merge" ? normalizeMergeArgs(args) : args

  return {
    command,
    args: normalizedArgs,
    normalized: [command, ...normalizedArgs],
    source,
  }
}

function parseKnownCliLikeCommand(tokens: readonly string[]): ParsedTuiCommand | undefined {
  const command = tokens[0]?.toLowerCase()

  return command !== undefined && KNOWN_TUI_COMMANDS.has(command)
    ? parseCliLikeCommand(tokens, "cli")
    : undefined
}

function parseConversationalRunCommand(tokens: readonly string[]): ParsedTuiCommand | undefined {
  if (tokens.length === 0) {
    return undefined
  }

  const [first = "", second = "", third = ""] = tokens
  const directAgentId = normalizeAgentId(first)

  if (directAgentId !== undefined && tokens.length > 1) {
    return buildParsed("run", [...tokens.slice(1), "--agent", directAgentId], "natural")
  }

  if (first.toLowerCase() === "ask") {
    const askedAgentId = normalizeAgentId(second)

    if (askedAgentId !== undefined) {
      const prompt = third.toLowerCase() === "to" ? tokens.slice(3) : tokens.slice(2)

      if (prompt.length > 0) {
        return buildParsed("run", [...prompt, "--agent", askedAgentId], "natural")
      }
    }
  }

  return buildParsed("run", tokens, "natural")
}

function parseNaturalCommand(tokens: readonly string[]): ParsedTuiCommand | undefined {
  const [first = ""] = tokens
  const command = first.toLowerCase()

  if (command === "ask") {
    return parseAskCommand(tokens)
  }

  if (command === "run") {
    return parseRunNaturalCommand(tokens)
  }

  if (command === "review") {
    return parseReviewNaturalCommand(tokens)
  }

  if (command === "continue") {
    return parseContinueNaturalCommand(tokens)
  }

  if (SIMPLE_TASK_COMMANDS.has(command) && tokens[1] !== undefined && tokens.length === 2) {
    return buildParsed(command, [tokens[1]], "natural")
  }

  if (command === "merge") {
    return parseMergeNaturalCommand(tokens)
  }

  return undefined
}

function parseAskCommand(tokens: readonly string[]): ParsedTuiCommand | undefined {
  const agentId = normalizeAgentId(tokens[1])

  if (agentId === undefined || tokens[2]?.toLowerCase() !== "to" || tokens.length < 4) {
    return undefined
  }

  return buildParsed("run", [...tokens.slice(3), "--agent", agentId], "natural")
}

function parseRunNaturalCommand(tokens: readonly string[]): ParsedTuiCommand | undefined {
  const agentId = normalizeAgentId(tokens[1])

  if (agentId === undefined || tokens[2]?.toLowerCase() !== "review" || tokens[3] === undefined) {
    return undefined
  }

  return buildParsed("review", [tokens[3], "--agent", agentId], "natural")
}

function parseReviewNaturalCommand(tokens: readonly string[]): ParsedTuiCommand | undefined {
  const taskId = tokens[1]
  const agentId = normalizeAgentId(tokens[3])

  if (taskId === undefined || tokens[2]?.toLowerCase() !== "with" || agentId === undefined || tokens.length !== 4) {
    return undefined
  }

  return buildParsed("review", [taskId, "--agent", agentId], "natural")
}

function parseContinueNaturalCommand(tokens: readonly string[]): ParsedTuiCommand | undefined {
  const taskId = tokens[1]
  const agentId = normalizeAgentId(tokens[3])

  if (taskId === undefined || tokens[2]?.toLowerCase() !== "with" || agentId === undefined || tokens.length < 5) {
    return undefined
  }

  return buildParsed("continue", [taskId, ...tokens.slice(4), "--agent", agentId], "natural")
}

function parseMergeNaturalCommand(tokens: readonly string[]): ParsedTuiCommand | undefined {
  const taskId = tokens[1]

  if (taskId === undefined) {
    return undefined
  }

  if (tokens.length === 2) {
    return buildParsed("merge", [taskId], "natural")
  }

  if (tokens.length === 4 && tokens[2]?.toLowerCase() === "and" && tokens[3]?.toLowerCase() === "push") {
    return buildParsed("merge", [taskId, "--push"], "natural")
  }

  return undefined
}

function normalizeRunArgs(args: readonly string[]): readonly string[] {
  if (hasLongFlag(args, "agent")) {
    return args
  }

  const agentId = normalizeAgentId(args[0])

  if (agentId === undefined) {
    return args
  }

  return [...args.slice(1), "--agent", agentId]
}

function normalizeMergeArgs(args: readonly string[]): readonly string[] {
  if (args.length === 3 && args[1]?.toLowerCase() === "and" && args[2]?.toLowerCase() === "push") {
    return [args[0] ?? "", "--push"].filter((arg) => arg.length > 0)
  }

  return args
}

function buildParsed(
  command: string,
  args: readonly string[],
  source: ParsedTuiCommand["source"],
): ParsedTuiCommand {
  return {
    command,
    args,
    normalized: [command, ...args],
    source,
  }
}

function normalizeAgentId(value: string | undefined): string | undefined {
  const normalized = value?.toLowerCase()

  return normalized !== undefined && AGENT_IDS.has(normalized) ? normalized : undefined
}

function trimConversationalPrefix(tokens: readonly string[]): readonly string[] {
  let index = 0

  while (tokens[index]?.toLowerCase() === "please") {
    index += 1
  }

  const first = tokens[index]?.toLowerCase()
  const second = tokens[index + 1]?.toLowerCase()

  if ((first === "can" || first === "could" || first === "would" || first === "will") && second === "you") {
    index += 2
  }

  while (tokens[index]?.toLowerCase() === "please") {
    index += 1
  }

  return tokens.slice(index)
}

function firstPositional(args: readonly string[]): string | undefined {
  return args.find((arg) => !arg.startsWith("--"))
}

function hasLongFlag(args: readonly string[], flag: string): boolean {
  return args.some((arg) => arg === `--${flag}` || arg.startsWith(`--${flag}=`))
}

function trimOrchestraPrefix(input: string): string {
  return input.startsWith("orchestra ") ? input.slice("orchestra ".length).trimStart() : input
}

function splitCommandLine(input: string): readonly string[] {
  const args: string[] = []
  let current = ""
  let quote: "'" | '"' | undefined
  let escaped = false

  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current)
        current = ""
      }
      continue
    }

    current += char
  }

  if (escaped) {
    current += "\\"
  }

  if (current.length > 0) {
    args.push(current)
  }

  return args
}
