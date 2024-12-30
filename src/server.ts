import { main, spawn, useAbortSignal } from "./deps.ts";

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
  res.headers.set("Content-Security-Policy", "default-src 'self'");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  return res;
};

export const serveStatic = async (filePath: string): Promise<Response> => {
  try {
    const file = await Deno.readFile(filePath);
    const contentType = getContentType(filePath);
    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
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

  // Find a matching route
  const route = routes.find(
    (r) => path.startsWith(r.path) && r.method === method
  );

  if (route) {
    return await route.handler(req);
  } else {
    return new Response("Not Found", { status: 404 });
  }
};

// Start the server using Deno.serve and Effection
const startServer = async (port: number) => {
  const handler = securityHeadersMiddleware(loggingMiddleware(handleRequest));
  const server = Deno.serve({ port }, handler);

  console.log(`Server is running on http://localhost:${port}`);

  // Use Effection's useAbortSignal to handle graceful shutdown
  const abortSignal = useAbortSignal();
  abortSignal.addEventListener("abort", () => {
    server.shutdown();
    console.log("Server has been shut down gracefully.");
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
  routes = appRoutes;
  main();
}