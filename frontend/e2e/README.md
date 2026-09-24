# End-to-end tests

Playwright drives a real browser (Chromium) through the app, against the **real API and
PostgreSQL**, covering the journeys that matter most. No fake API is involved.

```sh
cd frontend
npx playwright install chromium   # once: downloads the browser
npm run test:e2e                  # runs everything (about a minute)
npm run test:e2e:report           # opens the HTML report (traces and screenshots of failures)
```

**What it starts:** Playwright launches its own API on port **8100**
([start-api.sh](start-api.sh)) and Vite on port **3100**, then stops both. The API uses its
own database, **`helpdesk_e2e`**, which is created if missing, wiped and reloaded with demo
data on every run. Your `helpdesk_dev` data and any servers on ports 8000 / 3000 are never
touched. It needs the backend's `.venv` and the local PostgreSQL (see the root docs).

| File | Journeys |
| --- | --- |
| [lifecycle.spec.js](lifecycle.spec.js) | Employee reports (building → floor → seat) → admin assigns the matching engineer → engineer starts, posts a note, resolves → admin closes → employee sees the outcome and full history · engineer requests an incident → admin approves → it's in their work · admin filters by building and floor with the live count |
| [accounts.spec.js](accounts.spec.js) | Registration (including the @acme.inc rule) · forced password change for a new hire (old password stops working) · wrong password and disabled account messages · session survives a reload; sign-out ends it |
| [access.spec.js](access.spec.js) | Employees only see their pages, and the **API** refuses admin endpoints (403) · someone else's incident reads as not found · each role's dashboard · admin overview numbers and charts · a deep link survives a reload |
| [phone.spec.js](phone.spec.js) | On a phone-sized screen: menu navigation, reporting an incident, cards instead of tables |

## Against the deployed site

```sh
cd frontend
E2E_BASE_URL=https://dieilg51k5yf9.cloudfront.net E2E_PASSWORD='<demo password>' npm run test:e2e
```

- **Needs the demo data in the cloud**, loaded with the `seed_demo_data` task (see the
  [backend README](../../backend/helpdesk/README.md#demo-data-on-aws)). `E2E_PASSWORD` is the
  password that task used (`demo_password` in its result, or the one you passed).
- Nothing starts locally. The run first waits for `/api/helpdesk/health` (up to 2 minutes, while
  the Lambda starts and Aurora resumes), then uses longer timeouts and one retry per test.
- **It writes real data:** incidents titled `[e2e] …`, notes, an assignment request, and a
  registered account `e2e.…@acme.inc`. Admins can find them by searching `[e2e]` and delete or
  deactivate them.
- Tests tagged **`@local-only`** are skipped, because they can only succeed once per database
  (the new hire's forced password change permanently changes Nina's password). 15 of the 16
  journeys run.

Tests run one at a time because they share the database. Shared steps (sign in, report an
incident, pick from a dropdown) are in [helpers.js](helpers.js).
