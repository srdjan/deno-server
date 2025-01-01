import { run, Route, createResponse } from "../../lib/server.ts";

const routes: Route[] = [
  {
    path: "/",
    method: "GET",
    handler: () => createResponse(new Response("Hello, World!", { status: 200 })),
  },
  {
    path: "/about",
    method: "GET",
    handler: () => createResponse(new Response("About page", { status: 200 })),
  },
];

run(routes);