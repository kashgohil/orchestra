import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"

import { ORCHESTRA_CONFIG_FILE } from "../src/config"
import {
  createTaskBranchName,
  createTmuxSessionName,
  getRepoId,
  getRepoStorePath,
  getTaskArtifactDir,
  getTaskArtifactManifest,
  getTaskWorktreePath,
  type Task,
} from "../src/core"
import { runCli } from "../src/cli/main"
import { openRepoStore } from "../src/store"

const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { force: true, recursive: true })
  }
})

describe("CLI workflow", () => {
  test("init creates repo config, repo store, and global index entries", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-cli-home-")
    const output: string[] = []

    const exitCode = await runCli(["init"], {
      cwd: repoRoot,
      homeDir,
      now: fixedClock(),
      stdout: (message) => output.push(message),
    })

    expect(exitCode).toBe(0)
    expect(output.join("\n")).toContain("Initialized Orchestra repo.")
    expect(existsSync(path.join(repoRoot, ORCHESTRA_CONFIG_FILE))).toBe(true)
    expect(existsSync(getRepoStorePath(repoRoot))).toBe(true)
    expect(existsSync(path.join(homeDir, ".orchestra", "index.sqlite"))).toBe(true)
    expect(readFileSync(path.join(repoRoot, ORCHESTRA_CONFIG_FILE), "utf8")).toContain(
      '"defaultAgent": "codex"',
    )
  })

  test("status prints an empty state and JSON task data", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-cli-home-")
    const textOutput: string[] = []
    const jsonOutput: string[] = []

    expect(
      await runCli(["status"], {
        cwd: repoRoot,
        homeDir,
        tmuxExecutor: emptyTmuxExecutor(),
        stdout: (message) => textOutput.push(message),
      }),
    ).toBe(0)
    expect(textOutput.join("\n")).toContain("No tasks found.")

    const store = openRepoStore(repoRoot)
    const task = createTestTask(repoRoot, "task-20260522-100000-status", "Fix the auth tests")
    store.createTask(task)
    store.close()

    expect(
      await runCli(["status", "--json"], {
        cwd: repoRoot,
        homeDir,
        tmuxExecutor: emptyTmuxExecutor(),
        stdout: (message) => jsonOutput.push(message),
      }),
    ).toBe(0)

    const parsed = JSON.parse(jsonOutput.join("\n")) as { tasks: readonly Task[] }
    expect(parsed.tasks).toHaveLength(1)
    expect(parsed.tasks[0]?.id).toBe(task.id)
  })

  test("agents supports JSON output", async () => {
    const output: string[] = []

    expect(
      await runCli(["agents", "--json"], {
        commandResolver: (command) => (command === "codex" ? "/bin/codex" : undefined),
        stdout: (message) => output.push(message),
      }),
    ).toBe(0)

    const reports = JSON.parse(output.join("\n")) as readonly { id: string; available: boolean }[]

    expect(reports.find((report) => report.id === "codex")?.available).toBe(true)
    expect(reports.find((report) => report.id === "opencode")?.available).toBe(false)
  })

  test("run launches a managed task and logs and diff inspect it", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-cli-home-")
    const runOutput: string[] = []
    const logsOutput: string[] = []
    const diffOutput: string[] = []
    const tmuxExecutor = recordingTmuxExecutor(0)

    expect(
      await runCli(["run", "Fix", "auth", "bug", "--agent", "codex", "--token", "launch"], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: (message) => runOutput.push(message),
      }),
    ).toBe(0)

    const taskId = "task-20260522-100000-launch"
    const store = openRepoStore(repoRoot)
    const task = store.requireTask(taskId)
    const events = store.listTaskEvents(taskId)
    store.close()

    expect(task.status).toBe("running")
    expect(task.prompt).toBe("Fix auth bug")
    expect(existsSync(task.worktreePath)).toBe(true)
    expect(runOutput.join("\n")).toContain(taskId)
    expect(tmuxExecutor.calls[0]?.slice(0, 4)).toEqual(["new-session", "-d", "-s", task.tmuxSessionName])
    expect(events.map((event) => event.type).sort()).toEqual(["task.created", "task.started"])

    expect(
      await runCli(["logs", taskId], {
        cwd: repoRoot,
        stdout: (message) => logsOutput.push(message),
      }),
    ).toBe(0)
    expect(logsOutput.join("\n")).toContain("started tmux session")

    writeFileSync(path.join(task.worktreePath, "new-file.txt"), "hello\n", "utf8")
    expect(
      await runCli(["diff", taskId], {
        cwd: repoRoot,
        stdout: (message) => diffOutput.push(message),
      }),
    ).toBe(0)
    expect(diffOutput.join("\n")).toContain("new-file.txt")
    expect(existsSync(getTaskArtifactManifest(task).files.diff)).toBe(true)
  })

  test("attach, stop, and cleanup manage a task worktree safely", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-cli-home-")
    const tmuxExecutor = recordingTmuxExecutor(0)
    const cleanupBeforeOutput: string[] = []
    const attachOutput: string[] = []
    const stopOutput: string[] = []
    const cleanupAfterOutput: string[] = []

    expect(
      await runCli(["run", "Clean", "task", "--agent", "codex", "--token", "control"], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: () => undefined,
      }),
    ).toBe(0)

    const taskId = "task-20260522-100000-control"
    const store = openRepoStore(repoRoot)
    const task = store.requireTask(taskId)
    store.close()

    expect(
      await runCli(["cleanup", "--json"], {
        cwd: repoRoot,
        stdout: (message) => cleanupBeforeOutput.push(message),
      }),
    ).toBe(0)
    const cleanupBefore = JSON.parse(cleanupBeforeOutput.join("\n")) as readonly {
      removed: boolean
      reason?: string
    }[]
    expect(cleanupBefore[0]?.removed).toBe(false)
    expect(cleanupBefore[0]?.reason).toContain("running")
    expect(existsSync(task.worktreePath)).toBe(true)

    expect(
      await runCli(["attach", taskId], {
        cwd: repoRoot,
        tmuxExecutor,
        stdout: (message) => attachOutput.push(message),
      }),
    ).toBe(0)
    expect(attachOutput.join("\n")).toContain(`tmux attach-session -t ${task.tmuxSessionName}`)
    expect(tmuxExecutor.calls.some((call) => call[0] === "attach-session")).toBe(true)

    expect(
      await runCli(["stop", taskId], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: (message) => stopOutput.push(message),
      }),
    ).toBe(0)
    expect(stopOutput.join("\n")).toContain("Stopped task session.")
    expect(tmuxExecutor.calls.some((call) => call[0] === "kill-session")).toBe(true)

    expect(
      await runCli(["cleanup"], {
        cwd: repoRoot,
        stdout: (message) => cleanupAfterOutput.push(message),
      }),
    ).toBe(0)
    expect(cleanupAfterOutput.join("\n")).toContain("removed")
    expect(existsSync(task.worktreePath)).toBe(false)
  })

  test("review and continue create linked child tasks in the parent worktree", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-cli-home-")
    const tmuxExecutor = recordingTmuxExecutor(0)
    const reviewOutput: string[] = []
    const continueOutput: string[] = []

    expect(
      await runCli(["run", "Parent", "task", "--agent", "codex", "--token", "parent"], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: () => undefined,
      }),
    ).toBe(0)

    const parentTaskId = "task-20260522-100000-parent"
    const firstStore = openRepoStore(repoRoot)
    const parentTask = firstStore.requireTask(parentTaskId)
    firstStore.close()

    writeFileSync(path.join(parentTask.worktreePath, "review-target.txt"), "needs review\n", "utf8")

    expect(
      await runCli(["review", parentTaskId, "--agent", "claude", "--token", "review"], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: (message) => reviewOutput.push(message),
      }),
    ).toBe(0)
    expect(
      await runCli(
        ["continue", parentTaskId, "address", "the", "review", "--agent", "codex", "--token", "cont"],
        {
          cwd: repoRoot,
          homeDir,
          now: fixedClock(),
          tmuxExecutor,
          stdout: (message) => continueOutput.push(message),
        },
      ),
    ).toBe(0)

    const secondStore = openRepoStore(repoRoot)
    const reviewTask = secondStore.requireTask("task-20260522-100000-review")
    const continueTask = secondStore.requireTask("task-20260522-100000-cont")
    secondStore.close()

    expect(reviewOutput.join("\n")).toContain("Started review task.")
    expect(continueOutput.join("\n")).toContain("Started continue task.")
    expect(reviewTask).toMatchObject({
      kind: "review",
      parentTaskId,
      agentId: "claude",
      worktreePath: parentTask.worktreePath,
      taskBranch: parentTask.taskBranch,
      status: "running",
    })
    expect(continueTask).toMatchObject({
      kind: "continue",
      parentTaskId,
      agentId: "codex",
      prompt: "address the review",
      worktreePath: parentTask.worktreePath,
      taskBranch: parentTask.taskBranch,
      status: "running",
    })
    expect(tmuxExecutor.calls.filter((call) => call[0] === "new-session")).toHaveLength(3)
    expect(tmuxExecutor.calls.some((call) => call.join("\n").includes("review-target.txt"))).toBe(true)
  })

  test("merge applies task changes and creates a local commit without pushing", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-cli-home-")
    const tmuxExecutor = recordingTmuxExecutor(0)
    const mergeOutput: string[] = []

    expect(
      await runCli(["run", "Merge", "task", "--agent", "codex", "--token", "merge"], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: () => undefined,
      }),
    ).toBe(0)

    const taskId = "task-20260522-100000-merge"
    const firstStore = openRepoStore(repoRoot)
    const task = firstStore.requireTask(taskId)
    firstStore.close()

    writeFileSync(path.join(task.worktreePath, "merged.txt"), "merged\n", "utf8")

    expect(
      await runCli(["stop", taskId], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: () => undefined,
      }),
    ).toBe(0)
    expect(
      await runCli(["merge", taskId], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        stdout: (message) => mergeOutput.push(message),
      }),
    ).toBe(0)

    const secondStore = openRepoStore(repoRoot)
    const mergedTask = secondStore.requireTask(taskId)
    const events = secondStore.listTaskEvents(taskId)
    secondStore.close()

    expect(mergedTask.status).toBe("merged")
    expect(mergedTask.completedAt).toBe("2026-05-22T10:00:00.000Z")
    expect(events.map((event) => event.type)).toContain("task.merged")
    expect(runGitText(["show", "HEAD:merged.txt"], repoRoot)).toBe("merged")
    expect(runGitText(["log", "-1", "--pretty=%s"], repoRoot)).toContain(taskId)
    expect(mergeOutput.join("\n")).toContain("Pushed: no")
    expect(existsSync(task.worktreePath)).toBe(true)
  })

  test("merge --push pushes only when explicitly requested", async () => {
    const repoRoot = createGitRepo()
    const bareRemote = path.join(createTempDir("orchestra-cli-remote-"), "origin.git")
    const homeDir = createTempDir("orchestra-cli-home-")
    const tmuxExecutor = recordingTmuxExecutor(0)
    const mergeOutput: string[] = []

    runGit(["init", "--bare", bareRemote], repoRoot)
    runGit(["remote", "add", "origin", bareRemote], repoRoot)
    runGit(["push", "-u", "origin", "main"], repoRoot)

    expect(
      await runCli(["run", "Push", "task", "--agent", "codex", "--token", "push"], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: () => undefined,
      }),
    ).toBe(0)

    const taskId = "task-20260522-100000-push"
    const firstStore = openRepoStore(repoRoot)
    const task = firstStore.requireTask(taskId)
    firstStore.close()

    writeFileSync(path.join(task.worktreePath, "pushed.txt"), "pushed\n", "utf8")

    expect(
      await runCli(["stop", taskId], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: () => undefined,
      }),
    ).toBe(0)
    expect(
      await runCli(["merge", taskId, "--push"], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        stdout: (message) => mergeOutput.push(message),
      }),
    ).toBe(0)

    const secondStore = openRepoStore(repoRoot)
    const events = secondStore.listTaskEvents(taskId)
    secondStore.close()

    expect(mergeOutput.join("\n")).toContain("Pushed: yes")
    expect(mergeOutput.join("\n")).toContain("Remote: origin")
    expect(mergeOutput.join("\n")).toContain("Branch: main")
    expect(runGitText(["--git-dir", bareRemote, "show", "main:pushed.txt"], repoRoot)).toBe("pushed")
    expect(events.map((event) => event.type)).toContain("task.pushed")
  })

  test("failed merge --push keeps the local merge commit intact", async () => {
    const repoRoot = createGitRepo()
    const homeDir = createTempDir("orchestra-cli-home-")
    const tmuxExecutor = recordingTmuxExecutor(0)
    const stderr: string[] = []

    expect(
      await runCli(["run", "Failed", "push", "--agent", "codex", "--token", "failpush"], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: () => undefined,
      }),
    ).toBe(0)

    const taskId = "task-20260522-100000-failpush"
    const firstStore = openRepoStore(repoRoot)
    const task = firstStore.requireTask(taskId)
    firstStore.close()

    writeFileSync(path.join(task.worktreePath, "local-only.txt"), "local\n", "utf8")

    expect(
      await runCli(["stop", taskId], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        tmuxExecutor,
        stdout: () => undefined,
      }),
    ).toBe(0)
    expect(
      await runCli(["merge", taskId, "--push"], {
        cwd: repoRoot,
        homeDir,
        now: fixedClock(),
        stdout: () => undefined,
        stderr: (message) => stderr.push(message),
      }),
    ).toBe(1)

    const secondStore = openRepoStore(repoRoot)
    const mergedTask = secondStore.requireTask(taskId)
    const eventTypes = secondStore.listTaskEvents(taskId).map((event) => event.type)
    secondStore.close()

    expect(stderr.join("\n")).toContain("PUSH_FAILED")
    expect(mergedTask.status).toBe("merged")
    expect(runGitText(["show", "HEAD:local-only.txt"], repoRoot)).toBe("local")
    expect(eventTypes).toContain("task.merged")
    expect(eventTypes).not.toContain("task.pushed")
  })
})

