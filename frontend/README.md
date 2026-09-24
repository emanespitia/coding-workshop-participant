# ACME Facilities Helpdesk: Frontend

React app for reporting and tracking facility incidents. Built with Vite, Material UI
(components and theme), React Responsive (screen-size layouts) and React Router.

The look and colors for every page are defined in [DESIGN.md](DESIGN.md).

## Run locally

The app calls the API at `/api/helpdesk` on its own origin. In development, Vite forwards
those requests to the FastAPI server, so start the backend first (see
[backend/helpdesk/README.md](../backend/helpdesk/README.md)):

```sh
# terminal 1: API on http://localhost:8000
cd backend/helpdesk && .venv/bin/uvicorn app.main:app --reload

# terminal 2: app on http://localhost:3000
cd frontend
npm install        # once
npm run dev
```

Open http://localhost:3000 and sign in with a demo account (the login page has one-click
buttons for them in development). Every demo account's password is `Password123`.

To point the dev server at a different API, set `HELPDESK_API_TARGET` (see `.env.sample`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload on port 3000 |
| `npm test` | Run the tests once (Vitest + Testing Library) |
| `npm run test:watch` | Re-run tests as files change |
| `npm run test:e2e` | End-to-end tests in a real browser against the real API and database ([e2e/README.md](e2e/README.md)) |
| `npm run lint` | ESLint |
| `npm run build` | Production build into `dist/` |

## Layout

```
src/
├── main.jsx             entry point (fonts, global CSS)
├── App.jsx              theme, auth provider and router
├── routes.jsx           every page and which ones need sign-in
├── theme/               design tokens (all colors) and the MUI theme; see DESIGN.md
├── constants/           labels for statuses, priorities and categories
├── services/api.js      fetch wrapper: tokens, error envelope, automatic token refresh
├── auth/                AuthProvider (signed-in user), useAuth, route guards (sign-in, role)
├── layout/              AppLayout (top bar + phone menu), AccountMenu, navigation.js (links per role)
├── hooks/               useBreakpoints (React Responsive), useApiData (load API data), useChartColors
├── components/          shared pieces (IncidentChips, ReasonDialog, PageStatus, PasswordField, …)
├── utils/               formatting, validation, incident workflow helpers
├── pages/               auth/ (sign in, register), account/ (profile, change password), incidents/
│                        (list, available, report, detail, edit), requests/, dashboard/ (per role,
│                        admin charts), facilities/, users/ (admin)
└── test/                test setup and helpers (fake API, screen width)
```

Signing in stores the access and refresh tokens in `localStorage`. When the access token
expires, the next request refreshes it automatically; if the session was revoked (for
example after a password reset), the user is sent back to the sign-in page.

## Deploy to AWS

```sh
./bin/deploy-frontend.sh
```

The build is uploaded to S3 and served by CloudFront, which also routes `/api/helpdesk*`
to the backend Lambda, so the app and the API share one domain.
