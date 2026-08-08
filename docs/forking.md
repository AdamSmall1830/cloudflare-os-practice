# Fork it and make it your practice

This repo is one firm's Cloudflare OS delivery practice. Fork it, and in under an hour of
edits it becomes *yours*. Everything below is a one-time pass; nothing else in the codebase
assumes our identity.

## 0. Sanity check the fork

```bash
git clone <your-fork-url>
cd cloudflare-os-practice
pnpm install
pnpm check                                # all packages build, full test suite passes
pnpm scaffold examples/hq-export.json     # CLI works end-to-end → out/…
```

GitHub Actions CI runs on forks automatically (`.github/workflows/ci.yml`) — no tokens or
secrets needed for it.

## 1. Make the HQ record yours

The preloaded "our firm" engagement lives in **two places** (see the duplication note in the
root README):

- **Canonical:** [`packages/core/src/seed.ts`](../packages/core/src/seed.ts) → `hqClient()` —
  firm name, principal/approver names, systems (we run GoHighLevel; swap `"ghl"` for your CRM's
  id), interview/inbox seed data, and the starter use cases in
  [`catalogs.ts`](../packages/core/src/catalogs.ts) under the `agency` vertical.
  Run `pnpm check` after editing — the tests that pin seed behavior will tell you if you broke
  the shape (update the expected values in `packages/core/test/` to your numbers, e.g. the
  hours/month anchor).
- **The Studio's inline copy:** search `studio/index.html` for `hqClient` and mirror the same
  edits (or simply rename/edit the record in the running app — the seed only creates the
  *initial* record; in-app edits win from then on).

Then regenerate the example fixture so it matches your seed:

```bash
pnpm build
node --input-type=module -e "import{hqClient}from'./packages/core/dist/index.js';import{writeFileSync}from'node:fs';const c=hqClient();c.domain='example-firm.com';writeFileSync('examples/hq-export.json',JSON.stringify({client:c},null,2)+'\n')"
```

## 2. Rebrand the documents

- **Playbook** (`playbook/index.html`): Section 09's pricing bands and the packaging table are
  *our placeholders* — set your own. The visual identity (colors/typography) is defined in the
  `<style>` block's CSS custom properties at the top of each file.
- **Studio** (`studio/index.html`): same token block if you want your palette; the app title is
  in the `<title>` and the header.
- Replace the "Published (internal) artifact copies" links in the root README — those point at
  our private claude.ai artifacts, which your accounts can't open. Host your own copies (see §4)
  or delete the line.

## 3. Point the infrastructure at you

- [`workers/ai-proxy/wrangler.jsonc`](../workers/ai-proxy/wrangler.jsonc): set
  `ALLOWED_ORIGIN` to wherever you host the Studio; deploy and set the
  `ANTHROPIC_API_KEY` secret (see that package's README). Put Cloudflare Access in front.
- [`docs/getting-started.md`](getting-started.md): swap the clone URL for your fork's.

## 4. Host your Studio

Pick one:

- **Cloudflare Pages** (recommended — you're selling Cloudflare, dogfood it): create a Pages
  project from your fork, no build command, output directory `/`. Your Studio is at
  `https://<project>.pages.dev/studio/` — put Access in front. This also unlocks the AI
  endpoint mode.
- **GitHub Pages**: repo Settings → Pages → deploy from `main` / root. Public to the world —
  fine for the app (data stays in each visitor's browser), but remember the playbook with your
  pricing is served too.
- **Nothing**: open `studio/index.html` from disk. Everything but the AI endpoint mode works.

## 5. Keep pulling upstream improvements (optional)

```bash
git remote add upstream https://github.com/AdamSmall1830/cloudflare-os-practice.git
git fetch upstream
git merge upstream/main
```

Your seed/branding edits live in a handful of files, so merges stay small.

## What you're inheriting — the honest ledger

- **Works out of the box:** the Studio (all three tabs, both AI-assist modes), the typed engine
  with its tests, the scaffold CLI, CI, and the docs.
- **Scaffolds, not products:** generated gatekeeper files and `deployment.jsonc` target the
  [cloudflare-os-starter](https://github.com/cloudflare/cloudflare-os-starter) *template* and
  must be reconciled against the pinned Cloudflare OS release you adopt — upstream is
  early-access and moving. The build guide's portal click-paths were verified August 2026.
- **Not included:** real gatekeeper implementations (GoHighLevel, QuickBooks, Stripe…) — those
  are the practice's ongoing build (see "Where this is headed" in the root README), and the
  Cloudflare OS deployment itself, which the Build Guide walks you through creating in your own
  Cloudflare account.
