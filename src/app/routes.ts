import { Route, serveStatic, start } from "../lib/server.ts";

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