import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import {
  createTaskBranchName,
  createTmuxSessionName,
  getTaskArtifactDir,
  getTaskArtifactManifest,
  getTaskWorktreePath,
  readTaskEventLog,
  readTaskOutput,
  type AgentLaunchCommand,
  type Task,
  type TaskEvent,
  type TaskId,
} from "../src/core"
import {
  buildStartSessionArgs,
  buildTaskSessionScript,
  shellCommand,
  shellQuote,
  startTaskSession,
  type TaskSessionStore,
  type TaskStatusUpdate,
  type TmuxCommandExecutor,
} from "../src/tmux"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("tmux runner", () => {
  test("builds a tmux new-session command for a task launch", () => {
    const task = createTestTask()
    const launchCommand = createLaunchCommand(task)
    const args = buildStartSessionArgs(task, launchCommand)

    expect(args.slice(0, 7)).toEqual([
      "new-session",
      "-d",
      "-s",
      task.tmuxSessionName,
      "-c",
      task.worktreePath,
      expect.stringContaining("bash -lc"),
    ])
    expect(args.at(-1)).toContain("agent")
    expect(args.at(-1)).toContain("stdout.log")
    expect(args.at(-1)).toContain("stderr.log")
  })

  test("quotes shell commands without concatenating raw prompt text", () => {
    expect(shellQuote("quote ' this")).toBe("'quote '\\'' this'")
    expect(
      shellCommand({
        command: "agent",
        args: ['Fix "quoted" && no'],
        cwd: "/tmp/work",
        env: {
          TOKEN: "a b",
        },
      }),
    ).toBe("TOKEN='a b' 'agent' 'Fix \"quoted\" && no'")
  })

  test("builds a bash script that captures stdout and stderr", () => {
    const task = createTestTask()
    const script = buildTaskSessionScript(task, createLaunchCommand(task))
    const artifacts = getTaskArtifactManifest(task)

    expect(script).toContain("set -o pipefail")
    expect(script).toContain("tee -a")
    expect(script).toContain(artifacts.files.stdout)
    expect(script).toContain(artifacts.files.stderr)
  })

  test("starts a task session, updates status, and writes start artifacts", () => {
    const task = createTestTask()
    const store = new FakeTaskSessionStore(task)
    const executor = fakeTmuxExecutor(0)
    const result = startTaskSession({
      task,
      launchCommand: createLaunchCommand(task),
      store,
      executor,
      now: fixedClock(),
    })

    expect(result.sessionName).toBe(task.tmuxSessionName)
    expect(result.task.status).toBe("running")
    expect(store.statuses).toEqual(["starting", "running"])
    expect(store.events).toHaveLength(1)
    expect(store.events[0]?.type).toBe("task.started")
    expect(readTaskEventLog(result.task)).toEqual(store.events)
    expect(readTaskOutput(result.task, "stdout")).toContain("started tmux session")
    expect(executor.calls).toHaveLength(1)
  })

  test("marks tasks failed when tmux cannot start", () => {
    const task = createTestTask()
    const store = new FakeTaskSessionStore(task)

    expect(() =>
      startTaskSession({
        task,
        launchCommand: createLaunchCommand(task),
        store,
        executor: fakeTmuxExecutor(1),
        now: fixedClock(),
      }),
    ).toThrow()

    expect(store.statuses).toEqual(["starting", "failed"])
    expect(store.events.at(-1)?.type).toBe("task.failed")
    expect(readTaskEventLog(store.task).at(-1)?.type).toBe("task.failed")
  })
})

class FakeTaskSessionStore implements TaskSessionStore {
  task: Task
  readonly statuses: string[] = []
  readonly events: TaskEvent[] = []

  constructor(task: Task) {
    this.task = task
  }

  updateTask(_taskId: TaskId, input: TaskStatusUpdate): Task {
    if (input.status !== undefined) {
      this.statuses.push(input.status)
      this.task = {
        ...this.task,
        status: input.status,
      }
    }

    const nextTask = {
      ...this.task,
      updatedAt: input.updatedAt ?? this.task.updatedAt,
    }

    this.task =
      input.failureReason === undefined
        ? nextTask
        : input.failureReason === null
          ? removeFailureReason(nextTask)
          : {
              ...nextTask,
              failureReason: input.failureReason,
            }

    return this.task
  }

  appendTaskEvent(event: TaskEvent): TaskEvent {
    this.events.push(event)

    return event
  }
}

function removeFailureReason(task: Task): Task {
  const { failureReason: _failureReason, ...taskWithoutFailureReason } = task

  return taskWithoutFailureReason
}

function fakeTmuxExecutor(exitCode: number): TmuxCommandExecutor & { readonly calls: readonly (readonly string[])[] } {
  const calls: (readonly string[])[] = []

  return {
    calls,
    run(args: readonly string[]) {
      calls.push(args)

      return {
        exitCode,
        stdout: "",
        stderr: exitCode === 0 ? "" : "tmux failed",
      }
    },
  }
}

function fixedClock(): () => Date {
  return () => new Date("2026-05-22T10:00:00.000Z")
}

function createLaunchCommand(task: Task): AgentLaunchCommand {
  return {
    command: "agent",
    args: ["run", "Fix tests"],
    cwd: task.worktreePath,
    env: {
      AGENT_ENV: "test value",
    },
  }
}

function createTestTask(): Task {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orchestra-tmux-runner-"))
  tempRoots.push(repoRoot)

  const taskId = "task-20260522-100000-tmux"
  const prompt = "Run tmux"

  return {
    id: taskId,
    repoId: "repo-1",
    kind: "run",
    agentId: "codex",
    status: "queued",
    prompt,
    sourceRepoPath: repoRoot,
    sourceBranch: "main",
    baseCommit: "0123456789abcdef",
    taskBranch: createTaskBranchName({ taskId, prompt }),
    worktreePath: getTaskWorktreePath(repoRoot, taskId),
    tmuxSessionName: createTmuxSessionName(taskId),
    artifactPath: getTaskArtifactDir(repoRoot, taskId),
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  }
}
