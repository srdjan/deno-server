// lib/server.ts
// app.ts
import {
  Route,
  Middleware,
  run,
  get,
  post,
  patch,
  del,
  json,
  addMiddleware
} from "./lib/server.ts";

// Types
type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
};

// Simple in-memory store
const todos = new Map<string, Todo>();

// Middleware
const requestLogger: Middleware = async (req, next) => {
  const start = Date.now();
  const response = await next(req);
  console.log(`${req.method} ${req.url} - ${response.status} ${Date.now() - start}ms`);
  return response;
};

const auth: Middleware = async (req, next) => {
  const token = req.headers.get("Authorization");
  if (!token) {
    return json({ error: "Unauthorized" }, 401);
  }
  return next(req);
};

// Common middleware stacks
const baseMiddleware = [requestLogger];
const protectedMiddleware = [requestLogger, auth];

// Routes
const routes: Route[] = [
  get("/api/todos", (req) => {
    const items = Array.from(todos.values());
    return json(items);
  }),

  get(new RegExp("^/api/todos/[\\w-]+$"), (req) => {
    const id = new URL(req.url).pathname.split('/')[3];
    const todo = todos.get(id);

    return todo
      ? json(todo)
      : json({ error: "Not found" }, 404);
  }),

  post("/api/todos", async (req) => {
    const body = await req.json();

    if (!body.title || typeof body.title !== 'string') {
      return json({ error: "Invalid title" }, 400);
    }

    const todo: Todo = {
      id: crypto.randomUUID(),
      title: body.title,
      completed: false,
      createdAt: new Date().toISOString()
    };

    todos.set(todo.id, todo);
    return json(todo, 201);
  }),

  patch(new RegExp("^/api/todos/[\\w-]+$"), async (req) => {
    const id = new URL(req.url).pathname.split('/')[3];
    const todo = todos.get(id);

    if (!todo) {
      return json({ error: "Not found" }, 404);
    }

    const body = await req.json();
    const updated = {
      ...todo,
      ...('title' in body ? { title: body.title } : {}),
      ...('completed' in body ? { completed: !!body.completed } : {})
    };

    todos.set(id, updated);
    return json(updated);
  }),

  del(new RegExp("^/api/todos/[\\w-]+$"), (req) => {
    const id = new URL(req.url).pathname.split('/')[3];
    const deleted = todos.delete(id);

    return deleted
      ? json({ message: "Deleted" })
      : json({ error: "Not found" }, 404);
  })
];

// Apply middleware to routes
const routesWithMiddleware = routes.map(route =>
  route.method === 'GET'
    ? addMiddleware(route, baseMiddleware)
    : addMiddleware(route, protectedMiddleware)
);

// Start server
run(routesWithMiddleware);

// lib/middleware.ts
export const requestLogger: Middleware = async (req, next) => {
  const start = Date.now();
  const response = await next(req);
  const duration = Date.now() - start;

  console.log(
    `${req.method} ${new URL(req.url).pathname} - ${response.status} (${duration}ms)`
  );

  return response;
};

export const cors = (origins: string[]): Middleware => {
  return async (req, next) => {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": origins.join(", "),
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }

    const response = await next(req);
    response.headers.set("Access-Control-Allow-Origin", origins.join(", "));
    return response;
  };
};

export const queryParser: Middleware = async (req, next) => {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams);
  // Attach query to Request object through custom property
  Object.defineProperty(req, 'query', { value: query, writable: false });
  return next(req);
};

// types.ts
type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
};

// Extend Request to include our custom properties
declare global {
  interface Request {
    query?: Record<string, string>;
  }
}

// app.ts
import { run, Route, json } from "../lib/server.ts";
import { requestLogger, cors, queryParser } from "../lib/middleware.ts";

// Global middleware applied to all routes
const globalMiddleware = [
  requestLogger,
  cors(["http://localhost:3000"]),
  queryParser
];

// Response helpers
const badRequest = (message: string) => json({ error: message }, 400);
const notFound = (message: string) => json({ error: message }, 404);

// Example route-specific middleware
const validateAuth: Middleware = async (req, next) => {
  const token = req.headers.get("Authorization");
  if (!token) {
    return json({ error: "Unauthorized" }, 401);
  }
  return next(req);
};

const rateLimiter = (limit: number, window: number): Middleware => {
  const requests = new Map<string, number[]>();

  return async (req, next) => {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const now = Date.now();

    const userRequests = requests.get(ip) || [];
    const recentRequests = userRequests.filter(time => now - time < window);

    if (recentRequests.length >= limit) {
      return json({ error: "Too many requests" }, 429);
    }

    recentRequests.push(now);
    requests.set(ip, recentRequests);

    return next(req);
  };
};

const routes: Route[] = [
  {
    path: "/api/todos",
    method: "GET",
    handler: (req) => {
      // Access query parameters
      const { completed, search } = req.query || {};

      let todos = db.list();

      // Filter by completion status
      if (completed !== undefined) {
        todos = todos.filter(todo =>
          todo.completed === (completed === "true")
        );
      }

      // Filter by search term
      if (search) {
        todos = todos.filter(todo =>
          todo.title.toLowerCase().includes(search.toLowerCase())
        );
      }

      return json(todos);
    },
    middleware: [...globalMiddleware]
  },

  {
    path: "/api/todos",
    method: "POST",
    handler: async (req) => {
      const body = await req.json().catch(() => null);
      const input = validateCreateTodo(body);

      if (!input) {
        return badRequest("Invalid todo data");
      }

      const todo = db.create(input);
      return json(todo, 201);
    },
    middleware: [
      ...globalMiddleware,
      validateAuth,
      rateLimiter(10, 60000) // 10 requests per minute
    ]
  },

  {
    path: new RegExp("^/api/todos/[\\w-]+$"),
    method: "GET",
    handler: (req) => {
      const id = new URL(req.url).pathname.split('/')[3];
      const todo = db.get(id);

      return todo
        ? json(todo)
        : notFound(`Todo ${id} not found`);
    },
    middleware: [...globalMiddleware]
  }
];

// Start server
run(routes);

/*
Example Usage with Query Parameters:

# List all todos
curl http://localhost:8000/api/todos

# List completed todos
curl http://localhost:8000/api/todos?completed=true

# Search todos
curl http://localhost:8000/api/todos?search=typescript

# Combined filters
curl http://localhost:8000/api/todos?completed=true&search=typescript

# Create todo with auth
curl -X POST http://localhost:8000/api/todos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token" \
  -d '{"title": "Learn TypeScript"}'
*/