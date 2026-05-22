import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import type { InputRenderable, KeyEvent } from "@opentui/core"

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
  bg: "#02060a",
  panel: "#06131b",
  panelAlt: "#030b11",
  panelHot: "#081f2b",
  border: "#00a6c8",
  borderDim: "#0b3442",
  text: "#d8fbff",
  muted: "#5d8d99",
  accent: "#00e5ff",
  accentBlue: "#2d7dff",
  warn: "#ffb11b",
  error: "#ff3d71",
  success: "#42ffb0",
}

export function OrchestraTuiApp(props: OrchestraTuiAppProps) {
  const fallbackContext = useMemo<TuiRuntimeContext>(() => ({}), [])
  const context = props.context ?? fallbackContext
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const commandInputRef = useRef<InputRenderable | null>(null)
  const commandTextRef = useRef("")
  const commandHasTextRef = useRef(false)
  const [selectedTaskId, setSelectedTaskId] = useState(props.initialState?.selectedTaskId)
  const [state, setState] = useState<TuiState>(
    props.initialState ??
      loadTuiState({
        ...context,
        ...(selectedTaskId === undefined ? {} : { selectedTaskId }),
      }),
  )
  const [commandHasText, setCommandHasText] = useState(false)
  const [viewMode, setViewMode] = useState<TuiViewMode>("overview")
  const [helpVisible, setHelpVisible] = useState(false)
  const [lastResult, setLastResult] = useState<TuiCommandResult>({
    ok: true,
    message: "Ready.",
  })
  const [pendingCommand, setPendingCommand] = useState<string | undefined>()
  const compact = dimensions.width < 100 || dimensions.height < 30
  const isComposing = commandHasText || pendingCommand !== undefined

  const syncCommandText = useCallback((value: string) => {
    commandTextRef.current = value

    const hasText = value.length > 0
    if (commandHasTextRef.current !== hasText) {
      commandHasTextRef.current = hasText
      setCommandHasText(hasText)
    }
  }, [])

  const clearCommandInput = useCallback(() => {
    commandTextRef.current = ""

    if (commandHasTextRef.current) {
      commandHasTextRef.current = false
      setCommandHasText(false)
    }

    if (commandInputRef.current !== null && commandInputRef.current.value.length > 0) {
      commandInputRef.current.value = ""
    }
  }, [])

  const bindCommandInput = useCallback(
    (input: InputRenderable | null) => {
      commandInputRef.current = input

      if (input !== null && input.value !== commandTextRef.current) {
        input.value = commandTextRef.current
      }
    },
    [],
  )

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
    if (isComposing) {
      return
    }

    const interval = setInterval(() => refresh(), props.refreshMs ?? 4000)

    return () => clearInterval(interval)
  }, [isComposing, props.refreshMs, refresh])

  const runCommandText = useCallback(
    async (input: string, confirmed = false) => {
      const command = input.trim()

      if (command.length === 0) {
        return
      }

      const confirmation = getTuiCommandConfirmation(command)

      if (!confirmed && confirmation !== undefined) {
        clearCommandInput()
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
      clearCommandInput()

      const result = await executeTuiCommand(command, context)

      setLastResult(result)
      clearCommandInput()

      if (result.viewMode !== undefined) {
        setViewMode(result.viewMode)
      }

      if (result.refresh === true) {
        refresh()
      }
    },
    [clearCommandInput, context, refresh],
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

  const submitComposerValue = useCallback(
    (value: unknown) => {
      const command = typeof value === "string" ? value : commandInputRef.current?.value ?? commandTextRef.current

      if (command.trim().length > 0) {
        void runCommandText(command)
        return
      }

      runShortcut("open")
    },
    [runCommandText, runShortcut],
  )

  const handleComposerKeyDown = useCallback(
    (key: KeyEvent) => {
      if (key.name === "escape" && (commandInputRef.current?.value ?? commandTextRef.current).length > 0) {
        clearCommandInput()
      }
    },
    [clearCommandInput],
  )

  useKeyboard((key) => {
    const currentInput = commandInputRef.current?.value ?? commandTextRef.current
    const inputHasText = currentInput.length > 0

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
      if (inputHasText) {
        clearCommandInput()
      } else if (helpVisible) {
        setHelpVisible(false)
      }
      return
    }

    if (key.name === "up" || key.name === "down") {
      if (inputHasText) {
        return
      }

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

    if (!inputHasText) {
      if (key.name === "?") {
        setHelpVisible((visible) => !visible)
      }
    }
  })

  const latestMessage = useMemo(
    () => truncateMiddle(lastResult.message.replace(/\s+/g, " "), Math.max(24, dimensions.width - 22)),
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
        inputRef={bindCommandInput}
        latestMessage={latestMessage}
        ok={lastResult.ok}
        onInput={syncCommandText}
        onKeyDown={handleComposerKeyDown}
        onSubmit={submitComposerValue}
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

const Header = memo(function Header(props: { readonly state: TuiState }) {
  const repo = props.state.repo
  const subtitle =
    repo === undefined
      ? "No repo loaded"
      : `${repo.rootPath}  ${repo.currentBranch}  ${repo.headCommit.slice(0, 8)}`

  return (
    <box height={3} paddingX={1} flexDirection="column" backgroundColor={COLORS.bg}>
      <text fg={COLORS.accent}>Orchestra // Command Grid</text>
      <text fg={COLORS.muted}>{truncateMiddle(subtitle, 140)}</text>
    </box>
  )
})

const TaskList = memo(function TaskList(props: {
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
      <text fg={COLORS.accentBlue}>Tasks</text>
      {visibleTasks.length === 0 ? (
        <text fg={COLORS.muted}>No tasks yet. Type ask codex to fix tests</text>
      ) : (
        visibleTasks.map((task) => (
          <text key={task.id} fg={task.id === props.selectedTaskId ? COLORS.warn : COLORS.text}>
            {formatTaskRow(task, task.id === props.selectedTaskId)}
          </text>
        ))
      )}
    </box>
  )
})

const TaskDetailPanel = memo(function TaskDetailPanel(props: {
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
})

const EmptyDashboard = memo(function EmptyDashboard() {
  return (
    <box flexDirection="column" gap={1}>
      <text fg={COLORS.accent}>No tasks in this repo.</text>
      <text fg={COLORS.text}>ask codex to fix failing tests</text>
      <text fg={COLORS.accentBlue}>/run codex fix failing tests</text>
      <text fg={COLORS.text}>/agents</text>
    </box>
  )
})

const TaskDetail = memo(function TaskDetail(props: {
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
})

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

const HelpOverlay = memo(function HelpOverlay() {
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
      backgroundColor={COLORS.panelHot}
    >
      <text fg={COLORS.accent}>Keys</text>
      <text fg={COLORS.text}>enter submit/open selected  up/down select  esc clear/close</text>
      <text fg={COLORS.text}>? help  ctrl-c quit</text>
      <text fg={COLORS.accent}>Commands</text>
      <text fg={COLORS.text}>ask codex to fix tests   /run codex fix tests</text>
      <text fg={COLORS.text}>review task-id with claude   /review task-id --agent claude</text>
      <text fg={COLORS.text}>continue task-id with codex address review</text>
      <text fg={COLORS.text}>diff task-id  logs task-id  merge task-id and push</text>
    </box>
  )
})

const CommandComposer = memo(function CommandComposer(props: {
  readonly inputRef: (input: InputRenderable | null) => void
  readonly pendingCommand?: string
  readonly latestMessage: string
  readonly ok: boolean
  readonly onInput: (value: string) => void
  readonly onKeyDown: (key: KeyEvent) => void
  readonly onSubmit: (value: unknown) => void
}) {
  const confirming = props.pendingCommand !== undefined

  return (
    <box
      height={4}
      borderStyle="double"
      borderColor={props.pendingCommand === undefined ? COLORS.accent : COLORS.warn}
      paddingX={1}
      flexDirection="column"
      backgroundColor={COLORS.panelAlt}
    >
      {confirming ? (
        <text fg={COLORS.warn}>{`confirm y/n > ${props.pendingCommand}`}</text>
      ) : (
        <box flexDirection="row" width="100%">
          <text fg={COLORS.accent}>{"> "}</text>
          <input
            ref={props.inputRef}
            focused
            flexGrow={1}
            maxLength={4000}
            placeholder="ask codex to fix failing tests"
            backgroundColor={COLORS.panelAlt}
            focusedBackgroundColor={COLORS.panelAlt}
            textColor={COLORS.text}
            focusedTextColor={COLORS.text}
            placeholderColor={COLORS.muted}
            cursorColor={COLORS.accent}
            onInput={props.onInput}
            onKeyDown={props.onKeyDown}
            onSubmit={props.onSubmit}
          />
        </box>
      )}
      <text fg={props.ok ? COLORS.muted : COLORS.error}>{props.latestMessage}</text>
    </box>
  )
})

const StatusBar = memo(function StatusBar(props: {
  readonly state: TuiState
  readonly viewMode: TuiViewMode
  readonly dimensions: string
}) {
  const taskCount = props.state.tasks.length
  const activeCount = props.state.tasks.filter((task) => task.status === "running" || task.status === "starting").length

  return (
    <box height={1} paddingX={1} backgroundColor="#010306" flexDirection="row" justifyContent="space-between">
      <text fg={COLORS.accentBlue}>{`${taskCount} tasks  ${activeCount} active  ${props.viewMode}`}</text>
      <text fg={COLORS.muted}>{`${props.dimensions}  grid help ?`}</text>
    </box>
  )
})

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
