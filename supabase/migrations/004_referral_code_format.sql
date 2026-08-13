

create or replace function generate_en_participant_code()
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
      select 1 from participants where participant_code = code
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
  for participant_row in select id from participants order by created_at loop
    loop
      new_code := generate_en_participant_code();
      begin
        update participants
        set participant_code = new_code
        where id = participant_row.id;
        exit;
      exception
        when unique_violation then
          null;
      end;
    end loop;
  end loop;
end;
$$;

drop function generate_en_participant_code();

notify pgrst, 'reload schema';
