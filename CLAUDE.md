@AGENTS.md

## Orchestration workflow

You (the main model) are the orchestrator: plan, decompose, delegate, synthesize.

- Reasoning-heavy phases (architecture, complex debugging, algorithm design) → delegate to the `deep-reasoner` subagent.
- Mechanical work (boilerplate, tests, formatting, simple edits) → delegate to the `fast-worker` subagent.
- Subagents start with no context: include the relevant files, constraints, and acceptance criteria in every delegation prompt.
- For high-stakes decisions, run `deep-reasoner` on the problem in parallel with your own analysis, then synthesize the best of both.
- For non-trivial multi-step work, show a short plan first, then execute.
- Keep your own context lean; do not pull large files into the main conversation when a subagent can process them.

## Project facts (read before prod-related work)

- Prod: Next.js + self-hosted Supabase on one VPS. Deploy, server layout, migrations and incident checklist: `docs/RUNBOOK.md`.
- Cloud Supabase (supabase.com) and the Supabase MCP are obsolete for this project — never query or migrate through them.
- Every commit on `main` deploys to production via `.github/workflows/deploy.yml`.
- Migrations: `supabase/migrations/NNN_name.sql`, next free number; the deploy does NOT apply them.
- UI language is Russian; user-facing copy, commit messages and PR descriptions in Russian.

## Cloud sessions (claude.ai/code)

`CLAUDE_CODE_REMOTE=true` means you run in a cloud sandbox with a fresh clone. There:

- Dependencies are installed by `.claude/hooks/session-start.sh`; no `.env.local`, no secrets, no SSH to the VPS, no prod DB.
- Verify with `npx tsc --noEmit` and `npm test` (no dev server / `next build` — they need env).
- Work on the session branch and open a PR; merging the PR to `main` is the deploy, so it is the owner's call.
- If the task needs a migration applied, a server change or an env var, write the code/migration, then list the exact manual steps for the owner in the PR description instead of trying to do them.
