import { rmSync } from "node:fs";

rmSync(new URL("../package-lock.json", import.meta.url), { force: true });
rmSync(new URL("../yarn.lock", import.meta.url), { force: true });

if (!process.env.npm_config_user_agent?.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
