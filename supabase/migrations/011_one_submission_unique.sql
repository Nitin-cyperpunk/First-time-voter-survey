-- T-11: Enforce one screener and one survey submission per lead_id.

-- ---------------------------------------------------------------------------
-- screener_responses: dedupe, require lead_id, full UNIQUE(lead_id)
-- ---------------------------------------------------------------------------

delete from screener_responses a
using screener_responses b
where a.lead_id is not null
  and a.lead_id = b.lead_id
  and a.ctid > b.ctid;

delete from screener_responses where lead_id is null;

drop index if exists idx_screener_responses_lead_id_unique;

alter table screener_responses alter column lead_id set not null;

create unique index if not exists idx_screener_responses_lead_id_unique
  on screener_responses(lead_id);

-- ---------------------------------------------------------------------------
-- survey_responses: dedupe before relying on unique index
-- ---------------------------------------------------------------------------

delete from survey_responses a
using survey_responses b
where a.lead_id = b.lead_id
  and a.ctid > b.ctid;

notify pgrst, 'reload schema';
