-- 11 · Cobros en bolívares, aprobación y anticipo de presupuestos, datos del
-- emisor y seguridad.
-- Solo agrega o ajusta: no borra tablas, columnas ni filas.

-- 1. Pagos en bolívares ------------------------------------------------------
-- `amount` sigue siendo lo que se abona al presupuesto, en USD (lo usan los
-- triggers de saldo). Si el pago llegó en Bs se guardan además el monto en Bs
-- y la tasa usada: amount = amount_ves / exchange_rate.
alter table public.budget_payments
  add column if not exists currency varchar(3) not null default 'USD',
  add column if not exists amount_ves numeric(16, 2),
  add column if not exists exchange_rate numeric(16, 4);

do $$
begin
  alter table public.budget_payments
    add constraint budget_payments_currency_check check (currency in ('USD', 'VES'));
exception when duplicate_object then null;
end $$;

-- 2. Datos del emisor para los PDF (antes estaban fijos en el código) ---------
alter table public.company_settings
  add column if not exists payment_phone varchar(40),
  add column if not exists payment_bank varchar(80),
  add column if not exists payment_account varchar(40),
  add column if not exists payment_id_number varchar(40),
  add column if not exists contact_email varchar(120),
  add column if not exists website varchar(120),
  add column if not exists due_days integer not null default 7;

update public.company_settings set
  payment_phone = coalesce(payment_phone, '04242864675'),
  payment_bank = coalesce(payment_bank, 'Banesco'),
  payment_account = coalesce(payment_account, '01340946350001464332'),
  payment_id_number = coalesce(payment_id_number, 'V-26682963'),
  contact_email = coalesce(contact_email, 'edwin.dev.21114@gmail.com'),
  website = coalesce(website, 'apexconsulting-it.site');

-- 3. Aprobación y anticipo ------------------------------------------------------
-- Un presupuesto solo es cuenta por cobrar cuando el cliente lo aprueba.
-- approved_on = día de la aprobación (null = por aprobar). Los presupuestos que
-- ya existían quedan aprobados el día de su emisión, salvo los cancelados; así
-- los saldos de hoy no cambian. El bloque corre una sola vez.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'budgets' and column_name = 'approved_on'
  ) then
    alter table public.budgets add column approved_on date;
    update public.budgets set approved_on = date where status <> 'cancelled';
  end if;
end $$;

-- Anticipo (modalidad prepago): un porcentaje del total (50 % por lo general)
-- o un monto fijo en USD. null = se cobra todo al vencer (post-pago).
alter table public.budgets
  add column if not exists advance_type varchar(10),
  add column if not exists advance_value numeric(14, 2);

do $$
begin
  alter table public.budgets
    add constraint budgets_advance_check
    check (advance_type is null or (advance_type in ('percent', 'amount') and advance_value > 0));
exception when duplicate_object then null;
end $$;

-- 4. Estado de pago coherente ---------------------------------------------------
-- Antes, al editar el total de un presupuesto con abonos (o al reactivar uno
-- cancelado), payment_status y status quedaban desfasados del saldo real.
-- Un abono a un presupuesto por aprobar lo aprueba (el anticipo es la aprobación).
create or replace function public.sync_budget_payment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.paid_amount > 0 and new.approved_on is null and new.status <> 'cancelled' then
    new.approved_on := (now() at time zone 'America/Caracas')::date;
  end if;
  new.payment_status := case
    when new.paid_amount >= new.total and new.total > 0 then 'paid'
    when new.paid_amount > 0 then 'partial'
    else 'unpaid'
  end;
  if new.status <> 'cancelled' then
    new.status := case when new.paid_amount >= new.total and new.total > 0 then 'paid' else 'pending' end;
  end if;
  return new;
end;
$$;

create or replace trigger sync_budget_payment_status
  before update of total, status, paid_amount on public.budgets
  for each row execute function public.sync_budget_payment_status();

-- Un número de presupuesto no se repite para el mismo usuario.
create unique index if not exists budgets_user_number_key on public.budgets (user_id, number);
create index if not exists budgets_user_id_date_idx on public.budgets (user_id, date desc);

-- 5. Seguridad -------------------------------------------------------------------
-- Facturas y sus ítems estaban sin RLS: cualquiera con la clave pública podía
-- leerlas o escribirlas. Se protegen igual que el resto (las tablas se conservan).
alter table public.invoices enable row level security;
alter table public.budget_invoice_items enable row level security;

do $$
begin
  create policy "Users can manage own invoices" on public.invoices
    for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can manage own budget invoice items" on public.budget_invoice_items
    for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

-- auth.uid() evaluado una sola vez por consulta, no por fila.
alter policy "Users can manage own budgets" on public.budgets
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can manage own budget payments" on public.budget_payments
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can manage own clients" on public.clients
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can manage own company settings" on public.company_settings
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can manage own hour entries" on public.hour_entries
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can manage own hour quotes" on public.hour_quotes
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can manage own profile" on public.user_profiles
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Funciones con search_path fijo.
alter function public.update_updated_at_column() set search_path = '';
alter function public.update_budget_payment_status() set search_path = public;
alter function public.get_next_invoice_number(uuid) set search_path = public;

-- El siguiente número ya no corre con privilegios de dueño ni lo llama un
-- visitante sin sesión: con RLS cada usuario solo ve sus presupuestos.
alter function public.get_next_budget_number(uuid) security invoker set search_path = public;
revoke execute on function public.get_next_budget_number(uuid) from public, anon;
grant execute on function public.get_next_budget_number(uuid) to authenticated;
