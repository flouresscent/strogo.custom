import { mkdir, readFile, writeFile } from "node:fs/promises";

// GitHub Pages has no SPA rewrite rule. Real index files keep direct links/refreshes HTTP 200.
const html = await readFile(
  new URL("../dist/index.html", import.meta.url),
  "utf8",
);
for (const route of ["custom", "custom/create"]) {
  const directory = new URL(`../dist/${route}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("index.html", directory), html);
}
await writeFile(new URL("../dist/.nojekyll", import.meta.url), "");