function fixedClock(): () => Date {
  return () => new Date("2026-05-22T10:00:00.000Z")
}

function createTestTask(repoRoot: string, taskId: string, prompt: string): Task {
  return {
    id: taskId,
    repoId: getRepoId(repoRoot),
    kind: "run",
    agentId: "codex",
    status: "queued",
    prompt,
    sourceRepoPath: repoRoot,
    sourceBranch: "main",
    baseCommit: runGitText(["rev-parse", "HEAD"], repoRoot),
    taskBranch: createTaskBranchName({ taskId, prompt }),
    worktreePath: getTaskWorktreePath(repoRoot, taskId),
    tmuxSessionName: createTmuxSessionName(taskId),
    artifactPath: getTaskArtifactDir(repoRoot, taskId),
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
  }
}

function emptyTmuxExecutor() {
  return {
    run() {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "no tmux in test",
      }
    },
  }
}

function recordingTmuxExecutor(exitCode: number) {
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

function createTempDir(prefix: string): string {
  const tempRoot = mkdtempSync(path.join(tmpdir(), prefix))
  const realTempRoot = realpathSync(tempRoot)
  tempRoots.push(realTempRoot)

  return realTempRoot
}

function createGitRepo(): string {
  const tempRoot = createTempDir("orchestra-cli-repo-")
  const repoRoot = path.join(tempRoot, "repo")

  mkdirSync(repoRoot)

  runGit(["init", "--initial-branch=main"], repoRoot)
  runGit(["config", "user.name", "Orchestra Test"], repoRoot)
  runGit(["config", "user.email", "orchestra@example.test"], repoRoot)
  writeFileSync(path.join(repoRoot, "README.md"), "# Test Repo\n", "utf8")
  runGit(["add", "README.md"], repoRoot)
  runGit(["commit", "-m", "Initial commit"], repoRoot)

  return repoRoot
}

function runGit(args: readonly string[], cwd: string): void {
  const subprocess = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  if (subprocess.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed\n${subprocess.stdout.toString()}\n${subprocess.stderr.toString()}`,
    )
  }
}

function runGitText(args: readonly string[], cwd: string): string {
  const subprocess = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  if (subprocess.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed\n${subprocess.stdout.toString()}\n${subprocess.stderr.toString()}`,
    )
  }

  return subprocess.stdout.toString().trim()
}
