# AGENTS.md — rules for every AI assistant on this repo

Every teammate's AI (Claude Code, Cursor, Copilot, ChatGPT, anything) follows this file.
If you use a chat AI, paste this file into the chat before asking for code.

## Stack (do not change without team agreement)
- Next.js (App Router) + TypeScript
- Supabase (Postgres + auth if needed)
- Tailwind CSS for styling
- Deployed on Vercel from `main`

## Folder map and ownership
Only edit files in the folders you own. If you need a change somewhere else, ask the owner.

| Folder | Owner | What lives here |
|---|---|---|
| `app/` pages, `components/` | Frontend | Pages, layouts, UI components |
| `app/api/*` (except `app/api/agent/`) | Backend | API routes, privacy filtering |
| `lib/nessie/`, `lib/db/`, `lib/services/huddle.ts` | Backend | Nessie client + seed, Supabase, huddle phases |
| `lib/types.ts` | **Lead only** | Shared types: the contract everyone imports |
| `lib/engine/`, `lib/services/health.ts` | Lead | All math: forecast, health score, afford, split. No AI, no network calls. |
| `lib/agent/`, `app/api/agent/` | Feature | Nemotron loop, tools, prompts |

**Never compute money numbers with the AI.** Call the functions in `lib/engine/`.
**Never return another member's private data from an API route.** See the privacy rules in the team plan.

## Rules for AI-generated code
1. **Use the shared types in `lib/types.ts`.** Never redefine a type that already exists there.
   If you need a new field, ask the Lead to add it.
2. **One small thing per request.** One component, one route, one query. Never "build the app."
3. **Do not create new top-level folders or new config files** (tsconfig, next.config,
   tailwind config, package.json scripts) without asking the team.
4. **Do not add new dependencies** without telling the team in chat first.
5. **Never rewrite a whole file you don't own.** Never touch `lib/types.ts` unless you are the Lead.
6. **Keep files small**: one component per file, one route per file. No 800-line files.
7. **No secrets in code.** Keys go in `.env.local` (gitignored). Only `.env.example` is committed.
8. **Mock data is fine** while waiting on the backend. Put it in `lib/mock.ts` and use the
   shared types.

## Git rules (humans and AI)
- Never commit directly to `main`. Branch per feature: `name/feature`, e.g. `sagar/login-page`.
- Small PRs. The Lead merges.
- Run `git pull origin main` into your branch at least every hour.
- **AI tools may never run** `git push --force`, `git reset --hard`, `git rebase`, or delete
  branches. A human does those, only after asking the team.
- Before you open a PR, run the app (`npm run dev`) and click through your feature yourself.
  "The AI said it works" doesn't count.

## Definition of done
It runs locally, it works on the deployed Vercel URL, and the person who made it can explain it.
