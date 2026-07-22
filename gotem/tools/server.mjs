import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const root = join(process.cwd(), "public");
const port = Number(process.env.PORT || 4179);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".webm": "video/webm",
  ".webp": "image/webp"
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
    const relativePath = normalize(pathname).replace(/^[/\\]+/, "");
    let filePath = join(root, relativePath || "index.html");

    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    let fileStats = await stat(filePath);
    if (fileStats.isDirectory()) {
      filePath = join(filePath, "index.html");
      fileStats = await stat(filePath);
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": fileStats.size,
      "Cache-Control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`gotem is running at http://127.0.0.1:${port}`);
});
