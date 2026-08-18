-- Migration 025: Flag both sides of a fingerprint duplicate cluster.
--
-- OPERATIVE RULE (must be preserved in code comments and here):
--   FINGERPRINT match (including "both") → both sides INELIGIBLE, excluded from
--   clean, no reward. A fingerprint identifies the same device with high confidence.
--
--   IP-ONLY match → flagged for REVIEW only. Still counted as clean, still payable.
--   Reasoning: CGNAT in India means hundreds of mobile users share one public IP,
--   and household members share a home connection. Withholding money on IP alone
--   penalises a large number of genuine respondents.
--
-- These are two SEPARATELY QUERYABLE states, not one shared flag.
--
-- DO NOT RUN THIS MIGRATION without first reviewing the backfill counts from
-- scripts/_backfill_fingerprint_clusters.mjs.
--
-- Run command (after review):
--   npx supabase db push  (or supabase migration up in CI)

-- 1. Cluster identifier: shared UUID on every member of a fingerprint cluster.
--    NULL for records with no fingerprint duplicate relationship.
alter table participants
  add column if not exists duplicate_cluster_id uuid default null;

-- 2. Mark whether this record is the chronologically FIRST member of its cluster
--    (the "original"). The original is now also flagged ineligible (duplicate_flag=true),
--    but this field preserves who came first for QC and appeals.
alter table participants
  add column if not exists is_fingerprint_cluster_original boolean default false;

-- 3. Gaming pattern label: distinct value when the earlier record was TERMINATED
--    and a later same-device record COMPLETED — strongest signal of screener evasion.
--    NULL = not a gaming pattern. 'screener_evasion' = pattern detected.
alter table participants
  add column if not exists duplicate_gaming_pattern text default null;

-- Constraint: only allow the defined value or null.
alter table participants
  add constraint chk_duplicate_gaming_pattern
  check (duplicate_gaming_pattern is null or duplicate_gaming_pattern = 'screener_evasion');

-- 4. Indexes for efficient filtering.
create index if not exists idx_participants_cluster_id
  on participants (duplicate_cluster_id)
  where duplicate_cluster_id is not null;

create index if not exists idx_participants_cluster_original
  on participants (is_fingerprint_cluster_original)
  where is_fingerprint_cluster_original = true;

-- 5. Column comments.
comment on column participants.duplicate_cluster_id is
  'Shared UUID assigned to every member of a fingerprint-matched cluster. '
  'NULL if not part of any fingerprint cluster. '
  'All members with this ID are ineligible for reward.';

comment on column participants.is_fingerprint_cluster_original is
  'True if this record is the chronologically FIRST entry in its fingerprint cluster. '
  'The original is still ineligible (duplicate_flag=true) but this field '
  'distinguishes it from later entries for QC and appeals.';

comment on column participants.duplicate_gaming_pattern is
  'Set to ''screener_evasion'' when this completed record belongs to a device '
  'that previously submitted a TERMINATED record — the strongest signal of '
  'deliberate screener manipulation. NULL otherwise.';
