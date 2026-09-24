# Load test

[Artillery](https://www.artillery.io/) load test for the helpdesk API ([helpdesk.yml](helpdesk.yml)).
It only **signs in and reads**: no data is created or changed, so it is safe to run against
the deployed site.

```sh
cd loadtest
npm install                                   # once

# Deployed site (~5 minutes)
read -s -p "Demo password: " HELPDESK_PASSWORD && export HELPDESK_PASSWORD && echo
npm run load -- --target https://dieilg51k5yf9.cloudfront.net

# Quick local check (20 s) against the e2e API on port 8100 (see frontend/e2e/start-api.sh)
HELPDESK_PASSWORD=Password123 npm run load:local
```

`HELPDESK_PASSWORD` is the demo accounts' password (in the cloud: the one given to or returned by
the `seed_demo_data` task). Both profiles need the demo accounts `maria.garcia@acme.inc` and
`morgan.facilities@acme.inc`.

## What it simulates

Before the test, it signs in once as an employee and an admin; visitors then reuse those
sessions, like people who are already signed in. New visitors arrive at a steady rate and each
follows one of three journeys:

| Journey | Share | Requests |
| --- | --- | --- |
| Employee checks their incidents | 60% | `/auth/me`, their dashboard summary, their incident list, then (after 1 s) an incident with its notes and history |
| Admin monitors facilities | 30% | the admin dashboard summary (the heaviest query), pending requests, active incidents by priority, buildings |
| Someone signs in | 10% | `POST /auth/login` (password hashing, the most expensive request) |

**Profiles** (`-e`): `cloud`: 60 s at 2 new visitors/s, a 2-minute ramp to 10/s, then 2 minutes
at 10/s: about 2,000 visitors and 10,000 requests. `local`: 20 s at 2/s.

## Pass / fail

The run exits non-zero (and prints `fail:` under **Checks**) unless:

- fewer than **1%** of visitors had a failed request (any non-2xx response, timeout or error),
- **95%** of requests finished within **2 s**, and **99%** within **5 s**.

Per-endpoint timings are in the summary under `plugins.metrics-by-endpoint.response_time.<name>`.
While it runs, the Lambda's own numbers can be followed with
`aws logs tail /aws/lambda/coding-workshop-helpdesk-$PARTICIPANT_ID --follow --format short | grep REPORT`.

## Results

p95 / p99 for the deployed site are the Lambda's own durations (from its `REPORT` log lines)
for the test window; Artillery's checks (error rate, p95, p99 as seen by the client) all passed.

| Run | Visitors | Requests | Failed | p95 | p99 | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Local check (uvicorn, 1 process) | 40 | 208 | 0 | 25 ms | 34 ms | Median 7 ms; sign-in 48 ms |
| Deployed site (128 MB Lambda, Aurora Serverless v2), 2026-09-24 | ~2,000 | 9,884 | 0 (all checks passed) | 495 ms | 934 ms | Median 155 ms; peak ~48 requests/s; Lambda memory max 121 MB (never at the 128 MB limit); 18 cold starts (~2.9 s to load); slowest: the first request, 17 s, while Aurora resumed from its idle pause |
