import { main, spawn, useAbortSignal } from "../deps.ts";

export type RequestHandler = (req: Request) => Response | Promise<Response>;

export type Route = {
  path: string;
  method: string;
  handler: RequestHandler;
};

// Middleware for logging requests
const loggingMiddleware = (handler: RequestHandler): RequestHandler => async (req) => {
  const start = Date.now();
  const res = await handler(req);
  const duration = Date.now() - start;
  console.log(`${req.method} ${req.url} - ${res.status} (${duration}ms)`);
  return res;
};

// Middleware for adding security headers
const securityHeadersMiddleware = (handler: RequestHandler): RequestHandler => async (req) => {
  const res = await handler(req);
  const newRes = new Response(res.body, res);
  newRes.headers.set("Content-Security-Policy", "default-src 'self'");
  newRes.headers.set("X-Content-Type-Options", "nosniff");
  newRes.headers.set("X-Frame-Options", "DENY");
  newRes.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  newRes.headers.set("X-XSS-Protection", "1; mode=block");
  return newRes;
};

// Serve static files securely
export const serveStatic = async (filePath: string): Promise<Response> => {
  try {
    const file = await Deno.readFile(filePath);
    const contentType = getContentType(filePath);
    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("Not Found", { status: 404 });
    }
    console.error("Error serving static file:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

// Helper function to determine MIME type
const getContentType = (filePath: string): string => {
  const extension = filePath.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "html":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
      return "application/javascript";
    case "json":
      return "application/json";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return "text/plain";
  }
};

// Define the main request handler function
const handleRequest: RequestHandler = async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Check if the path corresponds to a file in the public directory
  const filePath = `./public${path}`;
  try {
    const stat = await Deno.stat(filePath);
    if (stat.isFile) {
      return serveStatic(filePath);
    }
  } catch {
    return new Response("File Not Found", { status: 404 });
  }

  // Find a matching route
  const route = routes.find(
    (r) => path === r.path && r.method === method
  );

  if (route) {
    return await route.handler(req);
  } else {
    return new Response("Route Not Found", { status: 404 });
  }
};

// Compose middleware
const composeMiddleware = (middlewares: ((handler: RequestHandler) => RequestHandler)[], handler: RequestHandler): RequestHandler => {
  return middlewares.reduce((acc, middleware) => middleware(acc), handler);
};

// Start the server using Deno.serve and Effection
const startServer = async (port: number) => {
  const handler = composeMiddleware([loggingMiddleware, securityHeadersMiddleware], handleRequest);
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
  const port = 8000;
  yield* spawn(startServer(port));

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