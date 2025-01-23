import {
  Operation,
  compute,
  effect,
  withErrorBoundary,
  withRetry,
  withTimeout,
  type Result
} from "./higherEffection.ts";

// Type definitions using readonly to ensure immutability
type ServerConfig = Readonly<{
  port: number;
  env: string;
  publicDir: string;
  shutdownTimeout: number;
  maxRequestSize: number;
  corsOrigins: readonly string[];
  rateLimits: {
    readonly windowMs: number;
    readonly maxRequests: number;
  };
  security: {
    readonly csp: Readonly<Record<string, readonly string[]>>;
    readonly hstsMaxAge: number;
  };
}>;

type Route = Readonly<{
  path: string | RegExp;
  method: string;
  handler: (req: Request) => Operation<Response>;
}>;

type RequestContext = Readonly<{
  id: string;
  timestamp: number;
  path: string;
  method: string;
  headers: Headers;
}>;

// Pure functions for configuration handling
const validateConfig = (config: Partial<ServerConfig>): Result<ServerConfig> => {
  const requiredFields = ['port', 'env', 'publicDir', 'shutdownTimeout'];
  const missingFields = requiredFields.filter(field => !(field in config));

  if (missingFields.length > 0) {
    return {
      type: 'error',
      error: new Error(`Missing required fields: ${missingFields.join(', ')}`)
    };
  }

  if ((config.port ?? 0) <= 0) {
    return {
      type: 'error',
      error: new Error('Invalid port configuration')
    };
  }

  return {
    type: 'ok',
    value: config as ServerConfig
  };
};

// Here's the corrected createServer function that properly uses Deno.serve
const createServer = (config: ServerConfig, routes: readonly Route[]): Operation<void> => ({
  *[Symbol.iterator]() {
    // Initialize MIME types as a pure computation
    const mimeTypes = yield* compute(
      'initialize-mime-types',
      () => new Map([
        ['html', 'text/html'],
        ['css', 'text/css'],
        ['js', 'application/javascript'],
        ['json', 'application/json'],
        ['png', 'image/png'],
        ['jpg', 'image/jpeg'],
        ['gif', 'image/gif'],
        ['svg', 'image/svg+xml']
      ])
    );

    // Create the abort controller for shutdown handling
    const controller = yield* compute(
      'create-abort-controller',
      () => new AbortController()
    );

    // Start the server as an effect
    const server = yield* effect(
      'start-server',
      async () => {
        return Deno.serve({
          port: config.port,
          signal: controller.signal,
          onListen: ({ port }) => {
            console.log(`Server running on http://localhost:${port}`);
          },
          handler: async (req: Request) => {
            try {
              // Convert the handler result into a Promise to work with Deno.serve
              const operation = handleRequest(req, config, routes, mimeTypes);
              return await operation[Symbol.iterator]().next().value;
            } catch (error) {
              console.error('Request handler error:', error);
              return new Response('Internal Server Error', { status: 500 });
            }
          }
        });
      }
    );

    try {
      // Create and wait for shutdown signal
      const shutdownSignal = yield* effect(
        'setup-shutdown-handler',
        () => new Promise<void>((resolve) => {
          const signals = ['SIGINT', 'SIGTERM'];
          const cleanup = () => {
            signals.forEach(signal => Deno.removeSignalListener(signal, handleSignal));
            resolve();
          };

          const handleSignal = () => {
            console.log('\nShutdown signal received');
            cleanup();
          };

          signals.forEach(signal => Deno.addSignalListener(signal, handleSignal));
        })
      );

      // Wait for shutdown signal
      yield* effect(
        'await-shutdown',
        () => shutdownSignal
      );

      // Graceful shutdown
      yield* compute(
        'initiate-shutdown',
        () => {
          console.log('Starting graceful shutdown...');
          controller.abort();
          return server.shutdown();
        }
      );

    } catch (err) {
      yield* compute(
        'handle-server-error',
        () => {
          console.error('Server error:', err);
          controller.abort();
        }
      );
      throw err;
    }
  }
});

