import { useCallback, useEffect, useMemo, useState } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import type { KeyEvent } from "@opentui/core"

import type { Task, TaskEvent } from "../core"
import type { WorktreeChangedFile } from "../git"
import {
  commandForShortcut,
  executeTuiCommand,
  type TuiShortcutAction,
} from "./command"
import { getTuiCommandConfirmation } from "./parser"
import { loadTuiState, selectAdjacentTaskId } from "./state"
import type { TuiCommandResult, TuiRuntimeContext, TuiState, TuiViewMode } from "./types"

export interface OrchestraTuiAppProps {
  readonly context?: TuiRuntimeContext
  readonly initialState?: TuiState
  readonly refreshMs?: number
}

const COLORS = {
  bg: "#0f1214",
  panel: "#151a1d",
  panelAlt: "#111619",
  border: "#394246",
  text: "#d8dee2",
  muted: "#8b969c",
  accent: "#8bd5ca",
  warn: "#f2c97d",
  error: "#ff8f8f",
  success: "#9ad77f",
}

export function OrchestraTuiApp(props: OrchestraTuiAppProps) {
  const context = props.context ?? {}
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const [selectedTaskId, setSelectedTaskId] = useState(props.initialState?.selectedTaskId)
  const [state, setState] = useState<TuiState>(
    props.initialState ??
      loadTuiState({
        ...context,
        ...(selectedTaskId === undefined ? {} : { selectedTaskId }),
      }),
  )
  const [commandText, setCommandText] = useState("")
  const [viewMode, setViewMode] = useState<TuiViewMode>("overview")
  const [helpVisible, setHelpVisible] = useState(false)
  const [lastResult, setLastResult] = useState<TuiCommandResult>({
    ok: true,
    message: "Ready.",
  })
  const [pendingCommand, setPendingCommand] = useState<string | undefined>()
  const compact = dimensions.width < 100 || dimensions.height < 30

  const refresh = useCallback(
    (nextSelectedTaskId = selectedTaskId) => {
      const nextState = loadTuiState({
        ...context,
        ...(nextSelectedTaskId === undefined ? {} : { selectedTaskId: nextSelectedTaskId }),
      })

      setSelectedTaskId(nextState.selectedTaskId)
      setState(nextState)
    },
    [context, selectedTaskId],
  )

  useEffect(() => {
    const interval = setInterval(() => refresh(), props.refreshMs ?? 2500)

    return () => clearInterval(interval)
  }, [props.refreshMs, refresh])

  const runCommandText = useCallback(
    async (input: string, confirmed = false) => {
      const command = input.trim()

      if (command.length === 0) {
        return
      }

      const confirmation = getTuiCommandConfirmation(command)

      if (!confirmed && confirmation !== undefined) {
        setPendingCommand(command)
        setLastResult({
          ok: false,
          message: confirmation.message,
        })
        return
      }

      setPendingCommand(undefined)
      setLastResult({
        ok: true,
        message: `Running: ${command}`,
      })

      const result = await executeTuiCommand(command, context)

      setLastResult(result)
      setCommandText("")

      if (result.viewMode !== undefined) {
        setViewMode(result.viewMode)
      }

      if (result.refresh === true) {
        refresh()
      }
    },
    [context, refresh],
  )

  const runShortcut = useCallback(
    (action: TuiShortcutAction) => {
      const command = commandForShortcut(action, state.selectedTaskId)

      if (command.length === 0) {
        setLastResult({
          ok: false,
          message: "No selected task.",
        })
        return
      }

      const confirmation = getTuiCommandConfirmation(command)

      if (confirmation !== undefined) {
        setPendingCommand(command)
        setLastResult({
          ok: false,
          message: confirmation.message,
        })
        return
      }

      void runCommandText(command, true)
    },
    [runCommandText, state.selectedTaskId],
  )

  useKeyboard((key) => {
    if (pendingCommand !== undefined) {
      handleConfirmationKey({
        key,
        pendingCommand,
        runCommandText,
        setPendingCommand,
        setLastResult,
      })
      return
    }

    if (key.ctrl && key.name === "c") {
      renderer.destroy()
      return
    }

    if (key.name === "escape") {
      if (commandText.length > 0) {
        setCommandText("")
      } else if (helpVisible) {
        setHelpVisible(false)
      }
      return
    }

    if (key.name === "return") {
      if (commandText.trim().length > 0) {
        void runCommandText(commandText)
      } else {
        runShortcut("open")
      }
      return
    }

    if (key.name === "backspace") {
      setCommandText((value) => value.slice(0, -1))
      return
    }

    if (key.name === "up" || key.name === "down") {
      const nextSelectedTaskId = selectAdjacentTaskId(
        state.tasks,
        state.selectedTaskId,
        key.name === "up" ? "previous" : "next",
      )

      if (nextSelectedTaskId !== undefined) {
        setSelectedTaskId(nextSelectedTaskId)
        refresh(nextSelectedTaskId)
      }
      return
    }

    if (commandText.length === 0) {
      if (key.name === "q") {
        renderer.destroy()
        return
      }

      if (key.name === "?") {
        setHelpVisible((visible) => !visible)
        return
      }

      const shortcut = shortcutForKey(key.name)

      if (shortcut !== undefined) {
        runShortcut(shortcut)
        return
      }
    }

    const printable = printableKey(key)

    if (printable !== undefined) {
      setCommandText((value) => `${value}${printable}`)
    }
  })

  const latestMessage = useMemo(
    () => truncateMiddle(lastResult.message.replace(/\s+/g, " "), dimensions.width - 22),
    [dimensions.width, lastResult.message],
  )

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={COLORS.bg}>
      <Header state={state} />
      <box flexGrow={1} flexDirection={compact ? "column" : "row"}>
        <TaskList
          tasks={state.tasks}
          compact={compact}
          {...(state.selectedTaskId === undefined ? {} : { selectedTaskId: state.selectedTaskId })}
        />
        <TaskDetailPanel state={state} viewMode={viewMode} compact={compact} />
      </box>
      {helpVisible ? <HelpOverlay /> : null}
      <CommandComposer
        commandText={commandText}
        latestMessage={latestMessage}
        ok={lastResult.ok}
        {...(pendingCommand === undefined ? {} : { pendingCommand })}
      />
      <StatusBar
        state={state}
        viewMode={viewMode}
        dimensions={`${dimensions.width}x${dimensions.height}`}
      />
    </box>
  )
}

