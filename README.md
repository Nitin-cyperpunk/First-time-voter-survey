# First-Time Voters Study

Independent academic research on the factors shaping first-time voter behaviour in the **2024 Indian Lok Sabha election**. Run by **Concave Insights**.

Internal name: `first-time-voters` · Slug: `ftv` · Survey version: **FTV-v1** · Short display: **Voters Study**

This repo is a respondent intake, referral, verification, payout, and admin platform. There is **no main survey** — respondents complete a single screener (consent + Q1–Q17).

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Auth | Supabase Auth (admin) + participant cookie sessions |
| Database | Supabase Postgres |
| Package manager | pnpm |
| Hosting | Any Node host (Vercel / Netlify / similar) that can run `next start` |

Admin UI is mounted at **`/admin-ftv`**. Respondent form is `/` and `/register`. Referral links are `/r/{code}` and `/ref/{code}`.

## Respondent flow

1. **Consent** — required. No → terminate.
2. **Contact** — name, phone, city (config city list), DOB (and optional email / area / PIN).
3. **Single screener** Q1–Q17.
4. **Terminate** (Q1 = No or Q2 = No, or consent = No) **or completion**.
5. Thank-you + optional referral share / Instagram verification.

Qualified completions consume city + global capacity. Terminated and abandoned responses **do not**.

## Questionnaire structure (FTV-v1)

| Item | Content |
| --- | --- |
| Consent | Gate. No → terminate. |
| Q1 | First-time eligibility for 2024 LS. **No = terminate.** |
| Q2 | Did you vote? **No = terminate.** |
| Q3 | Party / candidate voted for |
| Q4 | Pre-election certainty |
| Q5 | Economic vs other factors |
| Q6 | Factor influence matrix, 1–5, **9 economic + 10 non-economic**, row order randomised |
| Q7 | Top-3 ranked from **17** options |
| Q8 | Information sources, multi-select **max 3** |
| Q9 | Family alignment |
| Q10 | Household finances change |
| Q11 | Rising prices impact |
| Q12 | Employment confidence |
| Q13 | Economy rating |
| Q14 | Government effectiveness matrix, 1–5, **6 items**, randomised |
| Q15 | Profiling: age (from DOB), gender, State/UT, **5-point self-reported area type**, education |
| Q16 | Household income |
| Q17 | Open verbatim, **optional** |

Q15 area type (`rural/village` · `small town` · `large town` · `city` · `metro`) is **not** the Config urban|local tag.

## Terminate logic

- Consent = No, Q1 = No, and Q2 = No stop the form immediately.
- Screener row is stored with `completion_status = 'Terminated'`.
- `termination_reason` is **pipe-separated** rule keys (e.g. `q1_not_first_time|q2_did_not_vote`).
- Terminated rows **never consume quota capacity**. Only `completion_status = 'Completed'` counts.

## Config / admin

Superadmin only: **`/admin-ftv/settings`** (nav label: Config).

- **Form open/close** (`form_status`) and auto-close when global cap is hit.
- **Global total capacity** default **200** (qualified completions).
- **Cities**: name, State/UT, operational **`urban` \| `local`** tag, per-city capacity. Sum of **active** city capacities cannot exceed total capacity (live Unallocated).
- City full → hidden from the respondent selector; submit returns `region_full`.
- Global full + auto-close → form closed screen; submit returns `form_closed`. Referral links still resolve to that closed screen (not 404).
- Audit log for form status, total capacity, and city capacity.

**Explicit:** Config `urban|local` is an operational quota tag. It is stored on `cities.area_type` and snapshotted to `screener_responses.config_area_type`. It is **separate** from Q15 self-reported 5-point area type (`screener_responses.self_reported_area_type`).

Admin login: `/admin-ftv/login`.

## Referral system

- Each participant gets a unique code (`FTV` + 6 Crockford-ish chars) and lead id (`CI_FTV_0001` …).
- Share links: `/r/{code}` and tracked `/r/w|i|c/{code}`; `/ref/{code}` also works.
- Friend opens the link → attribution is stored → they complete FTV-v1.
- **Reward attribution fires on screener completion** (qualified completion), not on a later main survey (there is none).
- Payouts / UPI remain on the existing admin Payouts tab.

## Local setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- A **new** empty Supabase project (do not reuse an old study project)

### Install

```bash
pnpm install
cp .env.example .env
# Fill .env with the NEW project values (see below)
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | New Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes* | Anon / publishable key |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes* | Alternative to anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key (server only) |
| `NEXT_PUBLIC_APP_URL` | yes | Public origin for referral links |
| `NEXT_PUBLIC_INSTAGRAM_USERNAME` | no | Instagram handle for DM deep links (no `@`) |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | no | WhatsApp business number, digits only with country code |
| `ADMIN_SEED_EMAIL` | seed only | Superadmin email for `pnpm seed:admin` |
| `ADMIN_SEED_PASSWORD` | seed only | Superadmin password |
| `ADMIN_SEED_NAME` | seed only | Superadmin display name |

\* Provide **one** of the anon / publishable keys.

### Migrations (fresh DB)

In the Supabase SQL editor, run **in order**:

1. `supabase/migrations/001_core_schema.sql`
2. `supabase/migrations/002_identity_referrals.sql`
3. `supabase/migrations/003_screener_lifecycle.sql`
4. `supabase/migrations/004_eligibility_verify.sql`
5. `supabase/migrations/005_ops_terminations.sql`
6. `supabase/migrations/006_fingerprint_admin.sql`
7. `supabase/migrations/007_study_config.sql`
8. `supabase/migrations/008_config_cities_capacity.sql`

Do not skip 008 — city quotas and atomic capacity enforcement live there.

Then:

```bash
pnpm seed:admin
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the respondent form. Admin: [http://localhost:3000/admin-ftv/login](http://localhost:3000/admin-ftv/login).

### Seed cities

There is no SQL city seed. After login as superadmin:

1. Open **Config** (`/admin-ftv/settings`).
2. Set **Total capacity** (default 200).
3. Add cities with State/UT, **urban or local**, and a capacity. Keep Unallocated ≥ 0.
4. Only **active, non-full** cities appear on the respondent city selector.

Optional concurrency check (after 008 is applied): `pnpm test:capacity`.

## Deployment

1. Create a new Supabase project and run migrations 001–008.
2. Set the env vars above on the host (never commit real keys).
3. `pnpm build` then `pnpm start`, or connect the repo to Vercel/Netlify with the same env.
4. Set `NEXT_PUBLIC_APP_URL` to the production origin.
5. Seed superadmin (`pnpm seed:admin` with production env) and add cities in Config.

## Data export

Admin **Respondents** export (CSV / Excel) includes:

- Lead ID (`CI_FTV_…`), name, mobile, DOB, city, status, timestamps
- Screener answers keyed as Q1…Q17 (plus contact fields)
- Completion status (`Completed` / `Terminated`) and pipe-separated `termination_reason`
- Timing / duration when captured
- Referral metadata (referrer, acquisition)

Payouts export follows the RazorpayX UPI template (beneficiary, UPI, amount, narration, lead id).
