import { cleanEnv, num, str } from "envalid";

export function validateEnv(env: Record<string, any>) {
  return cleanEnv(env, {
    port: num(),
    env: str({ choices: ["development", "production"] }),
    publicDir: str(),
    shutdownTimeout: num(),
  });
}