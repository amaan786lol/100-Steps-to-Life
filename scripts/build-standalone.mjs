/**
 * Fold the production client build into one self-contained HTML file.
 *
 *   pnpm build && pnpm build:standalone   ->  dist/hundred-steps-standalone.html
 *
 * The result runs from a file:// URL or any static host with no server, no
 * network and no separate asset files: the stylesheet, the script bundle and
 * every image in public/media are inlined. The course is local-first, so the
 * whole hundred days work this way; only sign-in and journal backup need the
 * real server, and those are answered as "signed out" here.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { extname, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist", "public");
const out = join(root, "dist", "hundred-steps-standalone.html");

if (!existsSync(join(dist, "index.html"))) {
  console.error("No client build found. Run `pnpm build` first.");
  process.exit(1);
}

const MIME = {
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Every file in media/, as a data URI keyed by the path the app requests.
const media = {};
for (const file of readdirSync(join(dist, "media"))) {
  const type = MIME[extname(file)];
  if (!type) continue;
  media[`/media/${file}`] = `data:${type};base64,${readFileSync(join(dist, "media", file)).toString("base64")}`;
}

// split/join, not replace(): the minified bundle contains `$&`, which a string
// replacement would expand into the matched text and corrupt the script.
const inlineMedia = (source) => {
  let result = source;
  for (const [path, uri] of Object.entries(media)) result = result.split(path).join(uri);
  return result;
};

const assets = readdirSync(join(dist, "assets"));
const jsName = assets.find((file) => file.endsWith(".js"));
const cssName = assets.find((file) => file.endsWith(".css"));

const css = inlineMedia(readFileSync(join(dist, "assets", cssName), "utf8"));
// `</script` inside the bundle would close the inline tag early.
const js = inlineMedia(readFileSync(join(dist, "assets", jsName), "utf8")).split("</script").join("<\\/script");

let html = inlineMedia(readFileSync(join(dist, "index.html"), "utf8"));

// Nothing to register a service worker against, no manifest to install from,
// and no analytics endpoint.
html = html.replace(/<script[^>]*src="%VITE_ANALYTICS_ENDPOINT%[^"]*"[^>]*><\/script>/g, "");
html = html.replace(/<script>\s*if\s*\("serviceWorker"[\s\S]*?<\/script>/g, "");
html = html.replace(/<link rel="manifest"[^>]*>/g, "");

// With no server behind it, every /api call would reject and log. Answer them
// as signed out — the state the local-first journal is built to run in.
const offlineShim = `<script>
(function () {
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf("/api/") !== -1) {
      return Promise.resolve(
        new Response(JSON.stringify([{ result: { data: { json: null } } }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
    return realFetch(input, init);
  };
})();
</script>`;

html = html.replace(/<link rel="stylesheet"[^>]*href="\/assets\/[^"]+"[^>]*>/, () => `<style>${css}</style>`);
html = html.replace(
  /<script type="module"[^>]*src="\/assets\/[^"]+"><\/script>/,
  () => `${offlineShim}<script type="module">${js}</script>`,
);

// --artifact emits the page contents only, for hosts that supply their own
// <!doctype>/<head>/<body> skeleton.
const asArtifact = process.argv.includes("--artifact");
if (asArtifact) {
  html = html
    .replace(/^[\s\S]*?<head>/, "")
    .replace(/<\/head>\s*<body>/, "")
    .replace(/<\/body>\s*<\/html>\s*$/, "")
    .trim();
}

const target = asArtifact ? join(root, "dist", "hundred-steps-artifact.html") : out;
writeFileSync(target, html);

const unresolved = [...html.matchAll(/(?:src|href|url\()["']?(\/(?:media|assets)\/[^"')\s]+)/g)].map((m) => m[1]);
console.log(`wrote dist/${target.split("/").pop()} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(`inlined ${Object.keys(media).length} media files, ${jsName}, ${cssName}`);
if (unresolved.length) {
  console.error("unresolved local references:", [...new Set(unresolved)]);
  process.exit(1);
}
