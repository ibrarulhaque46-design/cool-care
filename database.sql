-- =====================================================================
--  Ibrar & Brothers Cool Care  -  Database setup
--  Supabase -> SQL Editor -> New query -> yeh poora paste karein -> Run
--  (Dobara chalane se data delete nahi hota)
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'pending' check (role in ('owner','staff','pending')),
  created_at  timestamptz not null default now()
);

create table if not exists public.items (
  id          bigint generated always as identity primary key,
  name        text not null,
  company     text,
  category    text,
  unit        text not null default 'piece' check (unit in ('piece','kg','litre','meter','feet','gaz')),
  stock       numeric(14,3) not null default 0,
  min_stock   numeric(14,3) not null default 0,
  sale_price  numeric(14,2) not null default 0,     -- rate per 1 unit (per kg, per piece ...)
  pack_name   text,                                 -- e.g. Cylinder
  pack_size   numeric(14,3),                        -- e.g. 13.6 (kg)
  pack_price  numeric(14,2),                        -- price of full pack
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Purchase price alag table mein, taake staff na dekh sake
create table if not exists public.item_costs (
  item_id        bigint primary key references public.items(id) on delete cascade,
  purchase_price numeric(14,2) not null default 0
);

create table if not exists public.sales (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  seller_name  text,
  customer     text,
  discount     numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  summary      text,
  device       text,
  voided       boolean not null default false
);

create table if not exists public.sale_lines (
  id            bigint generated always as identity primary key,
  sale_id       bigint not null references public.sales(id) on delete cascade,
  item_id       bigint references public.items(id),
  item_name     text,
  qty           numeric(14,3) not null,      -- item ki asal unit mein (kg, piece ...)
  entered_qty   numeric(14,3),
  entered_unit  text,
  amount        numeric(14,2) not null,
  cost          numeric(14,2) not null default 0
);

create table if not exists public.purchases (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) default auth.uid(),
  item_id     bigint references public.items(id),
  item_name   text,
  qty         numeric(14,3) not null,
  unit_cost   numeric(14,2) not null default 0,
  total_cost  numeric(14,2) not null default 0,
  supplier    text,
  note        text
);

-- ---------- Version 2: Customers / Udhaar khata / Stock adjustment ----------
create table if not exists public.customers (
  id            bigint generated always as identity primary key,
  name          text not null,
  phone         text,
  area          text,
  credit_limit  numeric(14,2) not null default 0,   -- 0 = koi had nahi
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Sale: Cash ya Udhaar (credit), aur kis customer ko
alter table public.sales add column if not exists payment text not null default 'cash';
alter table public.sales add column if not exists customer_id bigint references public.customers(id);
alter table public.sales drop constraint if exists sales_payment_check;
alter table public.sales add constraint sales_payment_check check (payment in ('cash','credit'));

-- Udhaar ki wasooli (customer ne paise wapis diye)
create table if not exists public.khata_payments (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) default auth.uid(),
  customer_id  bigint not null references public.customers(id),
  amount       numeric(14,2) not null check (amount > 0),
  note         text
);

-- Stock ki durusti (toot phoot, gum, ginti ka farq)
create table if not exists public.stock_adjustments (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) default auth.uid(),
  item_id     bigint references public.items(id),
  item_name   text,
  qty         numeric(14,3) not null,               -- + barha, - kam hua
  reason      text
);

-- ---------- Version 3: Item return (maal wapis) ----------
create table if not exists public.sale_returns (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) default auth.uid(),
  seller_name  text,                                   -- kis ne return liya
  customer_id  bigint references public.customers(id),
  payment      text not null default 'credit',         -- credit = khata kam, cash = paise wapis
  total        numeric(14,2) not null default 0,
  summary      text,
  note         text
);
create table if not exists public.return_lines (
  id            bigint generated always as identity primary key,
  return_id     bigint not null references public.sale_returns(id) on delete cascade,
  sale_line_id  bigint not null references public.sale_lines(id),
  sale_id       bigint references public.sales(id),
  item_id       bigint references public.items(id),
  item_name     text,
  qty           numeric(14,3) not null,                -- item ki asal unit mein
  amount        numeric(14,2) not null,
  cost          numeric(14,2) not null default 0
);
create index if not exists return_lines_line_idx  on public.return_lines(sale_line_id);
create index if not exists return_lines_sale_idx  on public.return_lines(sale_id);
create index if not exists sale_returns_cust_idx  on public.sale_returns(customer_id);
create index if not exists sale_returns_time_idx  on public.sale_returns(created_at);

