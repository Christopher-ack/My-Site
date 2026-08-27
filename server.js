#!/usr/bin/env node
/* =========================================================
   A static server that also accepts writes.

   json-server serves this folder read-only: a PUT to a file
   comes back 200 with the file's contents and nothing is
   written. The pages here save by PUTting the whole JSON
   file back, so that combination fails silently.

   This serves the same folder and actually writes on PUT.
   No dependencies — plain Node.

     node server.js            → http://localhost:3000
     node server.js 4000       → a different port
   ========================================================= */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PORT = Number(process.argv[2]) || 3000;

/* Only these may be written. Anything else is read-only, so a
   stray request can't overwrite a page or a script. */
const WRITABLE = /^[A-Za-z0-9._-]+\.json$/;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".txt":  "text/plain; charset=utf-8",
  ".md":   "text/markdown; charset=utf-8"
};

function send(res, code, body, type) {
  res.writeHead(code, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

/* Keep every request inside this folder. */
function resolveSafe(urlPath) {
  const rel = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const full = path.resolve(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  const file = resolveSafe(req.url);
  if (!file) return send(res, 403, "Forbidden");

  const name = path.basename(file);

  /* ---- Write ---- */
  if (req.method === "PUT" || req.method === "POST") {
    if (!WRITABLE.test(name)) {
      return send(res, 405, "Only .json files in this folder can be written");
    }

    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {      /* write-ups carry base64 images */
        req.destroy();
      }
    });
    req.on("end", () => {
      /* Refuse to write anything that isn't valid JSON — a half-sent
         body should not be allowed to flatten a good file. */
      try {
        JSON.parse(body);
      } catch (e) {
        return send(res, 400, "Not valid JSON — nothing written");
      }

      /* Write beside the target, then rename: an interrupted write
         leaves the original file intact. */
      const tmp = file + ".tmp-" + process.pid;
      try {
        fs.writeFileSync(tmp, body);
        fs.renameSync(tmp, file);
      } catch (e) {
        try { fs.unlinkSync(tmp); } catch (e2) {}
        return send(res, 500, "Couldn't write " + name + ": " + e.message);
      }

      console.log(new Date().toLocaleTimeString() + "  wrote " + name +
                  "  (" + Buffer.byteLength(body) + " bytes)");
      send(res, 200, JSON.stringify({ ok: true, file: name, bytes: Buffer.byteLength(body) }),
           "application/json; charset=utf-8");
    });
    return;
  }

  /* ---- Read ---- */
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed");
  }

  fs.stat(file, (err, stat) => {
    let target = file;
    if (!err && stat.isDirectory()) target = path.join(file, "index.html");

    fs.readFile(target, (err2, data) => {
      if (err2) return send(res, 404, "Not found: " + path.relative(ROOT, target));
      const type = TYPES[path.extname(target).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "no-store"
      });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
});

/* If the port is taken — usually an older copy of this server still
   running — step up and try the next one rather than dying with a
   stack trace. */
let attempts = 0;

server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && attempts < 20) {
    attempts++;
    console.log("  Port " + (PORT + attempts - 1) + " is busy, trying " + (PORT + attempts) + "\u2026");
    server.listen(PORT + attempts);
    return;
  }
  console.log("");
  console.log("  Couldn't start: " + err.message);
  console.log("");
  process.exit(1);
});

server.listen(PORT, () => {
  const port = server.address().port;
  const url = "http://localhost:" + port;

  console.log("");
  console.log("  Serving " + ROOT);
  console.log("");
  console.log("  ==> " + url);
  console.log("");
  console.log("  Leave this window open. Closing it stops the site.");
  console.log("  Press Ctrl-C to stop.");
  console.log("");

  /* Hand the address to the launcher so it can open a browser. */
  if (process.env.PRINT_URL_FILE) {
    try { fs.writeFileSync(process.env.PRINT_URL_FILE, url); } catch (e) {}
  }
});