function Header(props: { readonly state: TuiState }) {
  const repo = props.state.repo
  const subtitle =
    repo === undefined
      ? "No repo loaded"
      : `${repo.rootPath}  ${repo.currentBranch}  ${repo.headCommit.slice(0, 8)}`

  return (
    <box height={3} paddingX={1} flexDirection="column" backgroundColor={COLORS.panel}>
      <text fg={COLORS.accent}>Orchestra</text>
      <text fg={COLORS.muted}>{truncateMiddle(subtitle, 140)}</text>
    </box>
  )
}

function TaskList(props: {
  readonly tasks: readonly Task[]
  readonly selectedTaskId?: string
  readonly compact: boolean
}) {
  const visibleTasks = props.compact ? props.tasks.slice(0, 6) : props.tasks.slice(0, 20)

  return (
    <box
      width={props.compact ? "100%" : 36}
      height={props.compact ? 9 : "100%"}
      borderStyle="single"
      borderColor={COLORS.border}
      padding={1}
      flexDirection="column"
      backgroundColor={COLORS.panelAlt}
    >
      <text fg={COLORS.muted}>Tasks</text>
      {visibleTasks.length === 0 ? (
        <text fg={COLORS.muted}>No tasks yet. Type ask codex to fix tests</text>
      ) : (
        visibleTasks.map((task) => (
          <text key={task.id} fg={task.id === props.selectedTaskId ? COLORS.accent : COLORS.text}>
            {formatTaskRow(task, task.id === props.selectedTaskId)}
          </text>
        ))
      )}
    </box>
  )
}

function TaskDetailPanel(props: {
  readonly state: TuiState
  readonly viewMode: TuiViewMode
  readonly compact: boolean
}) {
  const detail = props.state.detail

  return (
    <box
      flexGrow={1}
      height="100%"
      borderStyle="single"
      borderColor={COLORS.border}
      padding={1}
      flexDirection="column"
      backgroundColor={COLORS.panel}
    >
      {props.state.error !== undefined ? (
        <text fg={COLORS.error}>{props.state.error}</text>
      ) : detail === undefined ? (
        <EmptyDashboard />
      ) : (
        <TaskDetail
          detail={detail}
          tasks={props.state.tasks}
          viewMode={props.viewMode}
          compact={props.compact}
        />
      )}
    </box>
  )
}

function EmptyDashboard() {
  return (
    <box flexDirection="column" gap={1}>
      <text fg={COLORS.accent}>No tasks in this repo.</text>
      <text fg={COLORS.text}>ask codex to fix failing tests</text>
      <text fg={COLORS.text}>/run codex fix failing tests</text>
      <text fg={COLORS.text}>/agents</text>
    </box>
  )
}

