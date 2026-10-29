# ecom-api

REST API for Ecom Manager, the inventory system for an online seller on Meesho, Flipkart, Amazon and Myntra.
NestJS 12, Prisma 7, PostgreSQL 17, Swagger, JWT. Runs on a VPS with PM2. The database is Azure Database for PostgreSQL.

The web app lives in the sibling repo `ecom-web`. Architecture rules are in `../CLAUDE.md`, and hosting steps are
in `../docs/DEPLOYMENT.md`.

## Run it locally

Requirements: Node.js 22.12+ and Docker.

```bash
npm install
cp .env.example .env          # set JWT_ACCESS_SECRET (the command is in the file)
npm run db:up                 # PostgreSQL on localhost:5433, Adminer on http://localhost:8081,
                              # Mailpit (catches every email, e.g. reset links) on http://localhost:8025
npm run db:migrate            # create the tables
npm run db:seed               # the business, its one login and demo products

npm run dev                   # starts the database if needed, then the API on http://localhost:4000/api
```

Swagger is at http://localhost:4000/docs. Demo login: **owner@ecom.local / Owner@12345**.
There is no sign-up: the seed creates the only login. "Forgot password?" emails land in Mailpit.
`npm run db:down` stops the database.

## Checks

```bash
npm run lint && npm run typecheck && npm run build
```

GitHub Actions runs the same checks on every push (`.github/workflows/ci.yml`).
