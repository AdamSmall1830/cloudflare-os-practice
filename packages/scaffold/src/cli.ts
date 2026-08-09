#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { blankClient, slug, type ClientRecord } from "@cfos-practice/core";
import { generateFiles } from "./generate.js";

function usage(): never {
  console.error(`Usage: cfos-scaffold <studio-export.json> [-o <out-dir>]

Reads a Cloudflare OS Studio client export ({"client": {...}} or a bare
client record) and writes the starter-repo seed: deployment.jsonc, SETUP.md,
gatekeeper scaffolds, and skill seeds.

Default out-dir: ./out/<client-slug>`);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "-h" || args[0] === "--help") usage();

const inputPath = args[0]!;
let outDir: string | undefined;
const oIdx = args.indexOf("-o");
if (oIdx >= 0) {
  outDir = args[oIdx + 1];
  if (!outDir) usage();
}

// Reject unrecognized flags rather than silently ignoring them (e.g. --out).
const consumed = new Set([inputPath, ...(oIdx >= 0 ? [args[oIdx], args[oIdx + 1]] : [])]);
const unknownFlag = args.find((a) => a.startsWith("-") && !consumed.has(a));
if (unknownFlag) {
  console.error(`Unknown option: ${unknownFlag}`);
  usage();
}

let parsed: unknown;
try {
  parsed = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
} catch (e) {
  console.error(`Could not read/parse ${inputPath}: ${(e as Error).message}`);
  process.exit(1);
}

const raw = ((parsed as { client?: unknown }).client ?? parsed) as Partial<ClientRecord>;
if (!raw || typeof raw.name !== "string" || !Array.isArray(raw.useCases)) {
  console.error("Input does not look like a Studio client export (missing name/useCases).");
  process.exit(1);
}
// Normalize through the canonical defaults so a hand-written or partial record
// missing systems/approvers/knowledge doesn't crash the generators.
const client: ClientRecord = { ...blankClient(raw.name), ...raw };
client.approvers = { ...blankClient(raw.name).approvers, ...(raw.approvers ?? {}) };

const root = resolve(outDir ?? join("out", slug(client.name)));
const files = generateFiles(client);
for (const f of files) {
  const p = join(root, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.content, "utf8");
  console.log(`wrote ${p}`);
}
console.log(`\n${files.length} files → ${root}`);
console.log("Next: clone cloudflare/cloudflare-os-starter and copy these in (see SETUP.md).");
