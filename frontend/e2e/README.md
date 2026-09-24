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

Tests run one at a time because they share the database. Shared steps (sign in, report an
incident, pick from a dropdown) are in [helpers.js](helpers.js).
