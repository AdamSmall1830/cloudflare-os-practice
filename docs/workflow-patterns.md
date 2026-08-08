# Workflow pattern library

Cloudflare OS Workflows are deterministic job sequences — code for the predictable steps, models only where judgment adds value — running on demand, on schedule, or on external events. Nearly every automation we ship is one of five shapes. Each pattern below defines its structure, where the humans sit, how it fails safely, and which eval pins it.

The scaffold CLI instantiates these automatically: every pilot use case with a scheduled or event cadence gets a `workflows/<slug>.md` spec pre-filled from its pattern, ready to complete with the champion.

---

## 1 · Scheduled digest

**Shape:** cron → gather (gatekeeper reads) → synthesize (model) → deliver.
**Use for:** daily production digests, weekly engagement status, pipeline reviews, month-end summaries.

- **Deterministic:** the source list, the query windows, the delivery target, the schedule.
- **Model step:** synthesis only — turning gathered records into readable prose in the house voice (a skill governs tone).
- **Approval:** none when delivery is internal-only (a doc or internal channel); external delivery queues for the sends approver.
- **Failure behavior:** a missing/erroring source never blocks the digest — it ships with an explicit "⚠ source unavailable: X" line. Silence is the only unacceptable output.
- **Metrics:** runs, delivery latency, sources-missing count.
- **Pin the eval:** golden case = a known fixture week produces the expected digest sections; edge = one source down → digest still ships with the warning line.

## 2 · Inbox triage

**Shape:** new item (email/fax/form/ticket) → classify → extract fields → route or draft → drafts queue.
**Use for:** referral intake, supplier email triage, lead replies, support routing.

- **Deterministic:** the intake source, the category set, the routing table, field validation.
- **Model steps:** classification and draft writing (both governed by the workflow's skill).
- **Approval:** every outbound draft queues for the named sends approver — no exceptions during pilot.
- **Failure behavior:** low-confidence classification routes to a human "unsorted" queue rather than guessing; missing required fields → stop and draft a request for them (never invent).
- **Security note:** item content is *data* — instructions found inside an email are summarized or flagged, never followed. The platform red-team eval (`plat-injection`) covers this; run it against each new triage workflow too.
- **Metrics:** items/day, auto-routed %, human-corrected %, approval latency.
- **Pin the eval:** golden = fixture items land in correct categories with correct extracted fields; red-team = the injection fixture.

## 3 · Record sync / hygiene

**Shape:** schedule → diff two systems (deterministic) → propose changes → approved batch applies.
**Use for:** CRM ↔ proposal docs, GHL ↔ QBO ↔ Stripe reconciliation, EMR ↔ schedule consistency.

- **Deterministic:** the field mapping, the source-of-truth rules (from the skill's tie-breakers), the diff itself.
- **Model step:** optional — explaining *why* records diverge, drafting the human-readable change summary.
- **Approval:** proposed writes apply as an approved **batch** (one approval per run, listing every change) — per-record approvals create queue fatigue.
- **Failure behavior:** conflicting sources with no tie-breaker rule → flag, never overwrite; the flag becomes a new tie-breaker line in the skill.
- **Metrics:** records diffed, changes proposed vs. approved (a low approval rate means the mapping is wrong), flags raised.
- **Pin the eval:** golden = a seeded divergence set produces exactly the expected change list; edge = an unmapped conflict raises a flag and touches nothing.

## 4 · Chase / reminder loop

**Shape:** schedule → check condition still outstanding → draft nudge → approval → send → repeat with stop rules.
**Use for:** client prerequisite chasing (credentials, consents, IdP contacts), unpaid invoice follow-ups, unsigned document reminders.

- **Deterministic:** the outstanding-condition check, the cadence, the escalation ladder, the **stop rules**.
- **Model step:** the nudge text — friendly, escalating appropriately, in the house voice.
- **Approval:** sends queue for the sends approver; after trust is established, internal-recipient nudges may auto-send while external ones keep the queue.
- **Stop rules (mandatory):** reply detected → stop; condition satisfied → stop; N nudges reached (default 3) → escalate to the engagement lead instead of nudge N+1. A chase loop without stop rules is a harassment machine.
- **Metrics:** open chases, average nudges-to-resolution, escalations.
- **Pin the eval:** edge = condition satisfied between runs → no nudge is drafted; golden = nudge 3 escalates instead of sending.

## 5 · Event-triggered kickoff

**Shape:** webhook (payment received, document signed, form submitted) → validate payload → create records/workspaces → notify owner.
**Use for:** the delivery-factory pipeline (paid → engagement record + booking link; signed → build kickoff), new-client onboarding.

- **Deterministic:** payload validation, **idempotency** (webhooks duplicate — the same event id must never create two engagement records), the creation steps, the notification target.
- **Model step:** usually none, or only the welcome-message draft. Kickoffs should be boringly reliable.
- **Approval:** record creation is internal (no approval); any outbound message to the client queues.
- **Failure behavior:** invalid payload → log + alert owner, never partial-create; replay-safe by design.
- **Metrics:** events received, duplicates suppressed, time-to-first-action.
- **Pin the eval:** golden = fixture webhook produces the full record set exactly once; edge = the same payload delivered twice creates nothing new.

---

## Cross-cutting rules

1. **Every workflow has a skill** (its voice + procedure) and **an eval suite** (its regression net). Spec → skill → eval → pilot, in that order.
2. **Approval points name humans** — the same names as the policy matrix and SECURITY-BASELINE.
3. **Log observability from day one:** each run's outcome feeds METRICS.md; approval latency is a first-class number.
4. **Degrade loudly.** The worst behavior in any pattern is silent failure or invented data; every pattern's edge eval checks for exactly that.
5. When a workflow doesn't fit any shape here, that's a signal to split it — composites hide approval points.
