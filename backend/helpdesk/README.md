# Helpdesk API

FastAPI service for the ACME facility incident platform. Runs locally with uvicorn and on
AWS Lambda (via Mangum) behind CloudFront at `/api/helpdesk/*`.

## Run locally

```sh
cd backend/helpdesk
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt     # once
PGPASSWORD=postgres123 psql -h localhost -U postgres -c "CREATE DATABASE helpdesk_dev"   # once
cp .env.sample .env.local                                                   # once (git-ignored)

.venv/bin/uvicorn app.main:app --reload                                     # every time
```

Open http://localhost:8000/docs. Settings come from `.env.local`, which is loaded
automatically when running locally (never on AWS). Stop the server with **Ctrl+C**.

### Demo data

With `SEED_DEMO_DATA=true` (the default in `.env.sample`) every start adds any missing demo
data. All demo accounts use the password **`Password123`**:

| Role | Accounts |
| --- | --- |
| Admin | `admin@acme.inc`, `morgan.facilities@acme.inc` |
| Engineer | `sam.rivera@` (hvac, electrical), `priya.shah@` (network, it_hardware, av_equipment), `diego.martinez@` (plumbing, cleaning; busy), `lee.chen@` (security, access_control; off duty), `tom.okafor@` (furniture, other) |
| Employee | `jane.doe@`, `john.smith@`, `maria.garcia@`, `nina.patel@` (must change password at first sign-in), `chris.taylor@` (deactivated, can't sign in) |

Buildings: **HQ Tower** (Basement, Ground, Floor 1, Floor 2), **Riverside Annex** (Ground, Floor 1),
**Innovation Lab** (Ground), each floor with seats (e.g. `1A-01`).

22 demo incidents, created only when there are no incidents yet, with backdated history spread
over the last 30 days (plus one 45-day-old incident outside the default report window):

- every status: open, in progress, blocked, resolved, closed (including one cancelled by its reporter)
- every workflow step: start, block, unblock, resolve, admin reopen, admin close, reassign,
  unassign mid-work (falls back to Open), priority change, reporter edit
- escalations (two active, one de-escalated by an admin)
- assignment requests in every state: pending, approved, rejected with a note, withdrawn
- notes from reporters, engineers and an admin

So every list, filter, incident history and dashboard section has data to show.

Seeding only adds what is missing; demo users and places you delete come back on the next start.
To start over from a clean database:

```sh
.venv/bin/python -m app.seed --reset
```

Automatic seeding only runs locally (`IS_LOCAL=true`), never on AWS Lambda. To load the demo
data into the cloud, see [Demo data on AWS](#demo-data-on-aws).

## Layout

```
function.py            Lambda entry point: HTTP events → FastAPI (Mangum); {"task": …} → app/tasks.py
app/main.py            FastAPI app: routers, error handlers, /api/helpdesk prefix, CORS (local only)
app/models.py          imports every ORM model (tables are created from these on cold start)
app/core/              config, db (SQLAlchemy engine + sessions), deps (FastAPI dependencies:
                       DbSession, CurrentUser, AdminUser), auth (token -> user), errors,
                       security (scrypt + JWT), schemas (Pydantic base types), orm (Base)
app/auth/              routes + schemas: register, login, refresh, me, change password
app/users/             models (SQLAlchemy), schemas (Pydantic), routes, service (rules), repository (queries)
app/facilities/        buildings, floors, seats: models, schemas, routes, service
app/incidents/         models, schemas, workflow (status rules + permissions, no DB), service
                       (lifecycle), notes, assignments (engineer requests), routes, assignment_routes
app/reports/           dashboard summary: SQL aggregates scoped by role
app/seed.py            demo data (users, facilities, incidents); python -m app.seed [--reset]
app/tasks.py           operator tasks run by invoking the Lambda directly (seed_demo_data)
tests/unit/            no database needed
tests/integration/     run against a real PostgreSQL (database `helpdesk_test`)
```

## Endpoints

| Method | Path | Who |
| --- | --- | --- |
| POST | `/auth/register` | public (creates an employee; `@acme.inc` only) |
| POST | `/auth/login` | public |
| POST | `/auth/refresh` | public (refresh token in body) |
| GET | `/auth/me` | signed in |
| PUT | `/auth/password` | signed in |
| GET / POST | `/users` | admin |
| GET / PATCH | `/users/{id}` | admin, or self (limited fields) |
| DELETE | `/users/{id}` | admin (not self, never the last admin) |
| POST | `/users/{id}/reset-password` | admin |
| GET / POST | `/buildings` | read: signed in · write: admin |
| GET / PATCH / DELETE | `/buildings/{id}` | read: signed in · write: admin |
| GET / POST | `/buildings/{id}/floors` | read: signed in · write: admin |
| GET / PATCH / DELETE | `/floors/{id}` | read: signed in · write: admin |
| GET / POST | `/floors/{id}/seats` | read: signed in · write: admin |
| GET / PATCH / DELETE | `/seats/{id}` | read: signed in · write: admin |
| GET / POST | `/incidents` | signed in (list is limited to what you may see) |
| GET / PATCH / DELETE | `/incidents/{id}` | view: who can see it · edit: reporter while open, admin · delete: admin |
| POST | `/incidents/{id}/status` | per workflow rules (see below) |
| POST | `/incidents/{id}/assign` | admin |
| POST / DELETE | `/incidents/{id}/escalate`, `/incidents/{id}/escalation` | reporter or admin / admin |
| GET | `/incidents/{id}/events` | who can see it |
| GET / POST | `/incidents/{id}/notes` | read: who can see it · write: reporter, assignee, admin |
| PATCH / DELETE | `/incidents/{id}/notes/{note_id}` | author (admins can delete any) |
| POST | `/incidents/{id}/assignment-requests` | engineer |
| GET | `/assignment-requests` | admin (all), engineer (own) |
| POST | `/assignment-requests/{id}/approve`, `/reject` | admin |
| POST | `/assignment-requests/{id}/withdraw` | the requesting engineer |
| GET | `/reports/summary?days=30&building_id=` | signed in (admin: everything · engineer: assigned to them · employee: reported by them) |
| GET | `/health` | public |
| GET | `/docs`, `/openapi.json` | public (interactive API docs) |

Errors always look like `{"error": {"code": "...", "message": "...", "fields": {...}}}`.

## Incident workflow

| From → To | Who | Requires `comment` |
| --- | --- | --- |
| open → in_progress | assigned engineer, admin (needs an assignee) | |
| open → closed | reporter, admin | reason |
| in_progress → blocked | assigned engineer, admin | reason |
| blocked → in_progress | assigned engineer, admin | |
| in_progress → resolved | assigned engineer, admin | resolution |
| resolved → closed | admin | |
| resolved → in_progress | admin (reopen) | reason |
| in_progress / blocked → closed | admin | reason |

Visibility: employees see incidents they reported; engineers see their assigned work and the
open, unassigned pool; admins see everything. Incident details include `allowed_transitions`
and `allowed_actions` for the current user. Every change is recorded in `/events`, and
`acknowledged_at`, `assigned_at`, `resolved_at`, `closed_at` support response-time reporting.

## Reports

`GET /reports/summary` returns everything a dashboard needs in one call, scoped to the caller:

| Section | Admin | Engineer | Employee |
| --- | --- | --- | --- |
| `totals`, `by_status`, `by_priority` (active), `by_category`, `trend` (per day) | all incidents | assigned to them | reported by them |
| `response_times`: hours to acknowledge / assign / resolve (avg + median) | ✓ | ✓ | ✓ |
| `attention`: escalated and blocked incidents, with reasons | ✓ | ✓ | ✓ |
| `totals.available_pool`: open, unassigned incidents they can request | | ✓ | |
| `communication`: share of incidents with a staff note, time to first note | ✓ | | ✓ |
| `workload`: each engineer's availability, load and pending requests | ✓ | | |
| `hotspots`: top buildings, floors and seats | ✓ | | |

`days` (default 30) sets the window for `trend`, `by_category`, `response_times`,
`communication` and `hotspots`; `building_id` narrows everything to one building. Sections a
role doesn't get are `null`.

## Database

SQLAlchemy 2.0 ORM over psycopg 3. Tables, constraints and indexes are defined on the
models and created with `Base.metadata.create_all()` on the first request of each Lambda
container (guarded by a PostgreSQL advisory lock). `create_all` only creates *missing*
tables; changing an existing table needs a manual `ALTER TABLE` (no migration tool yet).

## First admin

On first start the service creates `admin@acme.inc` with the password from
`ADMIN_BOOTSTRAP_PASSWORD` (generated by Terraform) and forces a password change at first login:

```sh
cd infra && terraform output -raw admin_bootstrap_password
```

## Demo data on AWS

The cloud database starts empty apart from `admin@acme.inc`. To load the demo buildings,
users and incidents, invoke the Lambda directly with the `seed_demo_data` task (after
`./bin/deploy-backend.sh`):

```sh
source ENVIRONMENT.config     # from the repo root; uses AWS_REGION from your shell (us-east-2 here)
aws lambda invoke --function-name coding-workshop-helpdesk-$PARTICIPANT_ID \
    --cli-binary-format raw-in-base64-out \
    --payload '{"task": "seed_demo_data"}' /tmp/seed-result.json && cat /tmp/seed-result.json
```

- New demo accounts get a **random password**, returned once in `/tmp/seed-result.json`
  (`demo_password`) and never logged. To choose it, add `"password": "YourPass123"`
  to the payload (it must follow the password rules).
- It only adds what is missing, so running it again is safe; existing accounts keep their
  passwords. `admin@acme.inc` keeps its bootstrap password (see [First admin](#first-admin)).
- Only someone with AWS permission to invoke the function can run it: requests through
  CloudFront or the Function URL are HTTP events and always go to the API
  ([function.py](function.py), [app/tasks.py](app/tasks.py)).
- The result file is written outside the repo (it contains the password); delete it when done.

## Tests

```sh
cd backend/helpdesk
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest --cov=app --cov-report=term-missing
```

Integration tests use the local PostgreSQL (`postgres` / `postgres123` on localhost:5432) and are
skipped if it is not reachable. Override with `TEST_POSTGRES_*` variables.
