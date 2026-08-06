import path from "path";
import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

const dir = typeof import.meta !== "undefined" && import.meta.dirname ? import.meta.dirname : process.cwd();
const possibleEnvPaths = [
  path.resolve(dir, "../../../../.env"),
  path.resolve(dir, "../../../.env"),
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

export const openai = new OpenAI({
  apiKey,
});


export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    size,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await openai.images.edit({
    model: "dall-e-3",
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
