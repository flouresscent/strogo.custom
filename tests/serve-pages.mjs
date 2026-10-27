import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const root = resolve("dist");
const prefix = "/strogo.custom/";
const port = Number(process.env.PAGES_TEST_PORT || 4174);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
};

createServer(async (request, response) => {
  const notFound = () => {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
  };
  try {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", "http://localhost").pathname,
    );
    if (pathname === prefix.slice(0, -1)) {
      response.writeHead(308, { Location: prefix });
      response.end();
      return;
    }
    if (!pathname.startsWith(prefix)) {
      notFound();
      return;
    }
    let file = resolve(root, "." + pathname.slice(prefix.length - 1));
    if (file !== root && !file.startsWith(root + sep)) {
      notFound();
      return;
    }
    const info = await stat(file);
    if (info.isDirectory()) {
      if (!pathname.endsWith("/")) {
        response.writeHead(308, { Location: pathname + "/" });
        response.end();
        return;
      }
      file = resolve(file, "index.html");
    }
    const entry = await stat(file);
    if (!entry.isFile()) {
      notFound();
      return;
    }
    const extension = file.slice(file.lastIndexOf("."));
    response.writeHead(200, {
      "Content-Type": mime[extension] || "application/octet-stream",
      "Content-Length": entry.size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["ENOENT", "ENOTDIR"].includes(error.code)
    ) {
      notFound();
      return;
    }
    response.writeHead(500);
    response.end("Static server error");
  }
}).listen(port, "127.0.0.1", () =>
  process.stdout.write(
    `Strict Pages fixture: http://127.0.0.1:${port}${prefix}\n`,
  ),
);
