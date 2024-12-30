import { main, spawn, useAbortSignal } from "../deps.ts";
import * as path from "https://deno.land/std/path/mod.ts";

// Configuration
const CONFIG = {
  port: parseInt(Deno.env.get("PORT") || "8000"),
  env: Deno.env.get("DENO_ENV") || "development",
  publicDir: Deno.env.get("PUBLIC_DIR") || "./public"
};

// Types
export type RequestHandler = (req: Request) => Response | Promise<Response>;

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

// Middleware for structured logging
const loggingMiddleware = (handler: RequestHandler): RequestHandler => async (req) => {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  try {
    const res = await handler(req);
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
const securityHeadersMiddleware = (handler: RequestHandler): RequestHandler => async (req) => {
  const res = await handler(req);
  const newRes = new Response(res.body, res);

  // More granular CSP
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

// Helper function to determine MIME type
const getContentType = (filePath: string): string => {
  const extension = filePath.split(".").pop()?.toLowerCase() || '';
  return MIME_TYPES.get(extension) || 'text/plain';
};

// Serve static files securely
export const serveStatic = async (filePath: string): Promise<Response> => {
  try {
    // Normalize and validate path
    const normalizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(CONFIG.publicDir, normalizedPath);

    // Ensure the path is within public directory
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

// Route matching
const matchRoute = (path: string, method: string): Route | undefined => {
  return routes.find(route => {
    if (typeof route.path === 'string') {
      return path === route.path && route.method === method;
    }
    return route.path.test(path) && route.method === method;
  });
};

// Main request handler
const handleRequest: RequestHandler = async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Check if the path corresponds to a file in the public directory
    const filePath = `${CONFIG.publicDir}${path}`;
    try {
      const stat = await Deno.stat(filePath);
      if (stat.isFile) {
        return serveStatic(filePath);
      }
    } catch {
      // Continue to route matching if file not found
    }

    // Find a matching route
    const route = matchRoute(path, method);

    if (route) {
      return await route.handler(req);
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

// Compose middleware
const composeMiddleware = (
  middlewares: ((handler: RequestHandler) => RequestHandler)[],
  handler: RequestHandler
): RequestHandler => {
  return middlewares.reduce((acc, middleware) => middleware(acc), handler);
};

// Start the server using Deno.serve and Effection
const startServer = async (port: number) => {
  const handler = composeMiddleware(
    [loggingMiddleware, securityHeadersMiddleware],
    handleRequest
  );

  const server = Deno.serve({ port }, handler);

  console.log(`Server is running on http://localhost:${port}`);

  // Use Effection's useAbortSignal to handle graceful shutdown
  const abortSignal = useAbortSignal();
  abortSignal.addEventListener("abort", async () => {
    console.log("Shutting down gracefully...");
    await server.shutdown();
    console.log("Server has been shut down.");
  });

  // Wait for the server to close
  await server.finished;
};

// Main function using Effection
main(function* () {
  yield* spawn(startServer(CONFIG.port));

  // Handle SIGINT and SIGTERM for graceful shutdown
  const abortSignal = useAbortSignal();
  Deno.addSignalListener("SIGINT", () => abortSignal.abort());
  Deno.addSignalListener("SIGTERM", () => abortSignal.abort());

  console.log("Press Ctrl+C to stop the server.");
});

let routes: Route[] = [];

export const start = (appRoutes: Route[]) => {
  if (!appRoutes || appRoutes.length === 0) {
    throw new Error("Routes must be provided.");
  }
  routes = appRoutes;
  main();
};