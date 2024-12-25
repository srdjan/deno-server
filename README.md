# Deno HTTP Server

A lightweight, functional-style HTTP server built with Deno. This server supports static file serving, dynamic routing, middleware, and more, with minimal external dependencies.

---

## Features

- **Static File Serving**: Serve static files (HTML, CSS, JS, images) from specified directories.
- **Dynamic Routing**: Define custom routes with handlers for different HTTP methods.
- **Middleware Support**: Add middleware for logging, security headers, and more.
- **Environment Configuration**: Configure the server using environment variables.
- **Graceful Shutdown**: Handle shutdown signals (`SIGINT`, `SIGTERM`) gracefully.
- **File Caching**: Cache frequently accessed files for improved performance.
- **Custom Error Pages**: Serve custom `404.html` for missing routes or files.

---

## Getting Started

### Prerequisites

- [Deno](https://deno.land/) installed on your machine.

### Installation

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

### Running the Server

1. Start the server:

   ```bash
   deno run --allow-net --allow-read --allow-env server.ts
   ```

2. The server will start on `http://localhost:8000`.

### Environment Variables

You can configure the server using the following environment variables:

- `PORT`: The port to run the server on (default: `8000`).
- `STATIC_DIRS`: Comma-separated list of directories to serve static files from (default: `./public`).
- `LOG_LEVEL`: Logging level (`info` or `debug`, default: `info`).

Example:

```bash
export PORT=8080
export STATIC_DIRS="./public,./assets"
export LOG_LEVEL=debug
deno run --allow-net --allow-read --allow-env server.ts
```

---

## Project Structure

```
.
├── server.ts            # Main server script
├── public/              # Directory for static files
│   ├── index.html       # Example HTML file
│   ├── style.css        # Example CSS file
│   └── 404.html         # Custom 404 error page
├── assets/              # Additional static files (optional)
│   └── image.png        # Example image
└── README.md            # This file
```

---

## Adding Routes

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
    handler: serveStatic,
  },
  // Add new routes here
  {
    path: "/api/data",
    method: "GET",
    handler: async () => {
      const data = { message: "Hello from the API!" };
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    },
  },
];
```

---

## Middleware

Middleware functions can be added to the `applyMiddleware` function in `server.ts`:

```typescript
const server = serve(
  applyMiddleware(handleRequest, loggingMiddleware, securityHeadersMiddleware),
  { port: PORT }
);
```

### Example Middleware

- **Logging Middleware**: Logs request details (method, URL, status, duration).
- **Security Headers Middleware**: Adds security headers like `Content-Security-Policy` and `X-XSS-Protection`.

---

## Custom Error Pages

To serve a custom `404.html` page, place the file in the `public` directory. The server will automatically serve it for missing routes or files.

---

## Performance Optimization

- **File Caching**: Frequently accessed files are cached in memory to reduce disk I/O.
- **Streaming**: For large files, consider using `Deno.open` and streaming the response.

---

## Testing

To test the server, you can use tools like [curl](https://curl.se/) or [Postman](https://www.postman.com/).

### Example Requests

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

- **Custom 404 Page**:

  ```bash
  curl http://localhost:8000/nonexistent
  ```

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Built with [Deno](https://deno.land/).
- Inspired by functional programming principles.

---

