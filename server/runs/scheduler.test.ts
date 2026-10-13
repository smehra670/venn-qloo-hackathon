import type { BusinessInput } from "@shared/types";
import { describe, expect, it } from "vitest";
import { RunScheduler } from "./scheduler.js";
import { createRun } from "./store.js";

const input: BusinessInput = { businessType: "cafe", city: "London", anchors: ["Aesop"] };

describe("RunScheduler", () => {
  it("starts up to maxConcurrent immediately and queues the rest", () => {
    const scheduler = new RunScheduler(1, 5);
    const started: number[] = [];
    scheduler.enqueue(createRun(input), () => started.push(1));
    scheduler.enqueue(createRun(input), () => started.push(2));

    expect(started).toEqual([1]);
    expect(scheduler.status()).toMatchObject({ running: 1, queued: 1, maxConcurrent: 1, maxQueue: 5 });

    scheduler.release();
    expect(started).toEqual([1, 2]);
    expect(scheduler.status()).toMatchObject({ running: 1, queued: 0 });
  });

  it("rejects enqueue once the queue is full", () => {
    const scheduler = new RunScheduler(1, 1);
    const first = scheduler.enqueue(createRun(input), () => {});
    const second = scheduler.enqueue(createRun(input), () => {});
    const third = scheduler.enqueue(createRun(input), () => {});

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(third.accepted).toBe(false);
  });
});
