import { main, spawn, Operation, createChannel, Stream, Context, useAbortSignal, Task } from "../deps.ts";
import * as path from "https://deno.land/std/path/mod.ts";

// Configuration
const CONFIG = {
  port: parseInt(Deno.env.get("PORT") || "8000"),
  env: Deno.env.get("DENO_ENV") || "development",
  publicDir: Deno.env.get("PUBLIC_DIR") || "./public",
  shutdownTimeout: parseInt(Deno.env.get("SHUTDOWN_TIMEOUT") || "5000")
};

// Types
export type RequestHandler = (req: Request, context: Context) => Response | Promise<Response>;

export type Route = {
  path: string | RegExp;
  method: string;
  handler: RequestHandler;
  params?: string[];
};

// MIME type mapping
const MIME_TYPES = new Map([
  ['html', 'text/html'],
  ['css', 'text/css'],
  ['js', 'application/javascript'],
  ['json', 'application/json'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['svg', 'image/svg+xml']
]);

// Create a channel for active requests tracking
const createRequestTracker = () => {
  const activeRequests = new Set<Promise<void>>();
  const channel = createChannel<{ type: 'start' | 'end', promise: Promise<void> }>();

  return {
    channel,
    track: async function* (request: Promise<void>) {
      activeRequests.add(request);
      yield channel.send({ type: 'start', promise: request });

      try {
        await request;
      } finally {
        activeRequests.delete(request);
        yield channel.send({ type: 'end', promise: request });
      }
    },
    * waitForCompletion() {
      const promises = Array.from(activeRequests);
      if (promises.length > 0) {
        yield Promise.all(promises);
      }
    }
  };
};

// Middleware for structured logging with Effection context
const loggingMiddleware = (handler: RequestHandler): RequestHandler => async (req, context) => {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  try {
    const res = await handler(req, context);
    const duration = Date.now() - start;

    console.log(JSON.stringify({
      requestId,
      method: req.method,
      url: req.url,
      status: res.status,
      duration,
      timestamp: new Date().toISOString()
    }));

    return res;
  } catch (error) {
    console.error(JSON.stringify({
      requestId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
};

// Middleware for security headers
const securityHeadersMiddleware = (handler: RequestHandler): RequestHandler => async (req, context) => {
  const res = await handler(req, context);
  const newRes = new Response(res.body, res);

  newRes.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  );
  newRes.headers.set("X-Content-Type-Options", "nosniff");
  newRes.headers.set("X-Frame-Options", "DENY");
  newRes.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  newRes.headers.set("X-XSS-Protection", "1; mode=block");

  return newRes;
};

const getContentType = (filePath: string): string => {
  const extension = filePath.split(".").pop()?.toLowerCase() || '';
  return MIME_TYPES.get(extension) || 'text/plain';
};

// Serve static files securely using Effection context
export const serveStatic = async (filePath: string, context: Context): Promise<Response> => {
  try {
    const normalizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(CONFIG.publicDir, normalizedPath);

    if (!fullPath.startsWith(path.resolve(CONFIG.publicDir))) {
      return new Response("Forbidden", { status: 403 });
    }

    const file = await Deno.readFile(fullPath);
    const contentType = getContentType(fullPath);

    return new Response(file, {
      headers: { "Content-Type": contentType }
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("Not Found", { status: 404 });
    }
    console.error("Error serving static file:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

const matchRoute = (path: string, method: string): Route | undefined => {
  return routes.find(route => {
    if (typeof route.path === 'string') {
      return path === route.path && route.method === method;
    }
    return route.path.test(path) && route.method === method;
  });
};

// Main request handler with Effection context
const handleRequest = (context: Context): RequestHandler => async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    const filePath = `${CONFIG.publicDir}${path}`;
    try {
      const stat = await Deno.stat(filePath);
      if (stat.isFile) {
        return serveStatic(filePath, context);
      }
    } catch {
      // Continue to route matching if file not found
    }

    const route = matchRoute(path, method);

    if (route) {
      return await route.handler(req, context);
    }

    return new Response("Route Not Found", { status: 404 });
  } catch (error) {
    console.error('Unhandled error:', error);
    return new Response(
      CONFIG.env === 'development' ? error.message : "Internal Server Error",
      { status: 500 }
    );
  }
};

const composeMiddleware = (
  middlewares: ((handler: RequestHandler) => RequestHandler)[],
  handler: RequestHandler
): RequestHandler => {
  return middlewares.reduce((acc, middleware) => middleware(acc), handler);
};

// Enhanced server lifecycle management using Effection
function* createServer(port: number): Operation<void> {
  const requestTracker = createRequestTracker();
  const context = yield* Context.create();

  const handler = composeMiddleware(
    [loggingMiddleware, securityHeadersMiddleware],
    handleRequest(context)
  );

  const server = Deno.serve({ port }, async (req) => {
    const requestPromise = handler(req, context);
    yield * requestTracker.track(requestPromise);
    return requestPromise;
  });

  console.log(`Server is running on http://localhost:${port}`);

  try {
    // Handle graceful shutdown
    const shutdown = yield* Stream.race([
      Stream.fromAbortSignal(useAbortSignal()),
      Stream.fromEvent(Deno, "SIGINT"),
      Stream.fromEvent(Deno, "SIGTERM")
    ]);

    console.log("Initiating graceful shutdown...");

    // Stop accepting new connections
    server.shutdown();

    // Wait for existing requests to complete with timeout
    yield* Task.timeout(CONFIG.shutdownTimeout, function* () {
      yield* requestTracker.waitForCompletion();
    });

    console.log("Server has been shut down gracefully.");
  } finally {
    context.abort();
  }
}

let routes: Route[] = [];

// Start server with enhanced error handling
export const start = (appRoutes: Route[]) => {
  if (!appRoutes || appRoutes.length === 0) {
    throw new Error("Routes must be provided.");
  }
  routes = appRoutes;

  main(function* () {
    try {
      yield* createServer(CONFIG.port);
    } catch (error) {
      console.error("Fatal server error:", error);
      Deno.exit(1);
    }
  });
};