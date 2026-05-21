import { describe, expect, test } from "bun:test"

import {
  OrchestraError,
  assertTaskStatusTransition,
  canTransitionTaskStatus,
  getAllowedTaskStatusTransitions,
  isActiveTaskStatus,
  isInactiveTaskStatus,
  isTaskStatus,
} from "../src/core"

describe("task status helpers", () => {
  test("recognizes known task statuses", () => {
    expect(isTaskStatus("queued")).toBe(true)
    expect(isTaskStatus("running")).toBe(true)
    expect(isTaskStatus("merged")).toBe(true)
    expect(isTaskStatus("unknown")).toBe(false)
  })

  test("allows the normal task lifecycle", () => {
    expect(canTransitionTaskStatus("queued", "starting")).toBe(true)
    expect(canTransitionTaskStatus("starting", "running")).toBe(true)
    expect(canTransitionTaskStatus("running", "completed")).toBe(true)
    expect(canTransitionTaskStatus("completed", "merged")).toBe(true)
  })

  test("allows stop, fail, and retry transitions", () => {
    expect(canTransitionTaskStatus("queued", "stopped")).toBe(true)
    expect(canTransitionTaskStatus("starting", "failed")).toBe(true)
    expect(canTransitionTaskStatus("running", "stopped")).toBe(true)
    expect(canTransitionTaskStatus("stopped", "starting")).toBe(true)
    expect(canTransitionTaskStatus("failed", "starting")).toBe(true)
  })

  test("treats same-status updates as no-ops", () => {
    expect(canTransitionTaskStatus("running", "running")).toBe(true)
    expect(() => assertTaskStatusTransition("merged", "merged")).not.toThrow()
  })

  test("rejects invalid transitions with typed errors", () => {
    expect(canTransitionTaskStatus("merged", "running")).toBe(false)
    expect(() => assertTaskStatusTransition("completed", "running")).toThrow(OrchestraError)

    try {
      assertTaskStatusTransition("completed", "running")
    } catch (error) {
      expect(error).toBeInstanceOf(OrchestraError)
      expect((error as OrchestraError).code).toBe("INVALID_STATUS_TRANSITION")
    }
  })

  test("exposes allowed next statuses", () => {
    expect(getAllowedTaskStatusTransitions("running")).toEqual(["completed", "stopped", "failed"])
    expect(getAllowedTaskStatusTransitions("merged")).toEqual([])
  })

  test("classifies active and inactive statuses", () => {
    expect(isActiveTaskStatus("queued")).toBe(true)
    expect(isActiveTaskStatus("running")).toBe(true)
    expect(isActiveTaskStatus("completed")).toBe(false)
    expect(isInactiveTaskStatus("completed")).toBe(true)
    expect(isInactiveTaskStatus("merged")).toBe(true)
  })
})
