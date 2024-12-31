import { Context } from "./deps.ts";

// Define the RequestHandler type
export type RequestHandler = (req: Request, context: Context<void>) => Response | Promise<Response>;

// Define the Middleware type
export type Middleware = (handler: RequestHandler) => RequestHandler;

// Define the Route type
export type Route = {
  path: string | RegExp;
  method: string;
  handler: RequestHandler;
  params?: string[];
};