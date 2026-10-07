-- 12 · Varios correos de contacto por cliente y envío automático semanal del
-- estado de cuenta.
-- Solo agrega o ajusta: no borra tablas, columnas ni filas.
--
-- Cómo funciona el envío automático:
--   pg_cron corre cada hora dispatch_weekly_statements(). Si a ese usuario le
--   toca (día y hora de Caracas configurados en company_settings), crea una
--   corrida en statement_runs con un token de un solo uso y le pide a la app
--   (app_url + /api/estados-semanales) que la procese. La app lee los datos de
--   esa corrida con statement_run_data(run, token), arma y envía cada correo con
--   su PDF, anota cada envío con statement_run_log y cierra con
--   statement_run_finish. Así la app no necesita la clave de servicio.

-- 1. Contactos ------------------------------------------------------------------
-- contacts = [{ "name": "Administración", "email": "pagos@cliente.com" }, …]
-- Presupuestos y estados de cuenta van a todos. clients.email (columna vieja,
-- obligatoria) queda con el primer correo de la lista.
alter table public.clients
  add column if not exists contacts jsonb not null default '[]'::jsonb,
  add column if not exists auto_statement boolean not null default true;

-- El correo que ya tenía cada cliente pasa a ser su primer contacto
update public.clients
   set contacts = jsonb_build_array(jsonb_build_object('name', '', 'email', trim(email)))
 where contacts = '[]'::jsonb
   and coalesce(trim(email), '') <> '';

-- 2. Programación del envío semanal -----------------------------------------------
alter table public.company_settings
  add column if not exists statement_auto boolean not null default false,
  add column if not exists statement_weekday smallint not null default 1,
  add column if not exists statement_hour smallint not null default 8,
  add column if not exists statement_scope varchar(10) not null default 'late',
  add column if not exists app_url varchar(200);

comment on column public.company_settings.statement_weekday is '0 domingo … 6 sábado (hora de Caracas)';
comment on column public.company_settings.statement_scope is 'late = solo clientes con vencido · open = todos los que tienen saldo';
comment on column public.company_settings.app_url is 'Dirección pública de la app (la registra la app al abrirse por https)';

do $$
begin
  alter table public.company_settings
    add constraint company_settings_statement_check
    check (statement_weekday between 0 and 6 and statement_hour between 0 and 23 and statement_scope in ('late', 'open'));
exception when duplicate_object then null;
end $$;

-- 3. Corridas y registro de envíos -----------------------------------------------
create table if not exists public.statement_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Día (Caracas) al que corresponde el envío: uno por semana
  slot date not null,
  token text not null,
  attempts smallint not null default 1,
  dispatched_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  summary jsonb
);
create unique index if not exists statement_runs_user_slot_key on public.statement_runs (user_id, slot);
-- Sin políticas: solo la leen y escriben las funciones de abajo
alter table public.statement_runs enable row level security;

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  run_id uuid references public.statement_runs (id) on delete set null,
  kind varchar(12) not null check (kind in ('statement', 'budget')),
  -- manual = desde la app · auto = envío semanal · test = prueba enviada a uno mismo
  origin varchar(8) not null default 'manual' check (origin in ('manual', 'auto', 'test')),
  client_name text not null,
  budget_id uuid references public.budgets (id) on delete set null,
  recipients text[] not null default '{}',
  subject text,
  amount numeric(14, 2),
  status varchar(8) not null default 'sent' check (status in ('sent', 'error')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_user_created_idx on public.email_log (user_id, created_at desc);
create index if not exists email_log_run_idx on public.email_log (run_id);
alter table public.email_log enable row level security;

do $$
begin
  create policy "Users can read own email log" on public.email_log
    for select using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can add to own email log" on public.email_log
    for insert with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

-- 4. Funciones que usa la app durante una corrida ---------------------------------
-- Las llama /api/estados-semanales con la clave pública: el token de la corrida
-- (de un solo uso, vence a las 3 horas) es la autorización.

create or replace function public.statement_run_data(p_run uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.statement_runs;
begin
  select * into r from public.statement_runs
   where id = p_run and token = p_token and finished_at is null
     and dispatched_at > now() - interval '3 hours';
  if not found then
    raise exception 'Corrida inválida o vencida' using errcode = '28000';
  end if;
  update public.statement_runs set started_at = now() where id = r.id;
  return jsonb_build_object(
    'today', (now() at time zone 'America/Caracas')::date,
    'settings', (select to_jsonb(s) - 'company_logo_url' from public.company_settings s where s.user_id = r.user_id limit 1),
    'budgets', coalesce((select jsonb_agg(to_jsonb(b)) from public.budgets b where b.user_id = r.user_id and b.status <> 'cancelled'), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.budget_payments p where p.user_id = r.user_id), '[]'::jsonb),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email, 'contacts', c.contacts, 'auto_statement', c.auto_statement))
        from public.clients c where c.user_id = r.user_id
    ), '[]'::jsonb),
    -- Clientes que ya recibieron el correo en esta corrida (por si se reintenta)
    'sent', coalesce((select jsonb_agg(l.client_name) from public.email_log l where l.run_id = r.id and l.status = 'sent'), '[]'::jsonb)
  );
