#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { slug, type ClientRecord } from "@cfos-practice/core";
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

let parsed: unknown;
try {
  parsed = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
} catch (e) {
  console.error(`Could not read/parse ${inputPath}: ${(e as Error).message}`);
  process.exit(1);
}

const client = ((parsed as { client?: unknown }).client ?? parsed) as ClientRecord;
if (!client || typeof client.name !== "string" || !Array.isArray(client.useCases)) {
  console.error("Input does not look like a Studio client export (missing name/useCases).");
  process.exit(1);
}

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
