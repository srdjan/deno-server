import { main, call as effectionCall, createChannel, resource, race, sleep, spawn, type Operation } from "jsr:@effection/effection";

// Higher-level types to abstract low-level details
type Task<T> = {
  run: () => Operation<T>;
  cancel: () => void;
};

type Resource<T> = {
  acquire: () => Operation<T>;
  release: (resource: T) => Operation<void>;
};

type Stream<T> = {
  subscribe: () => Subscription<T>;
};

type Subscription<T> = {
  next: () => Operation<IteratorResult<T>>;
  return: () => Operation<void>;
};

// Internal utility to auto-wrap functions in `call`
const autoCall = <T>(fn: () => T | Promise<T> | Operation<T>): Operation<T> => {
  const wrappedFn = () => {
    const result = fn();
    if (result instanceof Promise) {
      return result; // Return the Promise as-is
    } else if (typeof (result as Operation<T>)[Symbol.iterator] === 'function') {
      return result; // Return the Operation as-is
    } else {
      return Promise.resolve(result); // Wrap plain values in a Promise
    }
  };
  return effectionCall(wrappedFn);
};

// Core helpers for creating operations
const compute = <T>(description: string, fn: () => T): Operation<T> => ({
  *[Symbol.iterator]() {
    return yield { type: 'computation', execute: () => autoCall(fn), description }; // Auto-wrap in `call`
  }
});

const effect = <T>(description: string, fn: () => Promise<T>): Operation<T> => ({
  *[Symbol.iterator]() {
    return yield { type: 'effect', execute: () => autoCall(fn), description }; // Auto-wrap in `call`
  }
});

// Declarative resource management using Effection's `resource`
const useResource = <T>(
  acquire: () => Operation<T>,
  release: (resource: T) => Operation<void>
): Operation<T> => resource(function* (provide) {
  const resource = yield* acquire;
  try {
    yield* provide(resource);
  } finally {
    yield* release(resource);
  }
});

// Enhanced error handling with computation tracking
const withErrorBoundary = <T>(
  operation: Operation<T>,
  errorHandler?: (error: Error) => Operation<void>
): Operation<T> => ({
  *[Symbol.iterator]() {
    try {
      return yield* operation;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (errorHandler) {
        yield* errorHandler(error);
      }
      throw error;
    }
  }
});

// Improved retry mechanism with explicit steps
type RetryConfig = {
  readonly maxAttempts: number;
  readonly initialDelay: number;
  readonly maxDelay: number;
  readonly backoffFactor: number;
};

const withRetry = <T>(
  operation: Operation<T>,
  config: Partial<RetryConfig> = {}
): Operation<T> => ({
  *[Symbol.iterator]() {
    const finalConfig = {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      ...config
    };

    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt < finalConfig.maxAttempts) {
      try {
        return yield* operation;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempt++;

        yield* compute(
          'log-retry-attempt',
          () => console.warn(
            `Attempt ${attempt} failed:`,
            lastError?.message
          )
        );

        if (attempt < finalConfig.maxAttempts) {
          const delay = Math.min(
            finalConfig.initialDelay * Math.pow(finalConfig.backoffFactor, attempt - 1),
            finalConfig.maxDelay
          );

          yield* effect(
            'delay-before-retry',
            () => new Promise(resolve => setTimeout(resolve, delay))
          );
        }
      }
    }

    throw lastError || new Error('Retry failed');
  }
});

// Enhanced timeout handling
const withTimeout = <T>(
  operation: Operation<T>,
  timeoutMs: number
): Operation<T> => ({
  *[Symbol.iterator]() {
    const timeoutPromise = yield* effect(
      'create-timeout',
      () => new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    );

    return yield* race([operation, timeoutPromise]);
  }
});

// New parallel utility to run multiple operations concurrently
const parallel = <T>(operations: Operation<T>[]): Operation<T[]> => ({
  *[Symbol.iterator]() {
    const tasks = operations.map(op => spawn(op));
    const results = [];
    for (const task of tasks) {
      results.push(yield* task);
    }
    return results;
  }
});

// Export our main functions and types
export {
  main,
  compute,
  effect,
  useResource,
  withErrorBoundary,
  withRetry,
  withTimeout,
  parallel,
  createChannel,
  race,
  sleep
};

export type {
  Operation,
  Task,
  Resource,
  Stream,
  Subscription
};