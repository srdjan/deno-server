// Import necessary modules from Deno
import { serve } from "https://deno.land/std/http/server.ts";
import { join, normalize } from "https://deno.land/std/path/mod.ts";

// Define types
type RequestHandler = (req: Request) => Promise<Response>;
type Middleware = (req: Request, next: () => Promise<Response>) => Promise<Response>;
type Route = {
  path: string;
  method: string;
  handler: RequestHandler;
};

// Configuration via environment variables
const PORT = parseInt(Deno.env.get("PORT") || "8000");
const STATIC_DIRS = (Deno.env.get("STATIC_DIRS") || "./public").split(",");
const LOG_LEVEL = Deno.env.get("LOG_LEVEL") || "info";

// Cache for frequently accessed files
const fileCache = new Map<string, Uint8Array>();

// Middleware for logging requests
const loggingMiddleware: Middleware = async (req, next) => {
  const start = Date.now();
  try {
    const res = await next();
    const duration = Date.now() - start;
    if (LOG_LEVEL === "debug") {
      console.debug(`${req.method} ${req.url} - ${res.status} (${duration}ms)`);
    } else {
      console.log(`${req.method} ${req.url} - ${res.status}`);
    }
    return res;
  } catch (error) {
    console.error(`Error processing request: ${error.message}`);
    throw error;
  }
};

// Middleware for adding security headers
const securityHeadersMiddleware: Middleware = async (req, next) => {
  const res = await next();
  res.headers.set("Content-Security-Policy", "default-src 'self'");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  return res;
};

// Serve static files securely
const serveStatic = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = normalize(url.pathname).replace(/^(\.\.(\/|\\|$))+/, ""); // Sanitize path
  let filePath: string | undefined;

  // Check cache first
  if (fileCache.has(path)) {
    const file = fileCache.get(path)!;
    const contentType = getContentType(path);
    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  }

  // Check each static directory for the file
  for (const dir of STATIC_DIRS) {
    const fullPath = join(dir, path);
    try {
      const stat = await Deno.stat(fullPath);
      if (stat.isFile) {
        filePath = fullPath;
        break;
      } else if (stat.isDirectory) {
        const indexPath = join(fullPath, "index.html");
        try {
          await Deno.stat(indexPath);
          filePath = indexPath;
          break;
        } catch {
          // No index.html in this directory
        }
      }
    } catch {
      // File not found in this directory
    }
  }

  if (!filePath) {
    // Check for custom error pages
    const errorPagePath = join(STATIC_DIRS[0], "404.html");
    try {
      const errorPage = await Deno.readTextFile(errorPagePath);
      return new Response(errorPage, {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }

  // Serve the file
  const file = await Deno.readFile(filePath);
  fileCache.set(path, file); // Cache the file
  const contentType = getContentType(filePath);
  return new Response(file, {
    headers: { "Content-Type": contentType },
  });
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

// Define routes
const routes: Route[] = [
  {
    path: "/",
    method: "GET",
    handler: () => new Response("Hello, World!", { status: 200 }),
  },
  {
    path: "/about",
    method: "GET",
    handler: () => new Response("About page", { status: 200 }),
  },
  {
    path: "/static",
    method: "GET",
    handler: serveStatic,
  },
];

// Generic route handler
const handleRequest: RequestHandler = async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Find a matching route
  const route = routes.find(
    (r) => path.startsWith(r.path) && r.method === method
  );

  if (route) {
    return route.handler(req);
  } else {
    return new Response("Not Found", { status: 404 });
  }
};

// Apply middleware to the request handler
const applyMiddleware = (
  handler: RequestHandler,
  ...middlewares: Middleware[]
): RequestHandler => {
  return async (req) => {
    let index = 0;
    const next = async (): Promise<Response> => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        return middleware(req, next);
      } else {
        return handler(req);
      }
    };
    return next();
  };
};

// Start the server with middleware
const startServer = () => {
  const server = serve(
    applyMiddleware(handleRequest, loggingMiddleware, securityHeadersMiddleware),
    { port: PORT }
  );
  console.log(`Server is running on http://localhost:${PORT}`);

  // Graceful shutdown for SIGINT and SIGTERM
  const shutdown = () => {
    console.log("\nShutting down gracefully...");
    server.shutdown();
    Deno.exit(0);
  };
  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);
};

// Start the server
startServer();