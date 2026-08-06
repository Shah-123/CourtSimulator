import path from "path";
import OpenAI from "openai";

const dir = typeof import.meta !== "undefined" && import.meta.dirname ? import.meta.dirname : process.cwd();
const possibleEnvPaths = [
  path.resolve(dir, "../../../.env"),
  path.resolve(dir, "../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  ".env",
];

for (const envPath of possibleEnvPaths) {
  try {
    process.loadEnvFile(envPath);
    if (process.env.OPENAI_API_KEY) break;
  } catch {}
}

const apiKey = process.env.OPENAI_API_KEY || "dummy-key-set-your-openai-api-key-in-env";

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is not set in .env. AI generation features will require a valid key.");
}

export const openai = new OpenAI({
  apiKey,
});