end;
$$;

create or replace function public.statement_run_log(
  p_run uuid,
  p_token text,
  p_client text,
  p_recipients text[],
  p_subject text,
  p_amount numeric,
  p_status text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_log (user_id, run_id, kind, origin, client_name, recipients, subject, amount, status, error)
  select r.user_id, r.id, 'statement', 'auto', left(p_client, 255), coalesce(p_recipients, '{}'), left(p_subject, 300),
         p_amount, case when p_status = 'sent' then 'sent' else 'error' end, left(p_error, 500)
    from public.statement_runs r
   where r.id = p_run and r.token = p_token and r.finished_at is null;
  if not found then
    raise exception 'Corrida inválida o vencida' using errcode = '28000';
  end if;
end;
$$;

create or replace function public.statement_run_finish(p_run uuid, p_token text, p_summary jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.statement_runs
     set finished_at = now(), summary = p_summary
   where id = p_run and token = p_token and finished_at is null;
  if not found then
    raise exception 'Corrida inválida o vencida' using errcode = '28000';
  end if;
end;
$$;

revoke all on function public.statement_run_data(uuid, text) from public;
revoke all on function public.statement_run_log(uuid, text, text, text[], text, numeric, text, text) from public;
revoke all on function public.statement_run_finish(uuid, text, jsonb) from public;
-- Solo el rol anon: la app las llama sin sesión, con el token de la corrida
grant execute on function public.statement_run_data(uuid, text) to anon;
grant execute on function public.statement_run_log(uuid, text, text, text[], text, numeric, text, text) to anon;
grant execute on function public.statement_run_finish(uuid, text, jsonb) to anon;
revoke execute on function public.statement_run_data(uuid, text) from authenticated;
revoke execute on function public.statement_run_log(uuid, text, text, text[], text, numeric, text, text) from authenticated;
revoke execute on function public.statement_run_finish(uuid, text, jsonb) from authenticated;

-- 5. Programador ---------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Corre cada hora. Solo actúa el día y a partir de la hora configurados; si la
-- app no termina la corrida (Render dormido, caída), la reintenta en la hora
-- siguiente hasta 3 veces ese mismo día. Devuelve cuántas corridas despachó.
create or replace function public.dispatch_weekly_statements()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  r public.statement_runs;
  v_local timestamp := now() at time zone 'America/Caracas';
  v_slot date := (now() at time zone 'America/Caracas')::date;
  n integer := 0;
begin
  for s in
    select cs.user_id, cs.app_url
      from public.company_settings cs
     where cs.statement_auto
       and cs.user_id is not null
       and cs.app_url ~ '^https://'
       and cs.statement_weekday = extract(dow from v_local)::int
       and cs.statement_hour <= extract(hour from v_local)::int
  loop
    select * into r from public.statement_runs where user_id = s.user_id and slot = v_slot;
    if found then
      continue when r.finished_at is not null
                 or r.attempts >= 3
                 or r.dispatched_at > now() - interval '50 minutes';
      update public.statement_runs
         set token = encode(extensions.gen_random_bytes(24), 'hex'),
             attempts = attempts + 1,
             dispatched_at = now()
       where id = r.id
      returning * into r;
    else
      insert into public.statement_runs (user_id, slot, token)
      values (s.user_id, v_slot, encode(extensions.gen_random_bytes(24), 'hex'))
      returning * into r;
    end if;
    perform net.http_post(
      url := rtrim(s.app_url, '/') || '/api/estados-semanales',
      body := jsonb_build_object('run', r.id, 'token', r.token),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      -- Render puede estar dormido: despertar y generar los PDF toma su tiempo
      timeout_milliseconds := 300000
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.dispatch_weekly_statements() from public, anon, authenticated;

select cron.schedule('apex-estados-de-cuenta-semanales', '0 * * * *', 'select public.dispatch_weekly_statements()');
