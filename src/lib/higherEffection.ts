import type {
  Operation,
  Task,
  Channel,
  Stream,
} from "jsr:@effection/effection";

import {
  main,
  call,
  createSignal,
  createChannel,
  resource,
  race,
  sleep,
} from "jsr:@effection/effection";

export { main, call, createChannel };
export type { Task, Operation, Stream, Channel };

// ========================
// Task Management
// ========================
/**
 * Runs a task and waits for it to complete.
 * @param task - The task to run.
 * @returns A promise that resolves when the task completes.
 */
export async function runTask<T>(task: Task<T>): Promise<T> {
  return await task;
}

/**
 * Cancels a running task and ensures all resources are released.
 * @param task - The task to cancel.
 * @returns A promise that resolves when the task is fully canceled.
 */
export async function cancelTask<T>(task: Task<T>): Promise<void> {
  await task.halt();
}

// ========================
// Resource Management
// ========================
/**
 * Ensures resources are properly acquired and released.
 * @param acquire - A function that acquires the resource.
 * @param use - A function that uses the resource.
 * @param cleanup - Optional cleanup function for the resource.
 * @returns An operation that manages the resource lifecycle.
 */
export function useResource<T, R>(
  acquire: () => Operation<T>,
  use: (resource: T) => Operation<R>,
  cleanup?: (resource: T) => Operation<void>
): Operation<R> {
  return resource(function* (provide) {
    const resource = yield* acquire();
    try {
      const result = yield* use(resource);
      yield* provide(result);
    } finally {
      if (cleanup) {
        yield* cleanup(resource);
      }
    }
  });
}

// ========================
// Error Handling
// ========================
/**
 * Retries an operation a specified number of times with an optional delay.
 * @param operation - The operation to retry.
 * @param maxRetries - The maximum number of retries (default: 3).
 * @param delay - The delay between retries in milliseconds (default: 1000).
 * @returns An operation that retries the task.
 */
export function* retry<T>(
  operation: () => Operation<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Operation<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return yield* operation();
    } catch (error: any) {
      lastError = error;
      if (delay) {
        yield* sleep(delay);
      }
    }
  }
  throw lastError || new Error("Retry failed");
}

/**
 * Provides a fallback operation if the primary operation fails.
 * @param operation - The primary operation.
 * @param fallbackOperation - The fallback operation.
 * @returns An operation that runs the fallback if the primary fails.
 */
export function* fallback<T>(
  operation: () => Operation<T>,
  fallbackOperation: () => Operation<T>
): Operation<T> {
  try {
    return yield* operation();
  } catch {
    return yield* fallbackOperation();
  }
}

// ========================
// Concurrency
// ========================
/**
 * Runs multiple tasks in parallel with a concurrency limit.
 * @param tasks - An array of tasks to run.
 * @param maxConcurrency - The maximum number of concurrent tasks.
 * @returns An operation that runs the tasks with concurrency control.
 */
export function* withConcurrency<T>(
  tasks: Task<T>[],
  maxConcurrency: number
): Operation<T[]> {
  const results: T[] = [];
  const activeTasks = new Set<Task<T>>();

  for (const task of tasks) {
    if (activeTasks.size >= maxConcurrency) {
      const result = yield* race(Array.from(activeTasks));
      if (!result) {
        throw new Error("Concurrency race failed");
      }
    }
    activeTasks.add(task);
    results.push(yield* task);
    activeTasks.delete(task);
  }

  return results;
}

// ========================
// Event Handling
// ========================
/**
 * Listens for multiple events on a target with optional filtering.
 * @param target - The event target.
 * @param eventNames - The names of the events to listen for.
 * @param handler - The operation to run when an event occurs.
 * @param filter - Optional filter function for events.
 * @returns An operation that handles the events.
 */
/**
 * Listens for multiple events on a target with optional filtering.
 * @param target - The event target.
 * @param eventNames - The names of the events to listen for.
 * @param handler - The operation to run when an event occurs.
 * @param filter - Optional filter function for events.
 * @returns An operation that handles the events.
 */
export function* useEventStream<T extends EventTarget, K extends string>(
  target: T,
  eventNames: K[],
  handler: (event: Event) => Operation<void>,
  filter?: (event: Event) => boolean
): Operation<void> {
  return yield* resource(function* (provide) {
    const signal = createSignal<Event>();
    const listeners = eventNames.map((eventName) => {
      const listener = (event: Event) => {
        try {
          if (!filter || filter(event)) {
            signal.send(event);
          }
        } catch (error) {
          console.error("Failed to send event:", error);
        }
      };
      target.addEventListener(eventName, listener);
      return listener;
    });

    try {
      yield* provide();
      const subscription = yield* signal;
      while (true) {
        const result = yield* subscription.next();
        if (result.done) break;
        yield* handler(result.value);
      }
    } finally {
      eventNames.forEach((eventName, index) => {
        target.removeEventListener(eventName, listeners[index]);
      });
    }
  });
}

// ========================
// Timers
// ========================
/**
 * Schedules a recurring task with optional delay and max iterations.
 * @param interval - The interval between executions in milliseconds.
 * @param operation - The operation to run.
 * @param options - Optional configuration for delay and max iterations.
 * @returns An operation that schedules the task.
 */
export function* useTaskScheduler(
  interval: number,
  operation: () => Operation<void>,
  options?: { delay?: number; maxIterations?: number }
): Operation<void> {
  if (options?.delay) {
    yield* sleep(options.delay);
  }

  let iterations = 0;
  while (true) {
    try {
      yield* operation();
    } catch (error) {
      console.error("Scheduled operation failed:", error);
    }
    iterations++;
    if (options?.maxIterations && iterations >= options.maxIterations) {
      break;
    }
    yield* sleep(interval);
  }
}

// ========================
// Utilities
// ========================
/**
 * Creates an abort signal bound to the current scope.
 * @returns An operation that yields an AbortSignal.
 */
export function useAbortSignal(): Operation<AbortSignal> {
  return resource(function* (provide) {
    const controller = new AbortController();
    try {
      yield* provide(controller.signal);
    } finally {
      controller.abort();
    }
  });
}