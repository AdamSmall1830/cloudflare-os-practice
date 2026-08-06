# Cloudflare OS Studio — user guide

The Studio is the vendor cockpit for a Cloudflare OS engagement: capture discovery in tab 1, and tabs 2–3 generate themselves from it. Nothing is ever "submitted" — every field saves as you type, and the generated tabs recompute on every visit.

## The header

| Control | What it does |
|---|---|
| **Client dropdown** | Switches the active engagement. Everything below the tabs belongs to the selected client. |
| **+ New client** | Creates a blank engagement (prompts for a name). |
| **Export** | Downloads the active client as `cfos-<name>.json`. This is your backup *and* the input to the `cfos-scaffold` CLI. |
| **Import** | Restores a previously exported client (added alongside existing ones, never overwriting). |
| **Delete** | Permanently removes the active client (confirmation required; the last remaining client can't be deleted). |

**Where data lives:** in the browser's `localStorage`, per origin. It survives reloads and restarts on the same machine/browser, but does not sync anywhere. Export regularly; treat the JSON files as the engagement's record of truth.

**First run:** the app seeds one record, **"Our Firm — Cloudflare OS HQ"**, pre-filled to represent the firm itself — so your first Build Guide is the one that stands up your own deployment. A dismissible "How this works" card explains the flow in-app.

---

## Tab 1 · Discovery

Work top to bottom. Every card feeds the generators.

### Client profile
Drives everything downstream — fill it first.

- **Client name** → titles, slugs, worker names, filenames.
- **Vertical** → which line-of-business systems appear in the inventory, which starter use cases seed, and which guardrails land in the policy matrix. "AI implementation agency (our firm)" is the HQ vertical.
- **Company domain** → the deployment hostnames (`os.<domain>`, `os-staging.<domain>`) and every OAuth redirect URI in the Build Guide. Until set, the guide shows `os.CLIENT-DOMAIN.com` placeholders and a warning.
- **Domain already on Cloudflare?** → switches the DNS step between "nothing to migrate" and full nameserver-move instructions.
- **Sign-in method** → branches the Build Guide: Cloudflare Access + IdP (recommended), Google OAuth (small Workspace shops), or password (flagged as interim-only).
- **Model provider / daily LLM calls** → the AI Gateway step's env block (`DAILY_LLM_CALL_LIMIT`) and the model matrix in Design.
- **Approvers (payments / sends / records)** → threaded into the policy matrix, the gatekeeper scaffolds, and the pilot-readiness gate. Leave one empty and the guide shows "⚠ unset".

### Systems inventory
Check everything the client runs. Each system is pre-classified **stock** (ships with Cloudflare OS — config only) or **custom** (a gatekeeper we build), which drives the integration map, effort estimates, and which per-system setup steps appear in the Build Guide. Vertical-specific systems (EMR, DMS, ERP…) appear only for their vertical.

### Interviews
One entry per stakeholder, answering the ten discovery questions. Answers don't score anything directly — they are raw material for the AI assist and for your own use-case writing. Partial answers are fine.

### Magic inbox log
The evidence base: every routine-work item staff forward during the two-week capture window. Log the item, the department, and a frequency guess. Volume is the signal.

### Survey
A copy-ready email template (the ten questions + the forwarding-alias ask) to send to all staff; paste the aggregated themes back into the notes field, along with links to diagrams or other artifacts.

### Use-case register
The heart of discovery. Each row:

| Field | Meaning |
|---|---|
| Freq/wk × Min × People | How often × how long × how many people — multiplied out to **Hrs/mo** (× 4.33 weeks ÷ 60) |
| Feas 1–5 | API/data feasibility: 5 = clean API and verifiable output |
| Risk | **A** read-only · **B** write behind approval · **C** external side effects (never piloted) |
| Pilot | Tick to hand-pick the pilot charter; leave all unticked and Design auto-suggests the top 5 |

**Seed starter use cases** loads the vertical's proven winners (and auto-checks their systems) — edit the numbers to the client's reality.

### AI assist
Synthesizes the interviews, inbox, and survey notes into scored use-case suggestions. Two modes:

1. **Copy-paste (works everywhere, including the hosted artifact):** Copy AI prompt → run it in Claude → paste the JSON array back → Add suggestions. The importer strips markdown fences, clamps out-of-range numbers, drops duplicates and unknown system ids, and caps at 15 rows. Everything arrives unticked and editable — review the numbers.
2. **Direct endpoint (self-hosted Studio only):** point it at the deployed [ai-proxy Worker](../workers/ai-proxy/README.md) and generate in place. The hosted artifact copy cannot use this mode (sandbox blocks external calls) — the app says so rather than failing silently.

---

## Tab 2 · Design & Scope

Generated live; nothing here is edited directly — adjust Discovery and revisit.

- **Pilot charter** — your hand-picked pilots, or the auto-suggested top 5 (by value × feasibility, C-risk excluded). The **~N hours/month** total is the value anchor for pricing conversations.
- **Integration map** — every checked system with its gatekeeper type, build wave (1 stock/comms → 2 cross-industry custom → 3 line-of-business), and effort band.
- **Policy matrix** — each pilot workflow's risk tier mapped to its policy ("read-only", "write behind approval queue") and its named approver, plus the vertical's standing guardrails.
- **Model matrix & budgets** — task-class → model-tier routing with the daily allowance and budget controls.
- **Timeline** — computed from company size and custom-gatekeeper count (discovery compresses ≤30 employees; integration weeks scale at ~1.5×custom count).
- **Copy scope doc (Markdown)** — the whole design as a proposal-ready document. Paste into your proposal or GHL document template.

## Tab 3 · Build Guide

The personalized setup runbook — every step numbered, with copy-paste blocks and a **"You know it worked when"** acceptance check. Steps regenerate from the profile: hostnames, `deployment.jsonc`, env vars, OAuth redirect URIs, and one setup step per checked system (in wave order), ending at the pilot-readiness gate.

- **Checkboxes + progress bar** track completion per client (saved like everything else).
- **Inline fields** (Account ID, Access AUD tag) update every generated config block the moment you paste them.
- Missing profile inputs (domain, account ID) are flagged at the top; placeholders appear until filled.
- PHI-touching systems (EMR, clearinghouse) carry a hard **"STOP unless BAAs are signed"** gate.

The same guide ships as `SETUP.md` when you run the export through `cfos-scaffold` — useful for handing a runbook to a client's IT or a subcontractor.

---

## Hosting the Studio

| Option | AI assist | Notes |
|---|---|---|
| Hosted claude.ai artifact | Copy-paste mode only | Private by default; zero setup |
| Open the file locally / `python3 -m http.server` | Copy-paste mode | Data stays in that browser |
| Self-host (Cloudflare Pages + Access) | Both modes, incl. direct endpoint | The production setup; see [getting-started.md §3](getting-started.md) |

One caveat to know: browsers occasionally clear `localStorage` (privacy modes, storage pressure, site-data resets). Export after every serious working session.
