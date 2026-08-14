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

Q15 area type (`rural/village` · `small town` · `large town` · `city` · `metro`) is **not** the Config `urban` / `rural` quota tag.

## Terminate logic

- Consent = No, Q1 = No, and Q2 = No stop the form immediately.
- Screener row is stored with `completion_status = 'Terminated'`.
- `termination_reason` is **pipe-separated** rule keys (e.g. `q1_not_first_time|q2_did_not_vote`).
- Terminated rows **never consume quota capacity**. Only `completion_status = 'Completed'` counts.

## Config / admin

Superadmin only: **`/admin-ftv/settings`** (nav label: Config).

- **Form open/close** (`form_status`) and auto-close when global cap is hit.
- **Global total capacity** default **200** (qualified completions).
- **City Targets**: four-level quota — global → state → urban/rural cell → city Closes At. Sum of state allocations ≤ total capacity; sum of city Closes At ≤ cell.
- State split defaults to equal (remainder first alphabetically). Odd 50:50 extra unit goes to **rural**. Per-state allocation and urban % can be overridden.
- City **Target** is auto-divided inside the cell; **Buffer** is editable; submit enforces **Closes At** = target + buffer. Status = Achieved / Closes at only (no gender quota).
- Config state must be a Q15_1 India State/UT label. `is_open` hides a city from the dropdown; `is_active` deactivates without deleting responses.
- Dropdown shows **city names only** (no state / urban labels — that would bias Q15_2). A city appears only if there is remaining room at all four levels.
- Submit codes: `city_full` · `cell_full` · `state_full` · `study_full` · `form_closed`. Completes only; terminates increment nothing.
- Soft reallocation is **manual** (threshold X% after N days, up to Y% of remaining) and is audited from-cell / to-cell / amount.
- Global full + auto-close → form closed screen; submit returns `form_closed`. Referral links still resolve to that closed screen (not 404).

**Sampling design:** 50:50 urban/rural within each state is **controlled, not PPS**. National estimates need weights. Report the unweighted urban:rural ratio at close. At N=200, more than 3 states pushes every 50:50 cell below 30.

**Explicit:** Config `urban|rural` is an operational quota tag (`cities.area_type`, snapshotted to `screener_responses.config_area_type` + `config_state`). It is **separate** from Q15_1 (voter-roll state) and Q15_2 (5-point self-reported area). Export keeps `city_area_type`, `city_state`, and `quota_cell` independent of those answers.

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
9. `supabase/migrations/009_ftv_lead_ids.sql`
10. `supabase/migrations/010_ftv_responses_analysis.sql`
11. `supabase/migrations/011_participants_age_band.sql`
12. `supabase/migrations/012_ftv_contract_hardening.sql`
13. `supabase/migrations/013_state_area_quota.sql`
14. `supabase/migrations/014_area_type_rural.sql`
15. `supabase/migrations/015_free_text_city_resolve.sql`
16. `supabase/migrations/016_screener_answers_gin.sql`
17. `supabase/migrations/017_participants_status_terminated.sql` — required if age/Q1/Q2 terminations fail with `participants_status_check`
18. `supabase/migrations/018_message_templates_ftv_cleanup.sql` — hides legacy Enamor templates from active use

Already-applied DBs: do not replay 001–014. If 013/014 are not applied yet, run them in order, then **015**. If only 015 is pending, run **015 only**.

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
3. **Bulk-import** cities (CSV/XLSX: `city`, `state`, `area_type`; optional `capacity`, `aliases`). Recalculate cell targets. Keep Unallocated ≥ 0.
4. Respondents type a free-text city. The server resolves exact → alias → unmatched (global cap only).

Optional concurrency check (after 013–015 are applied): `pnpm test:capacity`.

## Deployment

1. Create a new Supabase project and run migrations 001–015.
2. Set the env vars above on the host (never commit real keys).
3. `pnpm build` then `pnpm start`, or connect the repo to Vercel/Netlify with the same env.
4. Set `NEXT_PUBLIC_APP_URL` to the production origin.
5. Seed superadmin (`pnpm seed:admin` with production env) and import cities in Config.

## Data export

Admin **Respondents** export (CSV / Excel) includes:

- Lead ID (`CI_FTV_…`), name, mobile, DOB, city, status, timestamps
- Free-text resolve: `city_raw`, `city_resolved`, `match_type` (exact / alias / unmatched)
- Config geography independent of Q15: `city_area_type`, `city_state`, `quota_cell`
- Screener answers keyed as Q1…Q17 (plus contact fields)
- Completion status (`Completed` / `Terminated`) and pipe-separated `termination_reason`
- Timing / duration when captured
- Referral metadata (referrer, acquisition)

Payouts export follows the RazorpayX UPI template (beneficiary, UPI, amount, narration, lead id).
