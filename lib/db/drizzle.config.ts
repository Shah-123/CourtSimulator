import { defineConfig } from "drizzle-kit";
import path from "path";

const dir = typeof import.meta !== "undefined" && import.meta.dirname ? import.meta.dirname : process.cwd();
const possibleEnvPaths = [
  path.resolve(dir, "../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  ".env",
];

for (const envPath of possibleEnvPaths) {
  try {
    process.loadEnvFile(envPath);
    if (process.env.DATABASE_URL) break;
  } catch {}
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
