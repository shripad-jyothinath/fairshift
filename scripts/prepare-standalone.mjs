/**
 * Next's standalone server does not copy static assets by itself.
 * This runs after `next build` so `npm start` works the same way it does in
 * the Cloud Run image.
 */
import fs from "node:fs";
import path from "node:path";

// Vercel serverless builds handle assets automatically; standalone copy is unnecessary
if (process.env.VERCEL) {
  console.log("Vercel environment detected; skipping standalone copy.");
  process.exit(0);
}

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(standalone)) {
  console.warn("No standalone output found; skipping copy.");
  process.exit(0);
}

const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standalone, "public"), {
    recursive: true,
  });
}

const staticDir = path.join(root, ".next", "static");
if (fs.existsSync(staticDir)) {
  fs.cpSync(staticDir, path.join(standalone, ".next", "static"), {
    recursive: true,
  });
}

console.log("Standalone assets copied.");
