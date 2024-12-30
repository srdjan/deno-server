
# **Deno HTTP Server with Static File Serving and Dynamic Routing**

A lightweight, functional-style HTTP server built with **Deno** and **Effection**. This server supports static file serving, dynamic routing, middleware, and structured concurrency.

---

## **Features**

- **Static File Serving**: Serve static files (HTML, CSS, JS, images) from the `public` directory.
- **Dynamic Routing**: Define routes with `path`, `method`, and `handler`.
- **Middleware**: Add middleware for logging and security headers.
- **Structured Concurrency**: Use Effection for managing asynchronous workflows and graceful shutdown.
- **Graceful Shutdown**: Handle `SIGINT` and `SIGTERM` signals for clean server shutdown.

---

## **Getting Started**

### **Prerequisites**

- [Deno](https://deno.land/) installed on your machine.

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

3. Add static files (e.g., `index.html`, `styles.css`) to the `public` directory.

### **Running the Server**

1. Start the server:

   ```bash
   deno run --allow-net --allow-read routes.ts
   ```

2. The server will start on `http://localhost:8000`.

---

## **Project Structure**

```
.
├── server/              # Server implementation
│   ├── server.ts        # Main server script
│   └── deps.ts          # Dependency management
├── routes.ts            # Application routes
├── public/              # Directory for static files
│   ├── index.html       # Example HTML file
│   ├── styles.css       # Example CSS file
│   └── 404.html         # Custom 404 error page
└── README.md            # This file
```

---

## **Defining Routes**

The `routes.ts` file defines the routes and starts the server. Here’s an example:

```typescript
// routes.ts
import { Route, serveStatic, start } from "../server/server.ts";

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
    handler: async (req) => {
      const url = new URL(req.url);
      const filePath = `./public${url.pathname.substring("/static".length)}`;
      return await serveStatic(filePath);
    },
  },
];

start(routes);
```

---

## **Middleware**

Middleware functions are applied globally in the server implementation (`server.ts`). For example:

```typescript
const handler = composeMiddleware([loggingMiddleware, securityHeadersMiddleware], handleRequest);
```

### **Example Middleware**

- **Logging Middleware**: Logs request details (method, URL, status, duration).
- **Security Headers Middleware**: Adds security headers like `Content-Security-Policy` and `X-XSS-Protection`.

---

## **Static File Serving**

Static files are served from the `public` directory under the `/static` route. For example:

- `http://localhost:8000/static/index.html` serves `./public/index.html`.
- `http://localhost:8000/static/styles.css` serves `./public/styles.css`.

---

## **Graceful Shutdown**

The server handles `SIGINT` and `SIGTERM` signals for graceful shutdown. Press `Ctrl+C` to stop the server.

---

## **Example Requests**

- **Homepage**:

  ```bash
  curl http://localhost:8000/
  ```

- **About Page**:

  ```bash
  curl http://localhost:8000/about
  ```

- **Static File**:

  ```bash
  curl http://localhost:8000/static/index.html
  ```

- **Custom 404 Page**:

  ```bash
  curl http://localhost:8000/nonexistent
  ```

---

## **Next Steps**

1. **Streaming**:
   - Implement streaming for large files using `Deno.open`.

2. **Testing**:
   - Write unit tests for the server using Deno's built-in testing framework.

3. **Configuration**:
   - Use environment variables or a configuration file to customize the server's behavior.

---

## **Contributing**

Contributions are welcome! Please open an issue or submit a pull request.

---

## **License**

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## **Acknowledgments**

- Built by DeepSeek & Cloude Sonet.
- Uses [Deno](https://deno.land/) and [Effection](https://frontside.com/effection/).
- Built with [Deno](https://deno.land/) and [Effection](https://frontside.com/effection/).
- Inspired by functional programming principles.

---
 🚀
