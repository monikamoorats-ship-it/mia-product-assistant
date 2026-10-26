# CLAUDE.md

## Deployment

- The app is deployed on Railway automatically from the `main` branch of this GitHub repo.
- The database is a Railway PostgreSQL database. It is available only through the `DATABASE_URL` environment variable on Railway.
- Do not set up a local database or a local server. The app runs on Railway, not on this computer.

## Workflow

- Before every push, run `npm run build` to make sure the app builds.
- After each finished task, commit and push to GitHub so that Railway deploys the new version.
