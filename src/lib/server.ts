import * as path from "jsr:@std/path";
import {
  main,
  call,
  createChannel,
  useResource,
  retry,
  fallback,
  useAbortSignal,
  composeMiddleware,
  globalErrorHandler,
} from "./higherEffection.ts";
import type { Operation, Stream } from "./higherEffection.ts";

// Types
type Config = {
  port: number;
  env: string;
  publicDir: string;
  shutdownTimeout: number;
};

type RequestHandler = (req: Request) => Operation<Response>;

export type Route = {
  path: string | RegExp;
  method: string;
  handler: RequestHandler;
  params?: string[];
};

interface RequestTracker {
  track(request: Promise<Response>): Operation<void>;
  waitForCompletion(): Operation<void>;
}

// Config as a resource
function* createConfig(): Operation<Config> {
  return yield* useResource(
    function* () {
      const config = {
        port: parseInt(Deno.env.get("PORT") || "8000"),
        env: Deno.env.get("DENO_ENV") || "development",
        publicDir: Deno.env.get("PUBLIC_DIR") || "./public",
        shutdownTimeout: parseInt(Deno.env.get("SHUTDOWN_TIMEOUT") || "5000"),
      };

      if (isNaN(config.port) || config.port <= 0) {
        throw new Error("Invalid port configuration");
      }

      if (isNaN(config.shutdownTimeout) || config.shutdownTimeout <= 0) {
        throw new Error("Invalid shutdown timeout configuration");
      }

      return config;
    },
    function* (config) {
      return config;
    }
  );
}

// MIME types resource
function* createMimeTypes(): Operation<Map<string, string>> {
  const types = new Map<string, string>([
    ["html", "text/html"],
    ["css", "text/css"],
    ["js", "application/javascript"],
    ["json", "application/json"],
    ["png", "image/png"],
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["gif", "image/gif"],
    ["svg", "image/svg+xml"],
  ]);

  return yield* useResource(
    function* () {
      return types;
    },
    function* (types) {
      return types;
    }
  );
}

// Request tracking
function* createRequestTracker(): Operation<RequestTracker> {
  const activeRequests = new Set<Promise<Response>>();

  return yield* useResource(
    function* () {
      const tracker: RequestTracker = {
        *track(request: Promise<Response>) {
          activeRequests.add(request);
          try {
            yield* call(() => request);
          } finally {
            activeRequests.delete(request);
          }
        },
        *waitForCompletion() {
          if (activeRequests.size > 0) {
            yield* call(() => Promise.all(Array.from(activeRequests)));
          }
        },
      };
      return tracker;
    },
    function* (tracker) {
      return tracker;
    }
  );
}

// Logging middleware
function processLoggingMiddleware(handle: RequestHandler): RequestHandler {
  return function* (req: Request): Operation<Response> {
    const requestId = crypto.randomUUID();
    const start = Date.now();

    try {
      const res = yield* handle(req);
      const duration = Date.now() - start;

      console.log(JSON.stringify({
        requestId,
        method: req.method,
        url: req.url,
        status: res.status,
        duration,
        timestamp: new Date().toISOString(),
      }));

      return res;
    } catch (error) {
      console.error(JSON.stringify({
        requestId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      }));
      throw error;
    }
  };
}

// Security headers middleware
function processSecurityHeadersMiddleware(handle: RequestHandler): RequestHandler {
  return function* (req: Request): Operation<Response> {
    const res = yield* handle(req);
    const newRes = new Response(res.body, res);

    newRes.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
    );
    newRes.headers.set("X-Content-Type-Options", "nosniff");
    newRes.headers.set("X-Frame-Options", "DENY");
    newRes.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    newRes.headers.set("X-XSS-Protection", "1; mode=block");

    return newRes;
  };
}

// Static file serving
function* serveStatic(filePath: string, config: Config, mimeTypes: Map<string, string>): Operation<Response> {
  return yield* useResource(
    function* () {
      const normalizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
      const fullPath = path.join(config.publicDir, normalizedPath);

      if (!fullPath.startsWith(path.resolve(config.publicDir))) {
        return new Response("Forbidden", { status: 403 });
      }

      const file = yield* call(() => Deno.readFile(fullPath));
      const contentType = mimeTypes.get(path.extname(fullPath).slice(1)) || "text/plain";

      return new Response(file, {
        headers: { "Content-Type": contentType },
      });
    },
    function* (response) {
      return response;
    }
  );
}

