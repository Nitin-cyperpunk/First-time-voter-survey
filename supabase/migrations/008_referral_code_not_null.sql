-- T-15: Enforce referral_code NOT NULL and full UNIQUE constraint.

create or replace function generate_en_referral_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text;
  suffix text;
  i int;
begin
  loop
    suffix := '';
    for i in 1..6 loop
      suffix := suffix || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::int,
        1
      );
    end loop;
    code := 'EN' || suffix;

    if not exists (
      select 1 from participants where referral_code = code
    ) then
      return code;
    end if;
  end loop;
end;
$$;

do $$
declare
  participant_row record;
  new_code text;
begin
  for participant_row in
    select lead_id from participants where referral_code is null
  loop
    loop
      new_code := generate_en_referral_code();
      begin
        update participants
        set referral_code = new_code
        where lead_id = participant_row.lead_id;
        exit;
      exception
        when unique_violation then
          null;
      end;
    end loop;
  end loop;
end $$;

drop function generate_en_referral_code();

drop index if exists idx_participants_referral_code;
create unique index if not exists idx_participants_referral_code
  on participants(referral_code);

alter table participants alter column referral_code set not null;

notify pgrst, 'reload schema';
