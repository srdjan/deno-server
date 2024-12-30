# **Deno HTTP Server with Static File Serving and Dynamic Routing**

A robust, functional-style HTTP server built with **Deno** and **Effection**. This server implements secure static file serving, dynamic routing with RegExp support, comprehensive middleware system, and advanced structured concurrency patterns.

---

## **Features**

- **Enhanced Static File Serving**: Secure static file serving with path traversal protection and MIME type caching
- **Advanced Dynamic Routing**: Define routes with `path` (string or RegExp), `method`, and `handler`
- **Comprehensive Middleware**: Built-in middleware for logging, security headers, and request tracking
- **Advanced Structured Concurrency**: Leverages Effection for robust resource management and graceful shutdown
- **Security Features**: Strong security defaults with CSP and other security headers
- **Request Tracking**: Monitor and manage in-flight requests during shutdown
- **Environment Configuration**: Flexible configuration through environment variables
- **Structured Logging**: Detailed request logging with unique request IDs and timing

---

## **Getting Started**

### **Prerequisites**

- [Deno](https://deno.land/) 1.37 or higher installed on your machine
- Understanding of TypeScript and async programming

### **Installation**

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/deno-http-server.git
   cd deno-http-server
   ```

2. Create a `public` directory for static files:

   ```bash
   mkdir public
   ```

3. Configure environment variables (optional):

   ```bash
   export PORT=8000
   export DENO_ENV=development
   export PUBLIC_DIR=./public
   export SHUTDOWN_TIMEOUT=5000
   ```

### **Running the Server**

1. Start the server:

   ```bash
   deno run --allow-net --allow-read --allow-env routes.ts
   ```

2. The server will start on `http://localhost:8000` (or configured PORT).

---

## **Project Structure**

```
.
├── server/              # Server implementation
│   ├── server.ts        # Main server implementation
│   └── deps.ts          # Dependency management
├── routes.ts            # Application routes
├── public/              # Directory for static files
│   ├── index.html       # Example HTML file
│   ├── styles.css       # Example CSS file
│   └── 404.html        # Custom 404 error page
└── README.md           # This file
```

---

## **Defining Routes**

Routes now support RegExp patterns and include Effection context:

```typescript
// routes.ts
import { Route, serveStatic, start } from "../server/server.ts";

const routes: Route[] = [
  {
    path: "/",
    method: "GET",
    handler: async (req, context) => new Response("Hello, World!", { status: 200 }),
  },
  {
    path: /^\/users\/(\d+)$/,  // RegExp pattern for dynamic routes
    method: "GET",
    handler: async (req, context) => new Response("User details", { status: 200 }),
  },
  {
    path: "/static",
    method: "GET",
    handler: async (req, context) => {
      const url = new URL(req.url);
      const filePath = `./public${url.pathname.substring("/static".length)}`;
      return await serveStatic(filePath, context);
    },
  },
];

start(routes);
```

---

## **Middleware**

The server now includes enhanced middleware capabilities:

```typescript
// Example custom middleware with context
const customMiddleware = (handler: RequestHandler): RequestHandler => 
  async (req, context) => {
    const response = await handler(req, context);
    // Middleware logic here
    return response;
  };

// Built-in middleware includes:
// - Logging middleware with request tracking
// - Security headers middleware with configurable CSP
// - Request tracking middleware for graceful shutdown
```

### **Security Headers**

Built-in security headers include:

```typescript
{
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-XSS-Protection": "1; mode=block"
}
```

---

## **Static File Serving**

Enhanced static file serving features:

- Path traversal protection
- Cached MIME type mapping
- Secure file access within public directory
- Proper error handling for missing files

---

## **Advanced Features**

### **Request Tracking**

```typescript
const requestTracker = createRequestTracker();
// Tracks in-flight requests for graceful shutdown
yield* requestTracker.track(requestPromise);
```

### **Graceful Shutdown**

The server now implements comprehensive shutdown handling:

1. Captures SIGINT and SIGTERM signals
2. Stops accepting new connections
3. Waits for in-flight requests to complete (with timeout)
4. Cleans up resources using Effection context
5. Logs shutdown progress

### **Structured Logging**

Example log output:

```json
{
  "requestId": "uuid",
  "method": "GET",
  "url": "/path",
  "status": 200,
  "duration": 123,
  "timestamp": "2024-12-30T12:00:00.000Z"
}
```

---

## **Error Handling**

- Development mode: Detailed error messages
- Production mode: Generic error responses
- Proper error propagation through Effection context
- Comprehensive error logging

---

## **Example Requests**

Same as before, plus:

- **Dynamic User Route**:

  ```bash
  curl http://localhost:8000/users/123
  ```

---

## **Next Steps**

1. **Additional Middleware**:
   - Request body parsing
   - CORS support
   - Rate limiting

2. **Testing**:
   - Unit tests with Deno's testing framework
   - Integration tests with request tracking

3. **Monitoring**:
   - Metrics collection
   - Health check endpoints

---

## **Contributing**

Contributions are welcome! Please open an issue or submit a pull request.

---

## **License**

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## **Acknowledgments**

- Built by DeepSeek & Cloude Sonet gently directed by yours truly.
- Built with [Deno](https://deno.land/) and [Effection](https://frontside.com/effection/)
- Inspired by functional programming principles and robust design patterns

---
 🚀

