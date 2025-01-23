type Resolve<T = unknown> = (value: T) => void;
type Reject = (error: Error) => void;
type Provide<T> = (value: T) => Operation<void>;

type Result<T> = { ok: true; value: T } | { ok: false; error: Error };
type Effect<T> = Operation<T>;
type Task<T> = Future<T>;

type Stream<T, TReturn> = Operation<Subscription<T, TReturn>>;

type Subscription<T, R> = {
  next(): Operation<IteratorResult<T, R>>;
};

type Context<T> = {
  readonly key: string;
  readonly defaultValue?: T;
  set(value: T): Effect<T>;
  get(): Effect<T | undefined>;
};

type Future<T> = Promise<T> & Effect<T>;

type Scope = {
  run<T>(operation: () => Effect<T>): Task<T>;
  get<T>(context: Context<T>): T | undefined;
  set<T>(context: Context<T>, value: T): T;
};

import type {
  Context,
  Effect,
  Frame,
  Instruction,
  Operation,
  Provide,
  Reject,
  Resolve,
  Result,
  Task,
  reset,
  shift,
  shiftSync,
} from "jsr: @effection/effection";

import {
  main,
  call,
  createContext,
  createFrame,
  createChannel,
  createScope,
  resource as coreResource,
  race,
  sleep,
  spawn as coreSpawn,
} from "jsr: @effection/effection";

/**
 * Creates a basic operation, useful for wrapping any synchronous code.
 * This function allows you to treat values as if they were effects.
 * @param value - The value that will be wrapped as effect
 * @returns an effect that will always yield the given value.
 *
 * @example
 * ```typescript
 * function* example() {
 *   const value = 10;
 *   const result = yield* compute(value);
 * }
 * ```
 */
function compute<T>(value: T): Effect<T> {
  return {
    [Symbol.iterator]: () => ({
      next: () => ({ done: true, value } as const),
    }),
  };
}

/**
 * Defines a basic unit of work in effection.
 * An `effect` is the same as an `operation` but allows us to expose a higher level abstraction.
 * In other words, this is the lowest level api that is exposed to users of effection.
 *
 * @param fn - a generator function that defines the computation
 * @returns a generic operation
 *
 * @example
 * ```typescript
 * const myEffect = effect(function* () {
 *   yield* sleep(100);
 *   return "done";
 * });
 *
 * function* example() {
 *   const result = yield* myEffect();
 * }
 * ```
 */
function effect<T>(fn: () => Generator<any, T, any>): Effect<T> {
  return {
    [Symbol.iterator]: () => fn(),
  };
}

/**
 * Indefinitely pause execution of the current operation. It is typically
 * used in conjunction with an {@link action} to mark the boundary
 * between setup and teardown.
 *
 * @returns an operation that suspends the current operation
 * @example
 * ```ts
 * function* myResource(): Effect {
 *   const cleanup = () => console.log('cleanup');
 *   try {
 *     yield* suspend();
 *   } finally {
 *     cleanup();
 *   }
 * }
 * ```
 */
function suspend(): Effect<void> {
  return instruction(Suspend);
}

function Suspend(frame: Frame) {
  return shiftSync<Result<void>>((k) => {
    if (frame.aborted) {
      k.tail(Ok(void 0));
    }
  });
}

/**
 * Create an {@link Effect} that can be either resolved (or rejected) with
 * a synchronous callback. This is the Effection equivalent of `new Promise()`.
 *
 * The action body is itself an operation that runs in a new scope that is
 * destroyed completely before program execution returns to the point where the
 * action was yielded to.
 *
 * @example
 * ```typescript
 * const myAction = action(function* (resolve, reject) {
 *   const timeoutId = setTimeout(() => {
 *     if (Math.random() > 0.5) {
 *       resolve(5);
 *     } else {
 *       reject(new Error("bad luck!"));
 *     }
 *   }, 1000);
 *   try {
 *     yield* suspend();
 *   } finally {
 *     clearTimeout(timeoutId);
 *   }
 * });
 *
 * try {
 *   const result = yield* myAction;
 *   console.log(result);
 * } catch (error) {
 *   console.error("Action failed:", error);
 * }
 * ```
 *
 * @typeParam T - type of the action's result.
 * @param operation - body of the action
 * @returns an operation producing the resolved value, or throwing the rejected error
 */
