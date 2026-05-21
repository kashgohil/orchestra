import { initializeOrchestraRepo, type OrchestraRuntimeContext } from "../core"

export function runInitCommand(context: OrchestraRuntimeContext = {}): string {
  const result = initializeOrchestraRepo(context)

  return [
    result.configCreated ? "Initialized Orchestra repo." : "Orchestra repo already initialized.",
    `Repo: ${result.repo.rootPath}`,
    `Config: ${result.configPath}`,
    `Store: ${result.repo.storePath}`,
    `Branch: ${result.repoInfo.currentBranch}`,
  ].join("\n")
}
