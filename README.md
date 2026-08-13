# ICICI Prudential Retirement Life Goals Study

Referral, recruitment, verification, booking, CATI survey, QC, payment and referral platform for the **ICICI Prudential Retirement Life Goals Study** (ICICI RLG / RLG-v1).

## Problem Statement

Operations currently manage referrals manually:

- Participants refer friends through **WhatsApp**
- Operations teams **manually determine attribution**
- Participants **repeatedly contact operations** for status updates
- Referral progress is **not transparent**

## Solution

This application replaces manual tracking with:

- **Panel IDs** (`PNL-0001`) for every participant
- **Shareable referral links** (`/register?ref=PNL-0001`)
- **Automatic attribution** when a referred friend registers
- **Participant self-service tracking** at `/track` (Panel ID lookup) and `/track/[panelId]`
- **Operations workflow** for LEAD → FIT → COMPLETED lifecycle management

> The referral workflow is the product. The admin dashboard supports operations — it is not the product.

## Features

### Participant workflow

- Participant landing page at `/`
- Referral link lookup and copy (`/refer`, `/share/[panelId]`)
- **Share via WhatsApp** button
- Friend registration via referral link with Zod + React Hook Form validation
- Automatic referral record creation with attribution
- Self-service referral tracking with status timeline
- Registration success screen with Panel ID and referral link CTA

### Operations workflow

- Admin respondents grid: search, city/category filters, sort, pagination, **CSV/Excel export**
- **Add respondent** form at `/respondents/new` (alias: `/admin/respondents/new`)
- Admin referrals grid: search, status filter, status updates, **CSV/Excel export**
- **Dashboard metrics** with category breakdown (count + percentage)
- Forward-only lifecycle transitions (LEAD → FIT → COMPLETED)
- Status history preserved on each change
- Referral link modal per respondent row

### Data & rules

- Unique Panel IDs per respondent
- Referral status history (`statusHistory`)
- **3-month participation cool-off** after registration

## Business Rules

### 3-month cool-off

After a participant registers, they cannot register again until **3 months** have passed.

- `last_participated_at` — when they last participated
- `eligible_until` — earliest date they may participate again

If someone tries to register with a phone number still in cool-off:

> You are currently within the 3-month participation cool-off period. You may participate again after DD/MM/YYYY.

**After cool-off expires:** the same phone number may register again. The existing participant record is updated (same Panel ID) and a new referral is created.

**Phone is unique in Supabase** — returning participants re-enroll by updating the existing participant record after `eligible_until` expires.

**Demo:** Register a new participant, then try registering again with the same phone number (cool-off blocked). For re-enrollment, set `eligible_until` in the past in Supabase and register again.

## Local Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase project with PostgreSQL

### Steps

```bash
pnpm install
cp .env.example .env
# Edit .env with your Supabase URL and keys

# Run supabase/migrations/001_initial_schema.sql in Supabase SQL editor
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — the **participant portal** is the homepage.

### Environment variables

| Variable                        | Description                              |
| ------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for browser clients    |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service role key for API routes |
| `NEXT_PUBLIC_APP_URL`           | Public URL for generating referral links |

See `.env.example`.

### Useful scripts

| Script       | Description              |
| ------------ | ------------------------ |
| `pnpm dev`   | Start development server |
| `pnpm build` | Production build         |

## Demo Flow

1. **Generate referral link** — Open `/`, click “Get my referral link”, enter `PNL-0001`, copy or share via WhatsApp
2. **Register participant** — Open `/register?ref=PNL-0001`, complete the form
3. **Automatic attribution** — System creates respondent + referral with `referrerPanelId` / `referredPanelId`
4. **Update status** — Admin → Referrals → change status LEAD → FIT → COMPLETED
5. **Track referral** — Open `/track`, enter `PNL-0001`, view referred participants and referral status timeline
6. **Add respondent** — Admin → Respondents → Add respondent
7. **Export data** — Use Export CSV / Export Excel on Respondents or Referrals grids (respects current filters)

## Assessment Requirements Coverage

| Requirement            | Implemented |
| ---------------------- | ----------- |
| Referral Attribution   | ✓           |
| Participant Tracking   | ✓           |
| Status Lifecycle       | ✓           |
| Dynamic Data Form      | ✓           |
| Dashboard Metrics      | ✓           |
| Data Export            | ✓           |
| Search                 | ✓           |
| Filters                | ✓           |
| Pagination             | ✓           |
| Cool-off Rule          | ✓           |

## Project structure

```
src/
├── app/
│   ├── page.tsx              # Participant landing
│   ├── refer/                # Referral link lookup
│   ├── share/[panelId]/      # Share page
│   ├── register/             # Referred friend registration
│   ├── track/                # Participant tracking lookup + status
│   │   ├── page.tsx          # Panel ID lookup
│   │   └── [panelId]/        # Referral status for a participant
│   └── (app)/                # Admin shell (dashboard, respondents, referrals)
├── features/
│   ├── referrals/            # Referral domain logic & UI
│   └── respondents/          # Respondent admin grid
├── server/
│   └── repositories/         # Supabase data access layer
└── lib/
    ├── panel-id.ts           # Panel ID generation
    ├── supabase/             # Supabase clients and DB types
    ├── eligibility.ts        # Cool-off rules
    └── whatsapp.ts           # WhatsApp share URL
```

## Trade-offs (intentional scope)

| Included                                       | Not included                            |
| ---------------------------------------------- | --------------------------------------- |
| Automatic attribution via `?ref=`              | Authentication / roles                  |
| Self-service tracking                          | Email/SMS notifications                 |
| Status lifecycle + history                     | Cohort model (category used as segment) |
| Cool-off by phone (re-enrollment after expiry) | Authentication / roles                  |
| CSV/Excel export (filtered grids)              | TanStack Table                          |
| WhatsApp share link                            | Native WhatsApp Business API            |

## Tech stack

Next.js 15 · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase PostgreSQL · Zod · React Hook Form · xlsx
# ICICI-Prudential
# First-time-voter-survey
# First-time-voter-survey
# First-time-voter-survey