function action<T>(
  operation: (resolve: Resolve<T>, reject: Reject) => Effect<void>,
): Effect<T> {
  return instruction(function Action(frame) {
    return shift<Result<T>>(function* (k) {
      let settle = yield* reset<Resolve<Result<T>>>(function* () {
        let result = yield* shiftSync<Result<T>>((k) => k.tail);

        let destruction = yield* child.destroy();

        if (!destruction.ok) {
          k.tail(destruction);
        } else {
          k.tail(result);
        }
      });

      let resolve: Resolve<T> = (value) => settle(Ok(value));
      let reject: Reject = (error) => settle(Err(error));

      let child = frame.createChild(function* () {
        yield* operation(resolve, reject);
        yield* suspend();
      });

      yield* reset(function* () {
        let result = yield* child;
        if (!result.ok) {
          k.tail(result);
        }
      });

      child.enter();
    });
  });
}

/**
 * Run another operation concurrently as a child of the current one.
 *
 * The spawned operation will begin executing immediately and control will
 * return to the caller when it reaches its first suspend point.
 *
 * @param operation - the operation to run as a child of the current task
 * @typeParam T - the type that the spawned task evaluates to
 * @returns a {@link Task} representing a handle to the running operation
 */
function spawn<T>(operation: () => Effect<T>): Effect<Task<T>> {
  return instruction(function Spawn(frame) {
    return shift<Result<Task<T>>>(function (k) {
      let child = frame.createChild<T>(operation);

      child.enter();

      k.tail(Ok(child.getTask()));

      return reset(function* () {
        let result = yield* child;
        if (!result.ok) {
          yield* frame.crash(result.error);
        }
      });
    });
  });
}

/**
 * Define an Effection [resource](https://frontside.com/effection/docs/resources)
 *
 * Resources are a type of operation that passes a value back to its caller
 * while still allowing that operation to run in the background. It does this
 * by invoking the special `provide()` operation. The caller pauses until the
 * resource operation invokes `provide()` at which point the caller resumes with
 * the passed value.
 *
 * `provide()` suspends the resource operation until the caller passes out of
 * scope.
 *
 * @param operation - the operation defining the lifecycle of the resource
 * @returns an operation yielding the resource
 */
function resource<T>(
  operation: (provide: Provide<T>) => Effect<void>,
): Effect<T> {
  return instruction((frame) =>
    shift<Result<T>>(function (k) {
      function provide(value: T) {
        k.tail(Ok(value));
        return suspend();
      }

      let child = frame.createChild(() => operation(provide));

      child.enter();

      return reset(function* () {
        let result = yield* child;
        if (!result.ok) {
          k.tail(result);
          yield* frame.crash(result.error);
        }
      });
    }),
  );
}

/**
 * Get the scope of the currently running {@link Operation}.
 *
 * @example
 * ```typescript
 * await main(function* () {
 *   const scope = yield* getScope();
 *   scope.run(function* () {
 *     console.log("Running in a child scope");
 *   });
 * });
 * ```
 *
 * @returns an operation yielding the current scope
 */
function* getScope(): Effect<Scope> {
  let frame = yield* getframe();
  let [scope] = createScope(frame);
  return scope;
}

/**
 * @internal
 * Get the frame of the currently running operation.
 */
function getframe(): Effect<Frame> {
  return instruction((frame) =>
    shiftSync<Result<Frame>>((k) => k.tail(Ok(frame))),
  );
}

/**
 * @internal
 * An optimized iterator that yields the instruction on the first call
 * to next, then returns its value on the second.
 */
function instruction<T>(i: Instruction): Effect<T> {
  return {
    [Symbol.iterator]() {
      let entered = false;
      return {
        next(value) {
          if (!entered) {
            entered = true;
            return { done: false, value: i };
          } else {
            return { done: true, value };
          }
        },
        throw(error) {
          throw error;
        },
      };
    },
  };
}

// Re-export core functions and higher-level APIs
export {
  main,
  compute,
  effect,
  resource,
  suspend,
  action,
  spawn,
  getScope,
};