import { isOrchestraError } from "../core"

export function formatCliError(error: unknown): string {
  if (isOrchestraError(error)) {
    return [
      `Error [${error.code}]: ${error.message}`,
      ...(error.hint === undefined ? [] : [`Hint: ${error.hint}`]),
    ].join("\n")
  }

  return error instanceof Error ? `Error: ${error.message}` : `Error: ${String(error)}`
}
