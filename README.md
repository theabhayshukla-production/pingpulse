# ⚡ PingPulse - API & Web Health Monitor

PingPulse is a lightweight, full-stack uptime and health-monitoring web service. It allows users to test the live availability, HTTP status codes, and response latency of any website or backend API endpoint in real time.

## Architecture

- **Frontend:** static HTML, CSS, and JavaScript modules in `fronted/`, hosted on Vercel.
- **Backend:** Node.js and Express in `backend/`, hosted on Render.
- **Database:** PostgreSQL, managed using `backend/db/schema.sql` and `backend/db/migrate.js`.
- **Monitoring:** `backend/services/checker.js` performs SSRF-protected HTTP(S) checks; `backend/jobs/scheduler.js` checks due monitors and removes records older than 30 days.

## Local setup

Requirements: Node.js 18 or later and a PostgreSQL database.

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `ALLOWED_ORIGIN`, `CRON_SECRET`, and `MONITOR_API_KEY`. Generate distinct random values of at least 32 characters for both secrets. `PORT` defaults to `5000`.
3. Install and migrate the backend:

   ```sh
   cd backend
   npm ci
   npm run migrate
   npm test
   npm start
   ```

4. Serve the `fronted/` directory on `http://localhost:3000`. The local frontend uses the backend at `http://localhost:5000`; hosted pages use the production Render API.
5. Enter the `MONITOR_API_KEY` value in the Monitors panel. The browser keeps it only for the current tab session.

The PostgreSQL database must be created before running migrations. Never commit `.env` or put backend secrets in frontend code.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `5000`. Render supplies this value in production. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `ALLOWED_ORIGIN` | Yes | Comma-separated exact HTTP(S) frontend origins permitted by CORS. |
| `CRON_SECRET` | Yes | Random secret of at least 32 characters required in the `x-cron-secret` header. |
| `MONITOR_API_KEY` | Yes | Random secret of at least 32 characters required in the `x-monitor-key` header for monitor CRUD and history. Enter it in the frontend; do not add it to frontend source. |
| `PINGPULSE_BACKEND_URL` | GitHub Actions | Base Render URL used by `.github/workflows/cron.yml`, without a trailing slash. Configure as an Actions repository secret. |

## Deployment

### Render backend

1. Configure the Render service root directory as `backend/` and its start command as `npm start`.
2. Provision PostgreSQL and set `DATABASE_URL`, `ALLOWED_ORIGIN` (the exact Vercel site origin), `CRON_SECRET`, and `MONITOR_API_KEY` in the Render service environment. Generate unique, random values for the two secrets.
3. Run `npm run migrate` from the backend service directory against that database before relying on monitor routes.
4. Verify `GET /health` returns `200` and `GET /api/cron/run` without a secret returns `401`.

### Vercel frontend and scheduled checks

1. Set the Vercel project root directory to `fronted/`; connect it to the production Git branch for automatic static deployments.
2. In GitHub repository Actions secrets, set `PINGPULSE_BACKEND_URL` to the Render base URL and set `CRON_SECRET` to the same value configured in Render.
3. The GitHub Actions workflow calls the protected cron route every five minutes. Render also has an in-process every-minute scheduler while the service is awake.

Monitor list/create/delete/history endpoints require the monitor key. The standalone `/api/check` endpoint remains public but rate-limited. CORS is not authentication; keep monitor API key and cron secret private.

## API

All errors use `{ "error": { "code": "...", "message": "..." } }`.

| Method and path | Access | Description |
| --- | --- | --- |
| `GET /health` | Public | Checks backend/database connectivity. |
| `POST /api/check` | Public, rate-limited | JSON body `{ "url": "https://example.com" }`; checks a public HTTP(S) target and returns status, response time, and SSL certificate details. Local, private, reserved, and metadata destinations are blocked. |
| `POST /api/monitors` | `x-monitor-key` | Creates a monitor with `name`, `url`, and optional `interval_minutes` (1–1440). |
| `GET /api/monitors` | `x-monitor-key` | Lists monitors and their latest check. |
| `DELETE /api/monitors/:id` | `x-monitor-key` | Deletes a monitor and its checks. |
| `GET /api/monitors/:id/checks?limit=20` | `x-monitor-key` | Lists up to 100 recent checks for a monitor. |
| `GET /api/cron/run` | `x-cron-secret` | Finds and runs due checks with a maximum concurrency of five. |

The monitor access key is a shared owner credential rather than per-user identity; share it only with trusted operators.