create index if not exists sales_customer_idx     on public.sales(customer_id);
create index if not exists khata_customer_idx     on public.khata_payments(customer_id);
create index if not exists adjust_created_idx     on public.stock_adjustments(created_at);
create index if not exists sales_created_idx      on public.sales(created_at);
create index if not exists sale_lines_sale_idx    on public.sale_lines(sale_id);
create index if not exists purchases_created_idx  on public.purchases(created_at);

-- ---------- Role helper ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Naya user: pehla user OWNER, baaqi sab "pending" (owner approve karega)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles where role = 'owner') then 'pending' else 'owner' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Jo users pehle se bane hon un ki profile bhi bana do
insert into public.profiles (id, email, full_name, role)
select u.id, u.email, split_part(u.email, '@', 1), 'pending'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

update public.profiles set role = 'owner'
where id = (select id from public.profiles order by created_at limit 1)
  and not exists (select 1 from public.profiles where role = 'owner');

-- ---------- Security (RLS) ----------
alter table public.profiles   enable row level security;
alter table public.items      enable row level security;
alter table public.item_costs enable row level security;
alter table public.sales      enable row level security;
alter table public.sale_lines enable row level security;
alter table public.purchases  enable row level security;
alter table public.customers  enable row level security;
alter table public.khata_payments    enable row level security;
alter table public.stock_adjustments enable row level security;

-- Customers: staff udhaar sale ke liye customer chun aur bana sakta hai, badal/mita sirf owner
drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (public.my_role() in ('owner','staff'));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.my_role() in ('owner','staff'));
create policy customers_update on public.customers for update to authenticated
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- Wasooli aur stock durusti: sirf owner
drop policy if exists khata_owner on public.khata_payments;
create policy khata_owner on public.khata_payments for all to authenticated
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
drop policy if exists adjust_owner on public.stock_adjustments;
create policy adjust_owner on public.stock_adjustments for select to authenticated
  using (public.my_role() = 'owner');

-- Returns: seedha sirf owner dekhe; staff sirf functions ke zariye (customer_statement, create_return)
alter table public.sale_returns enable row level security;
alter table public.return_lines enable row level security;
drop policy if exists returns_owner on public.sale_returns;
create policy returns_owner on public.sale_returns for select to authenticated
  using (public.my_role() = 'owner');
drop policy if exists return_lines_owner on public.return_lines;
create policy return_lines_owner on public.return_lines for select to authenticated
  using (public.my_role() = 'owner');

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() = 'owner');
create policy profiles_update on public.profiles for update to authenticated
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

drop policy if exists items_select on public.items;
drop policy if exists items_insert on public.items;
drop policy if exists items_update on public.items;
drop policy if exists items_delete on public.items;
create policy items_select on public.items for select to authenticated
  using (public.my_role() in ('owner','staff'));
create policy items_insert on public.items for insert to authenticated
  with check (public.my_role() = 'owner');
create policy items_update on public.items for update to authenticated
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
create policy items_delete on public.items for delete to authenticated
  using (public.my_role() = 'owner');

drop policy if exists item_costs_owner on public.item_costs;
create policy item_costs_owner on public.item_costs for all to authenticated
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

drop policy if exists sales_select on public.sales;
-- Owner sab sales dekhta hai, staff sirf apni
create policy sales_select on public.sales for select to authenticated
  using (public.my_role() = 'owner' or (public.my_role() = 'staff' and created_by = auth.uid()));

drop policy if exists sale_lines_owner on public.sale_lines;
create policy sale_lines_owner on public.sale_lines for select to authenticated
  using (public.my_role() = 'owner');

