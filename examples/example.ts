import { main, compute, effect, useResource, withTimeout, withRetry, parallel } from "../src/lib/higherEffection.ts";

await main(function* () {
  // Using compute for synchronous operations (no explicit call)
  const sum = yield* compute('calculate-sum', () => {
    console.log('Executing computation');
    return 2 + 2;
  });
  console.log(sum); // 4

  // Using effect for asynchronous operations (no explicit call)
  const data = yield* effect('fetch-data', () => {
    console.log('Fetching data');
    return fetch('https://jsonplaceholder.typicode.com/todos/1').then(res => res.json());
  });
  console.log(data); // { userId: 1, id: 1, title: '...', completed: false }

  // Using useResource for resource management
  const resource = yield* useResource(
    function* () {
      return "resource";
    },
    function* () {
      console.log("Resource released");
    }
  );
  console.log(resource); // "resource"

  // Using withTimeout to handle timeouts
  try {
    yield* withTimeout(
      function* () {
        yield* sleep(2000);
      },
      1000
    );
  } catch (error) {
    console.error(error.message); // "Operation timed out after 1000ms"
  }

  // Using withRetry to retry an operation
  try {
    const result = yield* withRetry(
      function* () {
        throw new Error("Temporary failure");
      },
      { maxAttempts: 3, initialDelay: 1000 }
    );
    console.log(result);
  } catch (error) {
    console.error(error.message); // "Retry failed"
  }

  // Using parallel to run multiple operations concurrently
  const results = yield* parallel([
    function* () {
      return "result1";
    },
    function* () {
      return "result2";
    }
  ]);
  console.log(results); // ["result1", "result2"]
});