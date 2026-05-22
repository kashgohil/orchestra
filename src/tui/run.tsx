import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

import { OrchestraTuiApp } from "./app"
import type { TuiRuntimeContext } from "./types"

export interface RunTuiOptions extends TuiRuntimeContext {
  readonly refreshMs?: number
}

export async function runTui(options: RunTuiOptions = {}): Promise<void> {
  let resolveDone: () => void = () => undefined
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    consoleMode: "disabled",
    externalOutputMode: "passthrough",
    targetFps: 60,
    maxFps: 120,
    gatherStats: false,
    autoFocus: false,
    openConsoleOnError: false,
    useKittyKeyboard: {},
    useMouse: false,
    enableMouseMovement: false,
    onDestroy: resolveDone,
  })

  createRoot(renderer).render(
    <OrchestraTuiApp
      context={{
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        ...(options.homeDir === undefined ? {} : { homeDir: options.homeDir }),
        ...(options.now === undefined ? {} : { now: options.now }),
      }}
      {...(options.refreshMs === undefined ? {} : { refreshMs: options.refreshMs })}
    />,
  )

  await done
}
