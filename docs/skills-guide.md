# Skills authoring guide

Skills are where a Cloudflare OS deployment stops being "a chatbot with connectors" and becomes *the client's* operating system. Cloudflare's own first lesson from internal rollout: **"the context from the organization matters more than the model."** Models are rented; the skills library is the asset the client keeps — and the craft below is what our practice charges for.

A skill is a Markdown file in `.agents/skills/` that teaches the agent one recurring piece of work: when it applies, how the client does it, what needs a human, and which source wins when data disagrees.

## Anatomy — every skill has these seven parts

The scaffold CLI emits seeds in this shape (`skills/*.md` in every deployment seed):

| Section | What belongs there |
|---|---|
| **Header** | Client, dept, risk tier, systems, **owner (champion)**, **last-reviewed date** |
| **When to use** | One sentence, in the client's vocabulary, naming the trigger |
| **Inputs** | What must exist before the skill runs, and where it lives |
| **Procedure** | Numbered, imperative steps — the heart of the skill |
| **Approvals** | Which steps queue for which named human |
| **Sources of truth** | Which system wins on conflict, and what to do about the conflict |
| **Known failure modes** | What predictably goes wrong and the correct degraded behavior |

## The craft rules

1. **Steal their vocabulary, verbatim.** If the clinic says "arrivals list" and the EMR says "appointment roster," the skill says *arrivals list*. Discovery interviews and the magic inbox are your corpus — quote them. An agent that speaks the client's dialect is trusted; one that speaks the vendor's manual is tolerated.
2. **Imperative, numbered, deterministic-first.** Write procedure steps as commands ("Pull yesterday's arrivals list from WebPT"), ordered so everything mechanical comes before anything requiring judgment.
3. **Mark judgment explicitly.** Where the human's craft lives, say so: `JUDGMENT: if the referral mentions a prior surgery, flag for the therapist rather than templating the plan.` Unmarked judgment is where agents quietly improvise.
4. **Name humans, not roles-in-the-abstract.** "Queue for approval by Maria (Office Mgr)" — the approval section must match the policy matrix and the SECURITY-BASELINE approval map exactly.
5. **Never restate what the platform enforces.** Don't write "do not access other systems" — gatekeepers already guarantee it. Skills carry *process* knowledge; guardrails live in policy. Restating platform rules trains the agent to treat real constraints as suggestions.
6. **One trigger per skill.** If the "When to use" sentence needs an "or," split it. Merge only when two skills share ≥80% of their procedure and always fire together.
7. **State the tie-breaker.** "The CRM is authoritative for contact data; the EMR for clinical data; on conflict, update the CRM from the EMR and note it" — conflict behavior is the difference between an agent that reconciles and one that propagates errors.

## Good vs. bad, side by side

**Bad** (vague, model-flattering, no sources):

> Use your best judgment to triage referrals efficiently and professionally, keeping HIPAA in mind, and prepare helpful chart notes for the therapist.

**Good** (excerpt):

> **When to use:** a new referral lands in the referrals inbox (fax PDF or portal message).
> **Procedure:**
> 1. Pull patient name, DOB, referring provider, and diagnosis from the referral. If any of the four is missing, stop and draft a request to the referrer — do not guess.
> 2. Check WebPT for an existing chart by name + DOB. Existing patient → open a return-visit episode; never a duplicate chart.
> 3. Fill the benefits worksheet from the eligibility portal (copay, visit cap, auth required?).
> 4. `JUDGMENT:` refer-out keywords ("post-surgical day 1", "unresolved fracture") → flag for Dr. Chen instead of scheduling.
> **Approvals:** outbound requests to referrers queue for the front-desk lead.
> **Sources of truth:** eligibility portal beats the card on file; WebPT beats the referral PDF for demographics.

Same workflow — but the second one is testable, auditable, and captures ten years of front-desk scar tissue.

## Testing a skill — before it's "done"

1. **Cold run:** a champion (not the author) runs the workflow in a fresh workspace with only the skill loaded. The agent must use the right vocabulary, order, and sources unprompted.
2. **Observation-log check:** confirm the agent read *only* the sources the skill names — extra reads mean the skill under-specifies and the agent is foraging.
3. **Pin the evals:** every skill backs a workflow with an eval suite (`evals/*.json`). Replace the `EDIT` placeholders in its golden cases with real fixtures and exact expected outputs. A skill without pinned evals is a draft.
4. **Break it once:** run the edge-case eval (missing input). The correct behavior is almost always *stop and ask* — if the agent invents data, add the failure mode to the skill and re-run.

## Lifecycle

- **Ownership:** every skill names its champion; the skills backlog is a standing governance-council agenda item.
- **Review cadence:** quarterly, or immediately when the underlying process changes — stamp `Last reviewed` each time. The pilot's weekly tuning session is where skills get sharpened fastest; capture edits within a day while context is fresh.
- **Release bumps:** the eval run (EVALS.md) is the regression net; a platform upgrade that changes skill behavior should be caught there, not by a user.
- **Retire loudly:** when a process dies, delete the skill and note it in the Codex — stale skills are worse than missing ones, because the agent will confidently follow them.

## From magic inbox to skill — the pipeline

Inbox item → cluster (weekly during discovery) → use-case row (scored) → piloted workflow → **skill written with the champion beside you** → evals pinned → cold-run passed → shipped. Skills written *about* champions instead of *with* them fail the cold run — schedule the hour, don't guess.
