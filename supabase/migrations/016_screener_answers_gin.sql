-- Incremental only. Do NOT replay 001–015.
-- GIN index for nested FTV-style answers JSONB queries.
-- answers is already jsonb not null — no ALTER COLUMN.

begin;

create index if not exists screener_responses_answers_gin_idx
on public.screener_responses
using gin (answers jsonb_path_ops);

comment on column public.screener_responses.answers is
  'Raw questionnaire response stored as nested JSONB. answers->''responses'' is an array with one entry per answer: qid, question, type, answer_code, answer.';

commit;
