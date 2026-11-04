import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR as DIR } from "./paths";

const MAX_BYTES = 4 * 1024 * 1024;
const NAME = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

/** El tipo se decide por los primeros bytes del archivo, no por lo que diga el navegador. */
function imageType(bytes: Buffer): { ext: string; mime: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: "png", mime: "image/png" };
  }
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

export async function savePhoto(file: File): Promise<{ name: string } | { error: string }> {
  if (file.size > MAX_BYTES) return { error: "La foto pesa demasiado. Prueba con otra." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type) return { error: "Ese archivo no es una foto (usa JPG, PNG o WebP)." };
  const name = `${randomBytes(16).toString("hex")}.${type.ext}`;
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, name), bytes);
  return { name };
}

export async function readPhoto(name: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!NAME.test(name)) return null;
  try {
    const bytes = await fs.readFile(path.join(DIR, name));
    const type = imageType(bytes);
    return type ? { bytes, mime: type.mime } : null;
  } catch {
    return null;
  }
}

export async function deletePhoto(name: string) {
  if (NAME.test(name)) await fs.rm(path.join(DIR, name), { force: true });
}