function TaskDetail(props: {
  readonly detail: NonNullable<TuiState["detail"]>
  readonly tasks: readonly Task[]
  readonly viewMode: TuiViewMode
  readonly compact: boolean
}) {
  const task = props.detail.task

  return (
    <box flexDirection="column" gap={1}>
      <text fg={COLORS.accent}>{task.id}</text>
      <text fg={COLORS.text}>{`${task.status}  ${task.kind}  ${task.agentId}`}</text>
      <text fg={COLORS.muted}>{truncateMiddle(task.prompt, 120)}</text>
      <text fg={COLORS.muted}>{truncateMiddle(`branch ${task.taskBranch}`, 120)}</text>
      <text fg={COLORS.muted}>{truncateMiddle(`worktree ${task.worktreePath}`, 120)}</text>
      <TaskRelationships task={task} tasks={props.tasks} />
      {props.detail.error === undefined ? null : <text fg={COLORS.error}>{props.detail.error}</text>}
      <ChangedFiles files={props.detail.changedFiles} />
      {props.viewMode === "logs" ? (
        <LogTail detail={props.detail} />
      ) : props.viewMode === "diff" ? (
        <DiffSummary files={props.detail.changedFiles} />
      ) : (
        <Events events={props.detail.events} />
      )}
    </box>
  )
}

function TaskRelationships(props: { readonly task: Task; readonly tasks: readonly Task[] }) {
  const children = props.tasks.filter((task) => task.parentTaskId === props.task.id)

  if (props.task.parentTaskId === undefined && children.length === 0) {
    return null
  }

  return (
    <box flexDirection="column">
      <text fg={COLORS.muted}>Relationships</text>
      {props.task.parentTaskId === undefined ? null : (
        <text fg={COLORS.text}>{`parent ${props.task.parentTaskId}`}</text>
      )}
      {children.length === 0 ? null : (
        <text fg={COLORS.text}>
          {truncateMiddle(
            `children ${children.map((child) => `${child.id}:${child.kind}:${child.status}`).join(", ")}`,
            120,
          )}
        </text>
      )}
    </box>
  )
}

function ChangedFiles(props: { readonly files: readonly WorktreeChangedFile[] }) {
  return (
    <box flexDirection="column">
      <text fg={COLORS.muted}>Changed files</text>
      {props.files.length === 0 ? (
        <text fg={COLORS.muted}>No worktree changes.</text>
      ) : (
        props.files.slice(0, 8).map((file) => (
          <text key={`${file.rawStatus}-${file.path}`} fg={COLORS.text}>
            {`${file.rawStatus.padEnd(2)} ${truncateMiddle(file.path, 96)}`}
          </text>
        ))
      )}
    </box>
  )
}

function Events(props: { readonly events: readonly TaskEvent[] }) {
  return (
    <box flexDirection="column">
      <text fg={COLORS.muted}>Latest events</text>
      {props.events.length === 0 ? (
        <text fg={COLORS.muted}>No events recorded.</text>
      ) : (
        props.events.map((event) => (
          <text key={event.id} fg={event.level === "error" ? COLORS.error : COLORS.text}>
            {truncateMiddle(`${event.createdAt} ${event.type} ${event.message}`, 128)}
          </text>
        ))
      )}
    </box>
  )
}

function LogTail(props: { readonly detail: TuiTaskDetailForRender }) {
  const output = props.detail.stderrTail || props.detail.stdoutTail

  return (
    <box flexDirection="column">
      <text fg={COLORS.muted}>Log tail</text>
      {output.length === 0 ? (
        <text fg={COLORS.muted}>No logs yet.</text>
      ) : (
        output.split("\n").slice(-12).map((line, index) => (
          <text key={`${index}-${line}`} fg={COLORS.text}>
            {truncateMiddle(line, 132)}
          </text>
        ))
      )}
    </box>
  )
}

function DiffSummary(props: { readonly files: readonly WorktreeChangedFile[] }) {
  return (
    <box flexDirection="column">
      <text fg={COLORS.muted}>Diff</text>
      {props.files.length === 0 ? (
        <text fg={COLORS.muted}>No diff to show.</text>
      ) : (
        props.files.map((file) => (
          <text key={file.path} fg={COLORS.text}>
            {`${file.status.padEnd(10)} ${truncateMiddle(file.path, 110)}`}
          </text>
        ))
      )}
    </box>
  )
}

