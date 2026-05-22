import { getTaskArtifactManifest } from "../core/artifact-service"
import type { AgentPromptEnvelopeInput, JsonObject, Task } from "../core/types"

export function formatAgentPromptEnvelope(input: AgentPromptEnvelopeInput): string {
  const task = input.task
  const artifacts = getTaskArtifactManifest(task)
  const lines = [
    "# Orchestra Task",
    "",
    "You are running as a local coding agent under Orchestra.",
    "",
    "## User Instruction",
    "",
    input.instruction,
    "",
    "## Task Context",
    "",
    `- Task ID: ${task.id}`,
    `- Task kind: ${task.kind}`,
    `- Agent: ${task.agentId}`,
    `- Source repo: ${task.sourceRepoPath}`,
    `- Source branch: ${task.sourceBranch}`,
    `- Base commit: ${task.baseCommit}`,
    `- Task branch: ${task.taskBranch}`,
    `- Worktree: ${task.worktreePath}`,
    `- Artifact directory: ${task.artifactPath}`,
  ]

  if (task.parentTaskId !== undefined) {
    lines.push(`- Parent task: ${task.parentTaskId}`)
  }

  lines.push(
    "",
    "## Artifact Contract",
    "",
    `- Task brief: ${artifacts.files.task}`,
    `- Plan notes: ${artifacts.files.plan}`,
    `- Result summary: ${artifacts.files.result}`,
    `- Review notes: ${artifacts.files.review}`,
    `- Event log: ${artifacts.files["event-log"]}`,
    `- stdout log: ${artifacts.files.stdout}`,
    `- stderr log: ${artifacts.files.stderr}`,
    `- Diff patch: ${artifacts.files.diff}`,
    "",
    ...artifactInstructions(task),
  )

  const contextLines = formatContextLines(input.context)

  if (contextLines.length > 0) {
    lines.push("", "## Additional Context", "", ...contextLines)
  }

  lines.push(
    "",
    "## Coordination Rules",
    "",
    "- Work only in the task worktree.",
    "- Do not coordinate directly with other agents.",
    "- Communicate through the artifact files, logs, and git diff.",
    "- Preserve unrelated user changes.",
  )

  return `${lines.join("\n")}\n`
}

export function buildAgentPromptEnvelope(input: AgentPromptEnvelopeInput): string {
  return formatAgentPromptEnvelope(input)
}

function artifactInstructions(task: Task): readonly string[] {
  if (task.kind === "review") {
    return [
      "- Write review findings and recommendations to `REVIEW.md`.",
      "- Use the supplied original prompt, current diff, recent logs, and test/lint output when available.",
      "- Do not implement changes during review unless explicitly instructed.",
    ]
  }

  if (task.kind === "continue") {
    return [
      "- Update `RESULT.md` with what changed during this continuation.",
      "- Use the supplied original prompt, current diff, and continuation instruction as the source of truth.",
      "- If review notes exist, address them directly and preserve useful context.",
    ]
  }

  return [
    "- Write the final implementation summary to `RESULT.md`.",
    "- Use `PLAN.md` for durable planning notes when useful.",
  ]
}

function formatContextLines(context: JsonObject | undefined): readonly string[] {
  if (context === undefined || Object.keys(context).length === 0) {
    return []
  }

  return ["```json", JSON.stringify(context, null, 2), "```"]
}
