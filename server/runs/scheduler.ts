import { config } from "../config.js";
import type { Run } from "./store.js";

interface QueuedJob {
  run: Run;
  startFn: () => void;
}

export class RunScheduler {
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private running = 0;
  private readonly queue: QueuedJob[] = [];

  constructor(maxConcurrent = config.maxConcurrentRuns, maxQueue = config.queueMax) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
  }

  enqueue(run: Run, startFn: () => void): { accepted: true } | { accepted: false; reason: string } {
    if (this.queue.length >= this.maxQueue) {
      return { accepted: false, reason: "The search queue is full. Try again in a moment." };
    }
    this.queue.push({ run, startFn });
    this.pump();
    return { accepted: true };
  }

  /** Called by the runner once a run finishes, errors, or is cancelled. */
  release(): void {
    this.running = Math.max(0, this.running - 1);
    this.pump();
  }

  private pump(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) return;
      this.running += 1;
      job.startFn();
    }
  }

  status(): { running: number; queued: number; maxConcurrent: number; maxQueue: number } {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue,
    };
  }
}

let scheduler: RunScheduler | null = null;

export function getScheduler(): RunScheduler {
  if (!scheduler) scheduler = new RunScheduler();
  return scheduler;
}
