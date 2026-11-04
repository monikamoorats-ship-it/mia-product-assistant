# Mia – Product Learning Assistant

Mia is a demonstration learning assistant that helps pharmacy customers, potential buyers and new
pharmacy employees learn about over-the-counter (OTC) products. It is a learning tool and does not
replace advice from a pharmacist or doctor. No external AI service is used.

> **Status:** all six implementation slices are written. The app has not yet been deployed or run
> against a real database (Railway signups were unavailable while building). See
> [Verification status](#verification-status).

## Stack

Next.js 16 (App Router) + TypeScript, Tailwind CSS 4, Lucide icons, Radix UI primitives (dialogs,
sliders), PostgreSQL on Railway via Prisma 7. The app runs on Railway. Nothing runs on the developer's
computer: there is no local database and no local server.

## Features

- **Chat** (`/chat/new`, `/chat/[id]`): a deterministic mock AI built from the product data. A safety
  guard runs first (emergency, diagnosis/personal advice, special group/interactions), then keyword
  matching, persona (chosen by `seedKey`), simulated model style, Temperature wording and Top-P detail.
  The product tip and "Ask a pharmacist if you’re unsure." are always included. Product cards come from
  immutable snapshots stored with the message.
- **Products** (`/products`, `?product=<id>`): search by name, active substance or symptom, category
  filter, URL-driven detail view, Manage Products (custom products; seeded ones are read-only and can be
  duplicated).
- **Quiz** (`/quiz`): 5 generated questions, instant feedback, a final score and the last 10 results.
- **Ownership:** there is no login. An anonymous HTTP-only cookie identifies a browser profile; chats,
  quiz results and custom products/personas are scoped to it. Chats and quiz results persist across page
  reloads and Railway deployments in the same browser profile (no cross-device synchronisation).

## Routes and API

| Page | Purpose |
| --- | --- |
| `/` | Read-only: redirects to the latest non-empty chat, otherwise `/chat/new` |
| `/chat/new` | Unsaved composer; the first valid message creates the session |
| `/chat/[id]` | One owner-scoped chat (404 "Chat not found" for missing or foreign IDs) |
| `/products` | Catalogue; `?product=<id>` opens the detail view |
| `/quiz` | Quiz and latest results |

API routes: `GET/POST /api/chats`, `GET/PATCH/DELETE /api/chats/[id]`, `POST/DELETE
/api/chats/[id]/messages` (DELETE = Clear Chat), `DELETE /api/history` (Clear my history),
`GET/POST /api/prompts`, `PUT/DELETE /api/prompts/[id]`, `GET/POST /api/products`,
`GET/PUT/DELETE /api/products/[id]`, `GET /api/quiz`, `GET/POST /api/quiz/results`, `GET /api/health`.
No GET request writes to the database. State-changing requests must be same-origin, are rate limited
and limited to 10 KB.

## Configuration

| Variable | Where it comes from |
| --- | --- |
| `DATABASE_URL` | Required. Supplied to the web service by the Railway PostgreSQL service as a reference variable. The app and seed fail with a clear message when it is missing. |
| `PORT` | Supplied automatically by Railway. Do not hard-code it there. |

Copy `.env.example` for reference only. Never commit a real `.env`.

## Railway deployment

Railway builds and deploys automatically from the `main` branch. Settings live in the committed
[`railway.json`](railway.json):

1. **Build:** `npm run build` (`prisma generate && next build`). The build never queries the database.
2. **Pre-deploy:** `npm run predeploy` (`prisma migrate deploy && prisma db seed`). If this fails, the new
   deployment is not started and `prisma db push` is never used as a fallback.
3. **Start:** `npm run start` (`next start`, which listens on Railway's `PORT`).
4. **Healthcheck:** `GET /api/health` runs `SELECT 1` and returns `200 {"status":"ok"}` or
   `503 {"status":"unavailable"}`. Railway uses it while activating a deployment; it is not a
   substitute for continuous production monitoring.

On the very first deployment there is no previous version to fall back to, so a failed first
deployment leaves the app unavailable.

### Railway readiness checklist (to be confirmed manually)

- [ ] A Railway project exists.
- [ ] The web service is linked to this repository's `main` branch.
- [ ] A Railway PostgreSQL service exists.
- [ ] The web service receives `DATABASE_URL` through a reference variable.
- [ ] A public domain is generated or ready to be generated.
- [ ] Railway reads the committed `railway.json`.

## Data model and seeding

- Seeded products and personas (`ownerId = NULL`) are global and read-only. Each has an immutable
  `seedKey`. Personas map to their behaviour by key: `customer-guide` → Customer, `learning-coach` →
  New Employee, `product-expert` → Pharmacist. Custom personas have no key and use the Customer tone.
- User-created records carry an `ownerId`: a SHA-256 hash of the anonymous per-browser cookie.
- The seed (`prisma/seed.ts`) reads [`prisma/products.csv`](prisma/products.csv), validates it before
  writing anything, and upserts by `seedKey` with `update: {}`. Re-running it creates only missing
  seeded rows and never overwrites edits or touches user-created rows. A seeded row that was deleted
  entirely is restored.
- `prisma/products.csv` is the single source of truth for the sample products. Columns:
  `seed_key,product,active_substance,category,use_for,how_to_use,tip` (each field quoted).
- Constraints Prisma cannot express (CHECK constraints, partial unique indexes such as "one empty chat
  per owner") are written by hand in the migration SQL.

## Limits

Per anonymous owner: 50 chats, 200 messages per chat, 20 custom products, 10 custom personas, 100
stored quiz results. Rate limits: 20 message requests per minute per owner and per IP, 10 new owner
cookies per hour per IP, at most 2 concurrent generations per owner and 5 per IP. Field lengths and
the 2000-character message limit are enforced on the server.

## Testing

| Layer | Command | Needs |
| --- | --- | --- |
| Pure logic | `npm test` | Nothing: no PostgreSQL, no `DATABASE_URL`, no server, no network. |
| Database integration | `npm run test:integration` | **Only in GitHub Actions**, against a disposable PostgreSQL service container. |
| End-to-end (navigation, mobile) | `npx playwright test` | **Only in GitHub Actions** (job `e2e`), against `next start` on a disposable PostgreSQL. |

- No local database or local production server is created.
- Railway production data is never used for testing. Destructive test setup refuses to run unless
  `NODE_ENV=test`, `ALLOW_TEST_DATABASE_RESET=true` and a dedicated `TEST_DATABASE_URL` pointing at a
  database whose name contains `test` (and that differs from `DATABASE_URL`) are all set.
- CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, a build with `DATABASE_URL` unset,
  migrations + a double seed + integration tests on a throwaway PostgreSQL, the Playwright suite, and a
  separate job that proves a failing migration exits non-zero.

## Verification status

Typecheck, the production build (without a database) and the pure unit tests pass locally. The database
integration tests and the Playwright end-to-end tests have **not been run yet**: they need GitHub
Actions on a pull request, and no local database or server was used. The UI has not been viewed in a
browser. Treat the first CI run and the first Railway deployment as the real verification.

## Known risks and limitations

1. The keyword safety guards will miss some medical phrasings and do not replace professional advice.
2. The in-memory rate limiter resets on restart or deploy, does not coordinate across multiple Railway
   instances and reduces casual abuse only; it is not production-grade protection.
3. Quiz scores are reported by the browser and are not suitable for certification, grading or other
   high-stakes use. Manipulation affects only the anonymous owner's private demonstration history.
   Correct answers are visible in the quiz API response.
4. Chats and quiz results persist across page reloads and Railway deployments in the same browser
   profile only. Cross-device synchronisation is out of scope.
5. The seeded medical content comes from the supplied CSV and has not been reviewed by a pharmacist.
6. A client that discards cookies can obtain a new anonymous owner per request, limited only by the
   per-IP new-cookie rate limit.
7. A failed first Railway deployment has no previous version to fall back to.
8. The UI was written without being rendered locally; layout and mobile keyboard behaviour need a
   real-device check.
9. The Playwright suite relies on Chromium accepting a Secure cookie on http://localhost.
10. The matcher can return loosely related products for broad symptom words (for example `fever` also
    lists the pain relievers for a hay-fever question). Results are labelled as possible matches.
11. The client IP comes from Railway's `X-Real-IP` header. Outside Railway a client can set that header.
