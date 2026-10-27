# CLAUDE.md

## Deployment

- The app is deployed on Railway automatically from the `main` branch of this GitHub repo.
- The database is a Railway PostgreSQL database. It is available only through the `DATABASE_URL` environment variable on Railway.
- Do not set up a local database or a local server. The app runs on Railway, not on this computer.

## Workflow

- Before every push, run `npm run build` and `npm test` to make sure the app builds and the pure-logic tests pass.
- Work in feature branches (one per vertical slice) and push the branch. Code reaches `main` only through a pull request that passes GitHub Actions and is approved by the user. Never push or merge directly to `main`.
- Every merge to `main` deploys to Railway, so the user confirms the deployment status when verification is required.

## Testing

- Pure logic tests run with `npm test` and need no PostgreSQL, no `DATABASE_URL`, no server and no network. Keep domain logic in pure modules without Prisma imports.
- Database integration tests (`npm run test:integration`) run only in GitHub Actions against a disposable PostgreSQL service container, using `TEST_DATABASE_URL`, `NODE_ENV=test` and `ALLOW_TEST_DATABASE_RESET=true`.
- Do not create a local database or local production server. Never use the Railway database (`DATABASE_URL`) for tests or development.
- Never log chat text, persona content, product descriptions, filenames, owner cookies or raw request bodies.
