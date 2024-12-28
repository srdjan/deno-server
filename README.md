# **Deno Effection HTTP Server with Dynamic Routing and Middleware**

A lightweight, functional-style HTTP server built with **Deno** and **Effection**. This server supports dynamic routing, static file serving, middleware, and structured concurrency.

---

## **Features**

- **Dynamic Routing**: Define routes with `path`, `method`, and `handler`.
- **Static File Serving**: Serve static files (HTML, CSS, JS, images) from the `public` directory.
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

3. Add static files (e.g., `index.html`, `style.css`) to the `public` directory.

### **Running the Server**

1. Start the server:

   ```bash
   deno run --allow-net --allow-read server.ts
   ```

2. The server will start on `http://localhost:8000`.

---

## **Project Structure**

```
.
├── server.ts            # Main server script
├── deps.ts              # Dependency management
├── public/              # Directory for static files
│   ├── index.html       # Example HTML file
│   ├── style.css        # Example CSS file
│   └── 404.html         # Custom 404 error page
└── README.md            # This file
```

---

## **Adding Routes**

To add a new route, update the `routes` array in `server.ts`:

```typescript
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
    handler: (req) => {
      const url = new URL(req.url);
      const filePath = `./public${url.pathname.substring("/static".length)}`;
      return serveStatic(filePath);
    },
  },
  // Add new routes here
  {
    path: "/api/data",
    method: "GET",
    handler: () => new Response(JSON.stringify({ message: "Hello from the API!" }), {
      headers: { "Content-Type": "application/json" },
    }),
  },
];
```

---

## **Middleware**

Middleware functions can be added to the `handler` in `server.ts`:

```typescript
const handler = securityHeadersMiddleware(loggingMiddleware(handleRequest));
```

### **Example Middleware**

- **Logging Middleware**: Logs request details (method, URL, status, duration).
- **Security Headers Middleware**: Adds security headers like `Content-Security-Policy` and `X-XSS-Protection`.

---

## **Static File Serving**

Static files are served from the `public` directory under the `/static` route. For example:

- `http://localhost:8000/static/style.css` serves `./public/style.css`.

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
  curl http://localhost:8000/static/style.css
  ```

- **API Endpoint**:

  ```bash
  curl http://localhost:8000/api/data
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
   - Write unit tests for the server using Effection's testing utilities.

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

- Built with [Deno](https://deno.land/) and [Effection](https://frontside.com/effection/).
- Inspired by functional programming principles.

---
 🚀
