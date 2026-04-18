# Tellform

Minimal AI-powered conversational survey platform. Next.js 15 (App Router) · Prisma · PostgreSQL · Auth.js (JWT) · OpenAI.

## Architecture

```
User → Organization (auto-created on signup) → Project → Survey → Response
```

- **Auth**: Google OAuth via Auth.js v5, JWT session strategy. Users are persisted via Prisma adapter; an Organization is auto-created in `events.createUser`.
- **AI**: Pluggable provider (`src/lib/ai.ts`) — toggle between OpenAI (`gpt-4o-mini`) and Gemini Flash (`gemini-2.5-flash`, free tier) via the `AI_PROVIDER` env var. Both return structured JSON, validated by Zod before persistence.
- **Survey UX**: One question per screen, large centered text, keyboard-first (Enter to advance), progress indicator.
- **Public surveys**: `/survey/[surveyId]` is unauthenticated; respondents must enter name + email.

## Folder layout

```
prisma/schema.prisma
src/
  auth.config.ts        # edge-safe NextAuth config (used by middleware)
  auth.ts               # full NextAuth (adapter + callbacks)
  middleware.ts         # protects /dashboard/*
  lib/
    prisma.ts           # singleton client (Prisma 7 driver adapter)
    ai.ts               # unified AI provider — OpenAI or Gemini
    openai.ts           # OpenAI SDK client
    gemini.ts           # Gemini SDK client (@google/genai)
    access.ts           # multi-tenant ownership helpers
  components/           # Sidebar, SurveyTaker, forms, providers
  app/
    api/
      auth/[...nextauth]/route.ts
      projects/route.ts
      surveys/generate/route.ts
      submit-response/route.ts
    login/page.tsx
    dashboard/
      layout.tsx
      page.tsx
      projects/[projectId]/
        page.tsx
        create-survey/page.tsx
        surveys/[surveyId]/page.tsx
    survey/[surveyId]/page.tsx   # public
```

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment** — copy `.env.example` to `.env` and fill in:

   - `DATABASE_URL` — Postgres connection string
   - `AUTH_SECRET` — generate with `npx auth secret`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — from Google Cloud Console (authorized redirect URI: `http://localhost:3000/api/auth/callback/google`)
   - `AI_PROVIDER` — `openai` or `gemini` (default `openai`)
   - `OPENAI_API_KEY` (when using OpenAI)
   - `GEMINI_API_KEY` (when using Gemini — free tier at https://aistudio.google.com/app/apikey)

3. **Set up the database**

   ```bash
   npx prisma db push
   ```

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/projects` | session | Create a project in caller's org |
| POST | `/api/surveys/generate` | session | Generate + save AI survey |
| POST | `/api/submit-response` | public | Submit a response |
| `*` | `/api/auth/*` | — | Auth.js handlers |

## Switching AI providers

Change `AI_PROVIDER` in `.env` and restart:

```env
# Free tier — Gemini Flash
AI_PROVIDER="gemini"
GEMINI_API_KEY="..."

# OR
AI_PROVIDER="openai"
OPENAI_API_KEY="..."
```

Both providers go through `src/lib/ai.ts → generateSurveyJson()`. Add another provider by extending that switch.

## Prisma 7 notes

- Connection URL lives in `prisma.config.ts` (for Migrate) and is passed to `PrismaPg` adapter at runtime — `schema.prisma` no longer carries `url`.
- Driver adapter (`@prisma/adapter-pg`) is GA in Prisma 7; no preview-feature flag needed.
- Run migrations with `npx prisma db push` as usual; the CLI reads `prisma.config.ts`.

## Future-proofing notes

- **Voice**: `SurveyTaker` is the single integration point — wrap input with mic/STT and add TTS read-aloud per question.
- **Decoupled backend**: API routes are thin and use `lib/access.ts` for ownership checks; logic can lift into a separate service. JWT sessions mean the frontend doesn't need a session store.
- **Roles/billing**: Not modeled. Add `Membership` (User × Organization × Role) when needed.