// Request handling with explicit computations and effects
const handleRequest = (
  req: Request,
  config: ServerConfig,
  routes: readonly Route[],
  mimeTypes: ReadonlyMap<string, string>
): Operation<Response> => ({
  *[Symbol.iterator]() {
    // Parse request - pure computation
    const context = yield* compute(
      'parse-request',
      () => ({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        path: new URL(req.url).pathname,
        method: req.method,
        headers: req.headers
      })
    );

    // Wrap the entire request handling in error boundary
    return yield* withErrorBoundary(
      {
        *[Symbol.iterator]() {
          // Try static file serving first
          const staticResponse = yield* handleStaticFile(context.path, config, mimeTypes);
          if (staticResponse) return staticResponse;

          // Match route - pure computation
          const route = yield* compute(
            'match-route',
            () => routes.find(r =>
              r.method === context.method &&
              (typeof r.path === 'string' ? r.path === context.path : r.path.test(context.path))
            )
          );

          if (!route) {
            return new Response('Not Found', { status: 404 });
          }

          // Handle the route with timeout and retries
          const response = yield* withTimeout(
            withRetry(
              () => route.handler(req),
              { maxAttempts: 3 }
            ),
            config.shutdownTimeout
          );

          // Add security headers - pure computation
          return yield* compute(
            'add-security-headers',
            () => addSecurityHeaders(response, config)
          );
        }
      },
      (error) => ({
        *[Symbol.iterator]() {
          console.error(`Request ${context.id} failed:`, error);
        }
      })
    );
  }
});

// Static file handling with explicit computations and effects
const handleStaticFile = (
  path: string,
  config: ServerConfig,
  mimeTypes: ReadonlyMap<string, string>
): Operation<Response | null> => ({
  *[Symbol.iterator]() {
    // Path normalization and security check - pure computation
    const normalizedPath = yield* compute(
      'normalize-path',
      () => {
        const cleanPath = path.normalize(path).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.join(config.publicDir, cleanPath);
        return { fullPath, isAllowed: fullPath.startsWith(path.resolve(config.publicDir)) };
      }
    );

    if (!normalizedPath.isAllowed) {
      return null;
    }

    try {
      // File reading - effect
      const file = yield* effect(
        'read-static-file',
        () => Deno.readFile(normalizedPath.fullPath)
      );

      // Response creation - pure computation
      return yield* compute(
        'create-static-response',
        () => {
          const ext = path.extname(normalizedPath.fullPath).slice(1);
          const contentType = mimeTypes.get(ext) || 'application/octet-stream';

          return new Response(file, {
            headers: { 'Content-Type': contentType }
          });
        }
      );
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return null;
      }
      throw err;
    }
  }
});

// Security header handling - pure computation
const addSecurityHeaders = (response: Response, config: ServerConfig): Response => {
  const newResponse = new Response(response.body, response);
  const headers = newResponse.headers;

  // Add CSP
  const cspDirectives = Object.entries(config.security.csp)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
  headers.set('Content-Security-Policy', cspDirectives);

  // Add other security headers
  headers.set('Strict-Transport-Security', `max-age=${config.security.hstsMaxAge}; includeSubDomains`);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');

  return newResponse;
};
export type Route = {
  path: string | RegExp;
  method: string;
  handler: (req: Request) => Promise<Response> | Response;
  middleware?: Middleware[];
};

export type Middleware = (
  req: Request,
  next: (req: Request) => Promise<Response>
) => Promise<Response>;

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });

// Helper to compose middleware with handler
const applyMiddleware = (
  handler: (req: Request) => Promise<Response> | Response,
  middleware: Middleware[] = []
) => {
  return async (req: Request): Promise<Response> => {
    let index = -1;

    const next = async (req: Request): Promise<Response> => {
      index++;
      if (index < middleware.length) {
        return await middleware[index](req, next);
      }
      return await Promise.resolve(handler(req));
    };

    return next(req);
  };
};

// Main server startup function
const startServer = (routes: readonly Route[]): Operation<void> => ({
  *[Symbol.iterator]() {
    // Load and validate configuration
    const config = yield* compute(
      'load-config',
      () => ({
        port: parseInt(Deno.env.get("PORT") || "8000"),
        env: Deno.env.get("DENO_ENV") || "development",
        publicDir: Deno.env.get("PUBLIC_DIR") || "./public",
        shutdownTimeout: parseInt(Deno.env.get("SHUTDOWN_TIMEOUT") || "5000"),
        maxRequestSize: parseInt(Deno.env.get("MAX_REQUEST_SIZE") || "1048576"),
        corsOrigins: Deno.env.get("CORS_ORIGINS")?.split(",") || [],
        rateLimits: {
          windowMs: 60000,
          maxRequests: 100
        },
        security: {
          csp: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'"]
          },
          hstsMaxAge: 31536000
        }
      })
    );

    // Validate configuration
    const validationResult = yield* compute(
      'validate-config',
      () => validateConfig(config)
    );

    if (validationResult.type === 'error') {
      throw validationResult.error;
    }

    // Start server with validated configuration
    yield* createServer(validationResult.value, routes);
  }
});

export { startServer as run };
export type { ServerConfig, Route };