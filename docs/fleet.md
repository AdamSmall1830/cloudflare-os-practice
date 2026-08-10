# Fleet operations

One client is a deployment; three clients are a fleet. This file is the standing tracker and the monthly sweep protocol — start it at client #2, and port it to a gadget in our own OS when the table stops fitting in a glance (playbook Section 12).

## The fleet tracker

Update on every upgrade, incident, or integration change. One row per deployment (our own HQ instance is row 1 — it takes every release first).

| Client | Seats | Release pin | Staging bumped | Evals on staging | Prod promoted | Custom gatekeepers | MCP portal routes | Spend/user (mo) | Next action |
|---|---|---|---|---|---|---|---|---|---|
| HQ (us) |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |

Column rules:
- **Release pin** — the exact cloudflare-os **submodule commit** the deployment runs (there are no tagged releases yet; the starter pins upstream as a git submodule). Record the short SHA. Never "latest."
- **Evals on staging** — date + result of the full eval run (EVALS.md protocol) against the *new* pin. Blockers failing = promotion stops; no exceptions.
- **Spend/user** — from AI Gateway, monthly; a sudden jump is an incident, not a curiosity.
- **Next action** — one concrete thing with an owner ("promote 2026-09 pin", "rotate QBO credential", "re-run evals after skill edits").

## The monthly upgrade sweep

Run in this order — our HQ instance is always first (we absorb surprises, clients don't):

1. **Pick the pin.** Choose the upstream cloudflare-os commit to bump the submodule to; read the upstream commit log / upgrade checklist against each deployment's surface (gatekeepers, portals, skills-visible behavior) — there's no packaged changelog, so diff the commits since the current pin.
2. **HQ first:** bump HQ staging → full eval run → promote HQ prod → live on it for 2–3 days.
3. **Per client, in tracker order:** bump *their* staging → run *their* eval suites (platform + workflows) → fix or hold on any blocker → promote prod → stamp the tracker row.
4. **Log the sweep:** date, pin, per-client result, anything held back and why. A held-back client gets a scheduled retry, not a silent skip.

## Standing fleet rules

- **One pin gap max:** no client runs more than one release behind the fleet's current pin — drift compounds into unupgradeable snowflakes.
- **Credentials rotate on schedule** (SECURITY-BASELINE.md per client, 90 days) — the sweep is the natural checkpoint to catch overdue rotations.
- **Incidents propagate:** an incident at one client adds its red-team eval case to *every* deployment's platform suite, not just theirs.
- **Retainer clients first** in the sweep order after HQ; handed-off clients get the release notes and an offer, not an unrequested upgrade.
- **Capacity honesty:** a sweep costs roughly half a day per deployment (bump, evals, promote, log). When the fleet outgrows the calendar, that's the signal to automate the sweep as a Workflow in our own OS — not to skip evals.
