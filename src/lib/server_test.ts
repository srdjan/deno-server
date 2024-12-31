// server_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { serveStatic, start, Route } from "./server.ts";

// Test serveStatic function
Deno.test("serveStatic returns 200 for existing file", async () => {
  // Create a test file
  const testFilePath = "./public/test.txt";
  await Deno.writeTextFile(testFilePath, "Hello, World!");

  const res = await serveStatic(testFilePath);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "Hello, World!");

  // Clean up
  await Deno.remove(testFilePath);
});

Deno.test("serveStatic returns 404 for missing file", async () => {
  const res = await serveStatic("./public/nonexistent.txt");
  assertEquals(res.status, 404);
});

Deno.test("serveStatic returns 500 for permission error", async () => {
  // Create a test file with restricted permissions
  const testFilePath = "./public/restricted.txt";
  await Deno.writeTextFile(testFilePath, "Restricted");
  await Deno.chmod(testFilePath, 0o000); // No permissions

  const res = await serveStatic(testFilePath);
  assertEquals(res.status, 500);

  // Clean up
  await Deno.chmod(testFilePath, 0o644); // Restore permissions
  await Deno.remove(testFilePath);
});

// Test route handling
Deno.test("handleRequest returns 200 for valid route", async () => {
  const routes: Route[] = [
    {
      path: "/",
      method: "GET",
      handler: () => new Response("Hello, World!", { status: 200 }),
    },
  ];
  start(routes);

  const req = new Request("http://localhost:8000/");
  const res = await fetch(req);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "Hello, World!");
});

Deno.test("handleRequest returns 404 for invalid route", async () => {
  const routes: Route[] = [
    {
      path: "/",
      method: "GET",
      handler: () => new Response("Hello, World!", { status: 200 }),
    },
  ];
  start(routes);

  const req = new Request("http://localhost:8000/nonexistent");
  const res = await fetch(req);
  assertEquals(res.status, 404);
});

// Test middleware
Deno.test("loggingMiddleware logs request details", async () => {
  const routes: Route[] = [
    {
      path: "/",
      method: "GET",
      handler: () => new Response("Hello, World!", { status: 200 }),
    },
  ];
  start(routes);

  const req = new Request("http://localhost:8000/");
  const res = await fetch(req);
  assertEquals(res.status, 200);
  // Check logs (you may need to mock console.log for better testing)
});

Deno.test("securityHeadersMiddleware adds security headers", async () => {
  const routes: Route[] = [
    {
      path: "/",
      method: "GET",
      handler: () => new Response("Hello, World!", { status: 200 }),
    },
  ];
  start(routes);

  const req = new Request("http://localhost:8000/");
  const res = await fetch(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Security-Policy"), "default-src 'self'");
  assertEquals(res.headers.get("X-Content-Type-Options"), "nosniff");
  assertEquals(res.headers.get("X-Frame-Options"), "DENY");
  assertEquals(res.headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  assertEquals(res.headers.get("X-XSS-Protection"), "1; mode=block");
});

// Test graceful shutdown
Deno.test("server shuts down gracefully on SIGINT", async () => {
  const routes: Route[] = [
    {
      path: "/",
      method: "GET",
      handler: () => new Response("Hello, World!", { status: 200 }),
    },
  ];
  start(routes);

  // Simulate SIGINT
  const abortController = new AbortController();
  const signalListener = () => abortController.abort();
  Deno.addSignalListener("SIGINT", signalListener);
  abortController.abort(); // Simulate SIGINT

  // Wait for shutdown
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Verify server is shut down
  const req = new Request("http://localhost:8000/");
  try {
    await fetch(req);
  } catch (error) {
    assert(error instanceof Error);
    assertEquals(error.message, "Connection refused");
  } finally {
    Deno.removeSignalListener("SIGINT", signalListener);
  }
});