// Router
type Router = {
  matchRoute(path: string, method: string): Route | undefined;
};

function* createRouter(routes: Route[]): Operation<Router> {
  return yield* useResource(
    function* () {
      const router: Router = {
        matchRoute(path: string, method: string): Route | undefined {
          return routes.find((route) => {
            if (typeof route.path === "string") {
              return path === route.path && route.method === method;
            }
            return route.path.test(path) && route.method === method;
          });
        },
      };
      return router;
    },
    function* (router) {
      return router;
    }
  );
}

function* createSignalHandler(): Operation<Stream<string, void>> {
  const channel = createChannel<string>();

  return yield* useResource(
    function* () {
      // Add signal listeners
      Deno.addSignalListener("SIGINT", () => channel.send("SIGINT"));
      Deno.addSignalListener("SIGTERM", () => channel.send("SIGTERM"));

      // Return the channel as a stream
      return {
        *[Symbol.iterator]() {
          const subscription = yield* channel;
          while (true) {
            const result = yield* subscription.next();
            if (result.done) break;
            yield result.value;
          }
        },
      } as Stream<string, void>; // Explicitly cast to Stream<string, void>
    },
    function* () {
      // Clean up signal listeners
      Deno.removeSignalListener("SIGINT", () => channel.send("SIGINT"));
      Deno.removeSignalListener("SIGTERM", () => channel.send("SIGTERM"));
    }
  );
}

// Handle individual requests
function* handleRequest(
  req: Request,
  config: Config,
  mimeTypesMap: Map<string, string>,
  router: Router,
): Operation<Response> {
  return yield* retry(
    function* () {
      return yield* fallback(
        function* () {
          const url = new URL(req.url);
          const path = url.pathname;
          const method = req.method;

          // Try serving static files first
          const filePath = `${config.publicDir}${path}`;
          try {
            const stat = yield* call(() => Deno.stat(filePath));
            if (stat.isFile) {
              return yield* serveStatic(path, config, mimeTypesMap);
            }
          } catch {
            // Continue to route matching if file not found
          }

          // Match routes
          const route = router.matchRoute(path, method);
          if (route) {
            return yield* route.handler(req);
          }

          return new Response("Route Not Found", { status: 404 });
        },
        function* () {
          return new Response("Internal Server Error", { status: 500 });
        }
      );
    },
    3, // Max retries
    1000 // Delay between retries
  );
}

// Main server creation
function* createServer(config: Config, routes: Route[], middleware: RequestHandler[] = []): Operation<void> {
  const requestTracker = yield* createRequestTracker();
  const mimeTypesMap = yield* createMimeTypes();
  const router = yield* createRouter(routes);
  const signalHandler = yield* createSignalHandler();

  const baseHandler: RequestHandler = (req) => handleRequest(req, config, mimeTypesMap, router);

  const finalHandler = composeMiddleware(
    ...middleware,
    processSecurityHeadersMiddleware,
    processLoggingMiddleware
  )(baseHandler);

  const signal = yield* useAbortSignal();

  const server = Deno.serve({ port: config.port, signal }, async (req) => {
    const responsePromise = main(() => finalHandler(req));
    main(() => requestTracker.track(responsePromise));
    return responsePromise;
  });

  console.log(`Server is running on http://localhost:${config.port}`);

  const subscription = yield* signalHandler;
  const result = yield* subscription.next();

  if (!result.done) {
    console.log(`Received ${result.value} signal`);
    server.shutdown();
    yield* requestTracker.waitForCompletion();
  }
}

// Server startup
function* start(appRoutes: Route[], middleware: RequestHandler[] = []): Operation<void> {
  if (!appRoutes || appRoutes.length === 0) {
    throw new Error("Routes must be provided.");
  }

  const config = yield* createConfig();

  try {
    yield* createServer(config, appRoutes, middleware);
  } catch (error) {
    yield* globalErrorHandler(error);
    throw error;
  }
}

// Main execution
export function run(routes: Route[], middleware: RequestHandler[] = []) {
  main(function* () {
    yield* start(routes, middleware);
  }
}