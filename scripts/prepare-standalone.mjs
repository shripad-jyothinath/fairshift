/**
 * Next's standalone server does not copy static assets by itself.
 * This runs after `next build` so `npm start` works the same way it does in
 * the Cloud Run image.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(standalone)) {
  console.warn("No standalone output found; skipping copy.");
  process.exit(0);
}

fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), {
  recursive: true,
});
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});

console.log("Standalone assets copied.");
