# Training curricula — the four tracks

Session outlines for the rollout phase (playbook Section 08). Every track trains on the client's *own* pilot workflows and their *own* data — never generic AI demos. Materials to prepare per engagement: the pilot workflows list, the policy matrix, two seeded example workspaces, and the champion's skill drafts.

## Track 1 · End user (everyone) — 2 hours

**Objective:** a normal employee leaves able to do their pilot workflow in the workspace, and knows exactly what the agent can and cannot touch.

| Time | Block |
|---|---|
| 0:00–0:15 | What this is: your workspace, grounded in how *we* work. Live demo of one pilot workflow, start to finish. |
| 0:15–0:45 | Hands-on: everyone runs the same workflow on a prepared fixture. Asking well: context in, artifacts out. |
| 0:45–1:15 | Documents that stay live; where files go; sharing — and why a colleague may see less than you in the same doc (observation verification, in plain words). |
| 1:15–1:45 | The approval queue: what queues, who approves, what "the agent can't do that" means (zero-access by default). Run one side-effect workflow into the queue for real. |
| 1:45–2:00 | Where to get help: champions, office hours, the capability directory. Q&A. |

**Completion check:** each attendee has run one pilot workflow unassisted and can answer "what happens if you ask it to email a customer?" correctly (it queues — or refuses).

## Track 2 · Champion (2–4 per dept) — 1 day

**Objective:** champions can author skills, build small gadgets, and run the feedback loop without us.

| Time | Block |
|---|---|
| morning 1 | Skills deep-dive: anatomy, the seven craft rules, good-vs-bad (docs/skills-guide.md). Exercise: each champion drafts one skill for a real task from their inbox. |
| morning 2 | Cold-run testing: swap skills with another champion, run them cold, check the observation log, sharpen. Pin one golden eval fixture each. |
| afternoon 1 | Gadgets: build a small tool from a prompt; share live vs. share a Blueprint; when a one-off becomes a team app. |
| afternoon 2 | Running the loop: the weekly tuning session agenda, triaging requests into the skills backlog, office-hours format. Dry-run one tuning session on pilot feedback. |

**Completion check:** one skill authored, cold-run by a peer, and passing its pinned golden case; one gadget built and shared as a Blueprint.

## Track 3 · Administrator (IT/ops) — 2 days

**Objective:** the admin can operate, upgrade, and audit the deployment unassisted — the acceptance checklist items are the exam.

Day 1: deployment anatomy (`deployment.jsonc`, Worker layout, staging vs prod) · Access policy and user lifecycle (joiner/leaver) · AI Gateway: model matrix, budgets, allowance tuning, reading spend attribution · gatekeeper policy edits and credential rotation (rotate one for real) · MCP Server Portals: adding a server, scoping tools, reading portal logs.

Day 2: the upgrade runbook end-to-end — bump staging, run the eval suites (EVALS.md), promote, log in the fleet tracker · observation-log review: answering "what did the agent read?" for a real workspace · incident runbook walkthrough (SECURITY-BASELINE.md): contain → revoke → investigate → notify → add the eval · backup/export posture.

**Completion check:** a full staging upgrade performed unassisted + one credential rotated + one simulated incident handled through all five steps.

## Track 4 · Builder (client devs, where they exist) — 2 days

**Objective:** an internal developer can extend the deployment without us — the beginning of client self-sufficiency, priced accordingly.

Day 1: repo tour (starter, pinned release, `packages/custom-gatekeeper`) · gatekeeper anatomy: typed narrow capabilities, credentials as Worker secrets, approval enqueueing · build one read-only gatekeeper method against a sandbox API, deploy to staging.

Day 2: Workflow authoring against the pattern library (docs/workflow-patterns.md): implement one scheduled digest spec end-to-end · integration testing · adding eval cases for what they built · the contribution rules (what they own vs. what the retainer covers).

**Completion check:** one gatekeeper method and one Workflow, built by them, passing evals on staging.

---

**Delivery notes:** tracks 1–2 are champion-led by the second wave (train-the-trainer is the point); track 3 runs against staging, never prod; record every session's questions — the recurring ones become capability-directory entries and skills.
