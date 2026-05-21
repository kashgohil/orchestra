import path from "node:path"

import { OrchestraError } from "../core/errors"
import type { AbsolutePath, GitBranchName, GitCommitSha } from "../core/types"
import { runGitCommand, runGitText } from "./command"

export interface GitRemote {
  readonly name: string
  readonly fetchUrl?: string
  readonly pushUrl?: string
}

export interface GitRepoInfo {
  readonly rootPath: AbsolutePath
  readonly currentBranch: GitBranchName
  readonly headCommit: GitCommitSha
  readonly remotes: readonly GitRemote[]
}

export function discoverGitRepo(startPath: AbsolutePath = process.cwd()): GitRepoInfo {
  const rootPath = discoverGitRoot(startPath)

  return {
    rootPath,
    currentBranch: discoverCurrentBranch(rootPath),
    headCommit: discoverHeadCommit(rootPath),
    remotes: discoverRemotes(rootPath),
  }
}

export function discoverGitRoot(startPath: AbsolutePath = process.cwd()): AbsolutePath {
  const result = runGitCommand(["rev-parse", "--show-toplevel"], {
    cwd: startPath,
    allowFailure: true,
  })

  if (result.exitCode !== 0) {
    throw new OrchestraError("NOT_GIT_REPO", `No git repository was found from '${startPath}'.`, {
      hint: "Run this command inside a git repository.",
    })
  }

  return path.resolve(result.stdout.trim())
}

export function discoverCurrentBranch(repoRootPath: AbsolutePath): GitBranchName {
  const branch = runGitText(["branch", "--show-current"], { cwd: repoRootPath })

  if (branch.length > 0) {
    return branch
  }

  return "HEAD"
}

export function discoverHeadCommit(repoRootPath: AbsolutePath): GitCommitSha {
  return runGitText(["rev-parse", "HEAD"], { cwd: repoRootPath })
}

export function discoverRemotes(repoRootPath: AbsolutePath): readonly GitRemote[] {
  const names = runGitText(["remote"], { cwd: repoRootPath })
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name.length > 0)

  return names.map((name) => ({
    name,
    ...optionalRemoteUrls(repoRootPath, name),
  }))
}

function optionalRemoteUrls(repoRootPath: AbsolutePath, name: string): Pick<GitRemote, "fetchUrl" | "pushUrl"> {
  const fetchUrl = remoteUrl(repoRootPath, name, "fetch")
  const pushUrl = remoteUrl(repoRootPath, name, "push")

  return {
    ...(fetchUrl === undefined ? {} : { fetchUrl }),
    ...(pushUrl === undefined ? {} : { pushUrl }),
  }
}

function remoteUrl(
  repoRootPath: AbsolutePath,
  name: string,
  direction: "fetch" | "push",
): string | undefined {
  const result = runGitCommand(["remote", "get-url", direction === "push" ? "--push" : "--all", name], {
    cwd: repoRootPath,
    allowFailure: true,
  })
  const output = result.stdout.trim()

  if (result.exitCode !== 0 || output.length === 0) {
    return undefined
  }

  return output.split("\n")[0] ?? undefined
}