function HelpOverlay() {
  return (
    <box
      position="absolute"
      top={4}
      left={4}
      width={74}
      height={15}
      borderStyle="double"
      borderColor={COLORS.accent}
      padding={1}
      flexDirection="column"
      backgroundColor="#10171a"
    >
      <text fg={COLORS.accent}>Keys</text>
      <text fg={COLORS.text}>enter open selected  up/down select  a attach  d diff  l logs</text>
      <text fg={COLORS.text}>s stop  m merge  ? help  q quit  esc clear/close</text>
      <text fg={COLORS.accent}>Commands</text>
      <text fg={COLORS.text}>ask codex to fix tests   /run codex fix tests</text>
      <text fg={COLORS.text}>review task-id with claude   /review task-id --agent claude</text>
      <text fg={COLORS.text}>continue task-id with codex address review</text>
      <text fg={COLORS.text}>diff task-id  logs task-id  merge task-id and push</text>
    </box>
  )
}

function CommandComposer(props: {
  readonly commandText: string
  readonly pendingCommand?: string
  readonly latestMessage: string
  readonly ok: boolean
}) {
  const command =
    props.pendingCommand ?? (props.commandText.length === 0 ? "ask codex to fix failing tests" : props.commandText)
  const prompt = props.pendingCommand === undefined ? "> " : "confirm y/n > "

  return (
    <box height={4} borderStyle="single" borderColor={COLORS.border} paddingX={1} flexDirection="column">
      <text fg={props.pendingCommand === undefined ? COLORS.accent : COLORS.warn}>
        {`${prompt}${command}`}
      </text>
      <text fg={props.ok ? COLORS.muted : COLORS.error}>{props.latestMessage}</text>
    </box>
  )
}

function StatusBar(props: {
  readonly state: TuiState
  readonly viewMode: TuiViewMode
  readonly dimensions: string
}) {
  const taskCount = props.state.tasks.length
  const activeCount = props.state.tasks.filter((task) => task.status === "running" || task.status === "starting").length

  return (
    <box height={1} paddingX={1} backgroundColor="#0a0d0f" flexDirection="row" justifyContent="space-between">
      <text fg={COLORS.muted}>{`${taskCount} tasks  ${activeCount} active  ${props.viewMode}`}</text>
      <text fg={COLORS.muted}>{`${props.dimensions}  ? help`}</text>
    </box>
  )
}

type TuiTaskDetailForRender = NonNullable<TuiState["detail"]>

function handleConfirmationKey(input: {
  readonly key: KeyEvent
  readonly pendingCommand: string
  readonly runCommandText: (command: string, confirmed?: boolean) => Promise<void>
  readonly setPendingCommand: (value: string | undefined) => void
  readonly setLastResult: (result: TuiCommandResult) => void
}) {
  if (input.key.name === "y" || input.key.name === "return") {
    void input.runCommandText(input.pendingCommand, true)
    return
  }

  if (input.key.name === "n" || input.key.name === "escape") {
    input.setPendingCommand(undefined)
    input.setLastResult({
      ok: true,
      message: "Cancelled.",
    })
  }
}

function shortcutForKey(name: string): TuiShortcutAction | undefined {
  switch (name) {
    case "a":
      return "attach"
    case "d":
      return "diff"
    case "l":
      return "logs"
    case "s":
      return "stop"
    case "m":
      return "merge"
    default:
      return undefined
  }
}

function printableKey(key: KeyEvent): string | undefined {
  if (key.ctrl || key.meta || key.name === "return" || key.name === "escape") {
    return undefined
  }

  if (key.name === "space") {
    return " "
  }

  if (key.sequence.length === 1 && key.sequence >= " " && key.sequence !== "\x7f") {
    return key.sequence
  }

  return undefined
}

function formatTaskRow(task: Task, selected: boolean): string {
  const marker = selected ? ">" : " "
  const status = task.status.padEnd(8)
  const agent = String(task.agentId).padEnd(10)

  return `${marker} ${status} ${agent} ${truncateMiddle(task.prompt, 42)}`
}

function truncateMiddle(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return ""
  }

  if (value.length <= maxLength) {
    return value
  }

  if (maxLength <= 4) {
    return value.slice(0, maxLength)
  }

  const prefixLength = Math.ceil((maxLength - 3) / 2)
  const suffixLength = Math.floor((maxLength - 3) / 2)

  return `${value.slice(0, prefixLength)}...${value.slice(value.length - suffixLength)}`
}
