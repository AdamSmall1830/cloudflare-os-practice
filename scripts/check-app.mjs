// CI guard for the parts `tsc` can't see: the two single-file HTML apps, the
// example fixture, and a set of core↔Studio mirror invariants. Run from the
// repo root AFTER `pnpm -r build` (it imports the built core).
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const problems = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
function must(cond, msg) {
  if (cond) ok(msg);
  else problems.push(msg);
}

const BALANCED_TAGS = [
  "div", "section", "article", "table", "thead", "tbody", "tr", "td", "th",
  "ul", "ol", "li", "p", "h1", "h2", "h3", "h4", "span", "button", "select",
  "option", "label", "header", "nav", "main", "details", "summary", "footer",
  "pre", "strong", "em", "code", "a", "textarea",
];

function checkTagBalance(file, html) {
  for (const t of BALANCED_TAGS) {
    const open = (html.match(new RegExp(`<${t}[\\s>]`, "g")) ?? []).length;
    const close = (html.match(new RegExp(`</${t}>`, "g")) ?? []).length;
    must(open === close, `${file}: <${t}> balanced (${open}/${close})`);
  }
}
function checkAnchors(file, html) {
  const ids = new Set([...html.matchAll(/id="([a-z-]+)"/g)].map((m) => m[1]));
  for (const [, href] of html.matchAll(/href="#([a-z-]+)"/g)) {
    must(ids.has(href), `${file}: anchor #${href} resolves`);
  }
}

console.log("• Studio inline script parses");
const studio = readFileSync("studio/index.html", "utf8");
const script = studio.match(/<script>([\s\S]*)<\/script>/)?.[1];
must(!!script, "studio/index.html has a <script> block");
if (script) {
  const tmp = "scripts/.studio-check.tmp.js";
  writeFileSync(tmp, script);
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
    ok("studio JS is syntactically valid");
  } catch (e) {
    problems.push(`studio JS failed node --check: ${String(e).split("\n")[0]}`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

console.log("• HTML structure (both apps)");
checkTagBalance("studio/index.html", studio);
const playbook = readFileSync("playbook/index.html", "utf8");
checkTagBalance("playbook/index.html", playbook);
checkAnchors("playbook/index.html", playbook);

console.log("• Fixture in sync with hqClient()");
const core = await import(new URL("../packages/core/dist/index.js", import.meta.url));
const c = core.hqClient();
c.domain = "example-firm.com";
const want = JSON.stringify({ client: c }, null, 2) + "\n";
const have = readFileSync("examples/hq-export.json", "utf8");
must(want === have, "examples/hq-export.json matches hqClient() (regen recipe: docs/forking.md §1)");

console.log("• Core↔Studio mirror pins (canonical strings must appear in the Studio)");
// These are the shared-behavior anchors the quality review found drifting. If a
// core behavior changes, its string changes and this fails until the Studio is
// updated to match — enforcing the repo's #1 rule in CI.
const MIRROR_PINS = [
  ["approver regex", "/refund|payment|invoice|bill|reconcil/"],
  ["approverForUseCase helper", "function approverForUseCase("],
  ["effectiveDailyLimit helper", "function effectiveDailyLimit("],
  ["normalize boundary", "function normalizeClient("],
  ["AI evidence schema", '"evidence":"short quote/pointer from the corpus"'],
  ["two-pass critique prompt", "function aiCritiquePrompt("],
  ["slug trailing-hyphen re-strip", '.slice(0,24).replace(/-+$/,"")'],
  ["compliance framework map (HIPAA)", "HIPAA (45 CFR Parts 160 & 164)"],
];
for (const [label, needle] of MIRROR_PINS) {
  must(studio.includes(needle), `Studio contains the ${label}`);
}

if (problems.length) {
  console.error("\nAPP CHECK FAILED:");
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log("\napp checks passed.");