drop policy if exists purchases_owner on public.purchases;
create policy purchases_owner on public.purchases for select to authenticated
  using (public.my_role() = 'owner');

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- ---------- Sale (stock khud kam hota hai) ----------
-- purana version (bina Cash/Udhaar) hata do
drop function if exists public.create_sale(jsonb, text, numeric, text);
create or replace function public.create_sale(
  p_lines jsonb, p_customer text default null, p_discount numeric default 0, p_device text default null,
  p_payment text default 'cash', p_customer_id bigint default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_sale bigint; v_line jsonb; v_item public.items%rowtype;
  v_qty numeric; v_amt numeric; v_cost numeric; v_total numeric := 0; v_summary text := ''; v_name text;
  v_cust text := nullif(trim(p_customer), '');
begin
  if coalesce(public.my_role(), '') not in ('owner','staff') then
    raise exception 'You are not allowed to make sales';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'The bill has no items';
  end if;
  if coalesce(p_payment, 'cash') not in ('cash','credit') then
    raise exception 'Invalid payment type';
  end if;
  if p_payment = 'credit' and p_customer_id is null then
    raise exception 'Select a customer for an udhaar (credit) sale';
  end if;
  if p_customer_id is not null then
    select name into v_cust from public.customers where id = p_customer_id and active;
    if not found then raise exception 'Customer not found'; end if;
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.sales (created_by, seller_name, customer, discount, device, payment, customer_id)
  values (auth.uid(), v_name, v_cust, coalesce(p_discount, 0), p_device, coalesce(p_payment, 'cash'), p_customer_id)
  returning id into v_sale;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'qty')::numeric;
    v_amt := coalesce((v_line->>'amount')::numeric, 0);
    if v_qty is null or v_qty <= 0 then raise exception 'Quantity ghalat hai'; end if;

    select * into v_item from public.items where id = (v_line->>'item_id')::bigint for update;
    if not found then raise exception 'Item nahi mila'; end if;
    if v_item.stock < v_qty then
      raise exception 'Stock kam hai: % (sirf % % baqi)', v_item.name, trim_scale(v_item.stock), v_item.unit;
    end if;

    select coalesce(purchase_price, 0) into v_cost from public.item_costs where item_id = v_item.id;

    insert into public.sale_lines (sale_id, item_id, item_name, qty, entered_qty, entered_unit, amount, cost)
    values (v_sale, v_item.id, v_item.name, v_qty,
            (v_line->>'entered_qty')::numeric, v_line->>'entered_unit', v_amt,
            round(coalesce(v_cost, 0) * v_qty, 2));

    update public.items set stock = stock - v_qty where id = v_item.id;

    v_total := v_total + v_amt;
    v_summary := v_summary || case when v_summary = '' then '' else ', ' end
                 || coalesce(v_line->>'entered_qty', trim_scale(v_qty)::text) || ' '
                 || coalesce(v_line->>'entered_unit', v_item.unit) || ' ' || v_item.name;
  end loop;

  update public.sales set total = v_total - coalesce(p_discount, 0), summary = v_summary where id = v_sale;
  return v_sale;
end $$;

-- ---------- Sale cancel (stock wapis) ----------
create or replace function public.void_sale(p_sale bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if public.my_role() is distinct from 'owner' then
    raise exception 'Sirf owner sale cancel kar sakta hai';
  end if;
  if not exists (select 1 from public.sales where id = p_sale and not voided) then
    raise exception 'Sale nahi mili ya pehle se cancel hai';
  end if;
  -- jis bill ka kuch maal wapis ho chuka, us ko cancel karne se stock do dafa barhega
  if exists (select 1 from public.return_lines where sale_id = p_sale) then
    raise exception 'This bill has returned items, so it cannot be cancelled';
  end if;
  for r in select item_id, qty from public.sale_lines where sale_id = p_sale loop
    update public.items set stock = stock + r.qty where id = r.item_id;
  end loop;
  update public.sales set voided = true where id = p_sale;
end $$;

-- ---------- Purchase (stock khud barhta hai) ----------
create or replace function public.add_purchase(
  p_item bigint, p_qty numeric, p_total_cost numeric default 0, p_supplier text default null, p_note text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_name text; v_unit numeric;
begin
  if public.my_role() is distinct from 'owner' then
    raise exception 'Sirf owner purchase entry kar sakta hai';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity ghalat hai'; end if;

  select name into v_name from public.items where id = p_item for update;
  if not found then raise exception 'Item nahi mila'; end if;

  v_unit := case when coalesce(p_total_cost, 0) > 0 then p_total_cost / p_qty else null end;

  insert into public.purchases (item_id, item_name, qty, unit_cost, total_cost, supplier, note)
  values (p_item, v_name, p_qty, round(coalesce(v_unit, 0), 2), coalesce(p_total_cost, 0),
          nullif(trim(p_supplier), ''), nullif(trim(p_note), ''))
  returning id into v_id;

  update public.items set stock = stock + p_qty where id = p_item;

  if v_unit is not null then
    insert into public.item_costs (item_id, purchase_price) values (p_item, round(v_unit, 2))
    on conflict (item_id) do update set purchase_price = excluded.purchase_price;
  end if;
  return v_id;
end $$;

-- ---------- Stock durusti (sirf owner) ----------
create or replace function public.adjust_stock(p_item bigint, p_qty numeric, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_item public.items%rowtype;
begin
  if public.my_role() is distinct from 'owner' then
    raise exception 'Only the owner can adjust stock';
  end if;
  if p_qty is null or p_qty = 0 then raise exception 'Enter a quantity'; end if;
  select * into v_item from public.items where id = p_item for update;
  if not found then raise exception 'Item not found'; end if;
  if v_item.stock + p_qty < 0 then
    raise exception 'Stock cannot go below zero (only % % left)', trim_scale(v_item.stock), v_item.unit;
  end if;
  insert into public.stock_adjustments (item_id, item_name, qty, reason)
  values (p_item, v_item.name, p_qty, nullif(trim(p_reason), ''));
  update public.items set stock = stock + p_qty where id = p_item;
end $$;

-- ---------- Customer ka hisaab (owner aur staff dono; staff ko sirf ek customer) ----------
create or replace function public.customer_statement(p_customer bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') not in ('owner','staff') then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'balance',
        coalesce((select sum(total) from public.sales where customer_id = p_customer and payment = 'credit' and not voided), 0)
      - coalesce((select sum(amount) from public.khata_payments where customer_id = p_customer), 0)
      - coalesce((select sum(total) from public.sale_returns where customer_id = p_customer and payment = 'credit'), 0),
    'entries', coalesce((select jsonb_agg(e order by (e->>'at') desc) from (
        select jsonb_build_object('at', created_at, 'type', 'sale', 'ref', id, 'text', summary, 'amount', total) e
          from public.sales where customer_id = p_customer and payment = 'credit' and not voided
        union all
        select jsonb_build_object('at', created_at, 'type', 'payment', 'ref', id, 'text', note, 'amount', -amount)
          from public.khata_payments where customer_id = p_customer
        union all
        select jsonb_build_object('at', created_at, 'type', 'return', 'ref', id, 'text', summary, 'amount', -total)
          from public.sale_returns where customer_id = p_customer and payment = 'credit'
      ) x), '[]'::jsonb));
end $$;

-- ---------- Jo maal wapis ho sakta hai ----------
-- staff: sirf customer ki udhaar wali khareedari; owner: customer ya bill # se (cash bhi)
create or replace function public.returnable_lines(p_customer bigint default null, p_sale bigint default null)
returns table (line_id bigint, sale_id bigint, sold_at timestamptz, payment text, item_id bigint, item_name text,
               qty numeric, returned numeric, entered_qty numeric, entered_unit text, amount numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare r text := coalesce(public.my_role(), '');
begin
  if r not in ('owner','staff') then raise exception 'Not allowed'; end if;
  if p_customer is null and p_sale is null then raise exception 'Choose a customer or a bill'; end if;
  if r = 'staff' and p_customer is null then raise exception 'Choose a customer'; end if;
  return query
    -- amount = bill ka discount nikaal kar (customer ne asal mein jo diya)
    select l.id, s.id, s.created_at, s.payment, l.item_id, l.item_name, l.qty,
           coalesce((select sum(rl.qty) from public.return_lines rl where rl.sale_line_id = l.id), 0)::numeric,
           l.entered_qty, l.entered_unit,
           round(l.amount * case when s.total + s.discount > 0 then greatest(s.total, 0) / (s.total + s.discount) else 1 end, 2)
    from public.sale_lines l join public.sales s on s.id = l.sale_id
    where not s.voided
      and (p_customer is null or s.customer_id = p_customer)
      and (p_sale is null or s.id = p_sale)
      and (r = 'owner' or s.payment = 'credit')
    order by s.created_at desc, l.id;
end $$;

-- ---------- Maal wapis lena (stock barhta hai; udhaar ho to khata kam) ----------
create or replace function public.create_return(p_lines jsonb, p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  r text := coalesce(public.my_role(), ''); v_ret bigint; x jsonb; l record;
  v_qty numeric; v_done numeric; v_amt numeric; v_total numeric := 0; v_sum text := '';
  v_cust bigint; v_pay text; v_first boolean := true; v_name text;
begin
  if r not in ('owner','staff') then raise exception 'Not allowed'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Nothing to return'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.sale_returns (seller_name, note) values (v_name, nullif(trim(p_note), '')) returning id into v_ret;

  for x in select * from jsonb_array_elements(p_lines) loop
    v_qty := (x->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Invalid quantity'; end if;
    -- amount = line ki raqam, bill ke discount ke hisaab se kam (jitna customer ne asal mein diya)
    select sl.id, sl.sale_id, sl.item_id, sl.item_name, sl.qty, sl.cost,
           round(sl.amount * case when s.total + s.discount > 0 then greatest(s.total, 0) / (s.total + s.discount) else 1 end, 2) as amount,
           s.customer_id as cust, s.payment as pay, s.voided as voided
      into l
      from public.sale_lines sl join public.sales s on s.id = sl.sale_id
      where sl.id = (x->>'line_id')::bigint
      for update of sl;
    if not found or l.voided then raise exception 'Sale item not found'; end if;
    if r = 'staff' and l.pay <> 'credit' then raise exception 'Only the owner can return cash sales'; end if;
    if v_first then v_cust := l.cust; v_pay := l.pay; v_first := false;
    elsif v_cust is distinct from l.cust or v_pay <> l.pay then
      raise exception 'Return items of one customer and one payment type at a time';
    end if;
    select coalesce(sum(qty), 0) into v_done from public.return_lines where sale_line_id = l.id;
    if v_qty > l.qty - v_done + 0.0005 then
      raise exception 'Cannot return more than sold: % (only % left)', l.item_name, trim_scale(l.qty - v_done);
    end if;
    v_amt := round(l.amount * v_qty / l.qty, 2);
    insert into public.return_lines (return_id, sale_line_id, sale_id, item_id, item_name, qty, amount, cost)
    values (v_ret, l.id, l.sale_id, l.item_id, l.item_name, v_qty, v_amt, round(l.cost * v_qty / l.qty, 2));
    update public.items set stock = stock + v_qty where id = l.item_id;
    v_total := v_total + v_amt;
    v_sum := v_sum || case when v_sum = '' then '' else ', ' end || trim_scale(v_qty)::text || ' ' || l.item_name;
  end loop;

  update public.sale_returns set customer_id = v_cust, payment = v_pay, total = v_total, summary = v_sum where id = v_ret;
  return v_ret;
end $$;

revoke execute on function public.customer_statement(bigint)                 from public, anon;
revoke execute on function public.returnable_lines(bigint, bigint)           from public, anon;
revoke execute on function public.create_return(jsonb, text)                 from public, anon;
grant  execute on function public.customer_statement(bigint)                 to authenticated;
grant  execute on function public.returnable_lines(bigint, bigint)           to authenticated;
grant  execute on function public.create_return(jsonb, text)                 to authenticated;

revoke execute on function public.adjust_stock(bigint, numeric, text)        from public, anon;
grant  execute on function public.adjust_stock(bigint, numeric, text)        to authenticated;
revoke execute on function public.my_role()                                   from public, anon;
revoke execute on function public.create_sale(jsonb, text, numeric, text, text, bigint) from public, anon;
revoke execute on function public.void_sale(bigint)                           from public, anon;
revoke execute on function public.add_purchase(bigint, numeric, numeric, text, text) from public, anon;
grant  execute on function public.my_role()                                   to authenticated;
grant  execute on function public.create_sale(jsonb, text, numeric, text, text, bigint) to authenticated;
grant  execute on function public.void_sale(bigint)                           to authenticated;
grant  execute on function public.add_purchase(bigint, numeric, numeric, text, text) to authenticated;
