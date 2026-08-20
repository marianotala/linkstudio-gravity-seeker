-- ============================================================
-- Seeker — esquema fase 2 (auth, historial de búsquedas, RLS)
-- Pegar completo en el SQL Editor de Supabase (o correr como
-- migración). Es idempotente: se puede re-ejecutar sin romper.
-- ============================================================

-- ------------------------------------------------------------
-- Tablas
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text,
  rol text not null default 'vendedor' check (rol in ('admin', 'vendedor')),
  created_at timestamptz not null default now()
);

create table if not exists public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  mode text not null check (mode in ('origins', 'zone')),
  params jsonb not null,
  result_count int not null default 0
);

create table if not exists public.search_results (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.searches (id) on delete cascade,
  name text not null,
  category text,
  lat double precision not null,
  lng double precision not null,
  address text,
  origin_name text,
  distance_m int,
  place_id text
);

create index if not exists searches_user_id_created_at_idx
  on public.searches (user_id, created_at desc);
create index if not exists search_results_search_id_idx
  on public.search_results (search_id);

-- ------------------------------------------------------------
-- Trigger: crea el profile automáticamente al crear un usuario
-- (los usuarios se dan de alta desde el dashboard de Supabase)
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'rol', 'vendedor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- Helper para las políticas: ¿el usuario actual es admin?
-- (security definer para no recursar sobre las políticas de profiles)
-- ------------------------------------------------------------

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'admin'
  );
$$;

-- ------------------------------------------------------------
-- RLS: cada usuario lee/escribe solo lo suyo; admin lee todo
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.searches enable row level security;
alter table public.search_results enable row level security;

-- profiles
drop policy if exists "profiles: leer propio o admin" on public.profiles;
create policy "profiles: leer propio o admin"
  on public.profiles for select
  using (id = auth.uid() or public.es_admin());

drop policy if exists "profiles: actualizar propio" on public.profiles;
create policy "profiles: actualizar propio"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and rol = (select p.rol from public.profiles p where p.id = auth.uid()));

-- searches
drop policy if exists "searches: leer propias o admin" on public.searches;
create policy "searches: leer propias o admin"
  on public.searches for select
  using (user_id = auth.uid() or public.es_admin());

drop policy if exists "searches: insertar propias" on public.searches;
create policy "searches: insertar propias"
  on public.searches for insert
  with check (user_id = auth.uid());

drop policy if exists "searches: borrar propias" on public.searches;
create policy "searches: borrar propias"
  on public.searches for delete
  using (user_id = auth.uid());

-- search_results (heredan la propiedad de su search padre)
drop policy if exists "search_results: leer propias o admin" on public.search_results;
create policy "search_results: leer propias o admin"
  on public.search_results for select
  using (
    exists (
      select 1 from public.searches s
      where s.id = search_id and (s.user_id = auth.uid() or public.es_admin())
    )
  );

drop policy if exists "search_results: insertar en searches propias" on public.search_results;
create policy "search_results: insertar en searches propias"
  on public.search_results for insert
  with check (
    exists (
      select 1 from public.searches s
      where s.id = search_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "search_results: borrar de searches propias" on public.search_results;
create policy "search_results: borrar de searches propias"
  on public.search_results for delete
  using (
    exists (
      select 1 from public.searches s
      where s.id = search_id and s.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- RPC: guarda una búsqueda + sus resultados en UNA transacción.
-- security invoker: corre con el usuario de la sesión y las
-- políticas RLS de arriba aplican tal cual.
-- ------------------------------------------------------------

create or replace function public.guardar_busqueda(
  p_mode text,
  p_params jsonb,
  p_results jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_search_id uuid;
begin
  insert into public.searches (user_id, mode, params, result_count)
  values (auth.uid(), p_mode, p_params, coalesce(jsonb_array_length(p_results), 0))
  returning id into v_search_id;

  insert into public.search_results
    (search_id, name, category, lat, lng, address, origin_name, distance_m, place_id)
  select
    v_search_id,
    r ->> 'name',
    r ->> 'category',
    (r ->> 'lat')::double precision,
    (r ->> 'lng')::double precision,
    r ->> 'address',
    r ->> 'origin_name',
    (r ->> 'distance_m')::int,
    r ->> 'place_id'
  from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) as r;

  return v_search_id;
end;
$$;

-- ------------------------------------------------------------
-- Permisos de ejecución (recomendación del linter de Supabase):
-- las funciones no deben quedar expuestas a anon vía /rest/v1/rpc.
-- ------------------------------------------------------------

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

revoke execute on function public.guardar_busqueda(text, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_busqueda(text, jsonb, jsonb) to authenticated;


-- ============================================================
-- MIGRACIÓN FASE 3 — censo de marca y protección de cuota
-- (separada del esquema base; también idempotente)
-- ============================================================

-- El modo 'census' ahora es válido en searches.
alter table public.searches drop constraint if exists searches_mode_check;
alter table public.searches
  add constraint searches_mode_check check (mode in ('origins', 'zone', 'census'));

-- ------------------------------------------------------------
-- usage_limits: consumo diario por usuario (búsquedas y celdas
-- de censo). Los límites llegan por variables de entorno desde
-- /api/search; los admin no tienen límite.
-- ------------------------------------------------------------

create table if not exists public.usage_limits (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null default current_date,
  searches_count int not null default 0,
  cells_count int not null default 0,
  primary key (user_id, date)
);

alter table public.usage_limits enable row level security;

-- Solo lectura del propio consumo (o admin). Las escrituras pasan
-- únicamente por la RPC consumir_cuota (security definer).
drop policy if exists "usage_limits: leer propio o admin" on public.usage_limits;
create policy "usage_limits: leer propio o admin"
  on public.usage_limits for select
  using (user_id = auth.uid() or public.es_admin());

-- ------------------------------------------------------------
-- RPC: consume 1 búsqueda o 1 celda de forma atómica.
-- Regresa {permitido, searches_count, cells_count}; para admin
-- siempre {permitido: true, admin: true} sin registrar consumo.
-- ------------------------------------------------------------

create or replace function public.consumir_cuota(
  p_tipo text,             -- 'busqueda' | 'celda'
  p_max_busquedas int,
  p_max_celdas int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v usage_limits%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('permitido', false, 'motivo', 'sin_sesion');
  end if;

  if exists (select 1 from public.profiles where id = v_uid and rol = 'admin') then
    return jsonb_build_object('permitido', true, 'admin', true);
  end if;

  insert into public.usage_limits (user_id, date)
  values (v_uid, current_date)
  on conflict (user_id, date) do nothing;

  select * into v
  from public.usage_limits
  where user_id = v_uid and date = current_date
  for update;

  if p_tipo = 'celda' then
    if v.cells_count >= p_max_celdas then
      return jsonb_build_object(
        'permitido', false,
        'searches_count', v.searches_count,
        'cells_count', v.cells_count
      );
    end if;
    update public.usage_limits
      set cells_count = cells_count + 1
      where user_id = v_uid and date = current_date;
    v.cells_count := v.cells_count + 1;
  else
    if v.searches_count >= p_max_busquedas then
      return jsonb_build_object(
        'permitido', false,
        'searches_count', v.searches_count,
        'cells_count', v.cells_count
      );
    end if;
    update public.usage_limits
      set searches_count = searches_count + 1
      where user_id = v_uid and date = current_date;
    v.searches_count := v.searches_count + 1;
  end if;

  return jsonb_build_object(
    'permitido', true,
    'searches_count', v.searches_count,
    'cells_count', v.cells_count
  );
end;
$$;

revoke execute on function public.consumir_cuota(text, int, int) from public, anon;
grant execute on function public.consumir_cuota(text, int, int) to authenticated;


-- ============================================================
-- MIGRACIÓN FASE 4 — biblioteca de censos (marca y territorial)
-- ============================================================

create table if not exists public.censuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  tipo text not null check (tipo in ('marca', 'territorial')),
  marca_o_categoria text not null,
  alcance_descripcion text not null,
  fuente text not null check (fuente in ('google', 'denue', 'ambas')),
  poi_count int not null default 0,
  params jsonb not null
);

create table if not exists public.census_pois (
  id uuid primary key default gen_random_uuid(),
  census_id uuid not null references public.censuses (id) on delete cascade,
  place_key text not null,
  fuente text not null check (fuente in ('google', 'denue', 'ambas')),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  address text,
  estrato text,
  extra jsonb
);

create index if not exists censuses_user_id_created_at_idx
  on public.censuses (user_id, created_at desc);
create index if not exists census_pois_census_id_idx
  on public.census_pois (census_id);

alter table public.censuses enable row level security;
alter table public.census_pois enable row level security;

drop policy if exists "censuses: leer propios o admin" on public.censuses;
create policy "censuses: leer propios o admin"
  on public.censuses for select
  using (user_id = auth.uid() or public.es_admin());

drop policy if exists "censuses: insertar propios" on public.censuses;
create policy "censuses: insertar propios"
  on public.censuses for insert
  with check (user_id = auth.uid());

drop policy if exists "censuses: borrar propios" on public.censuses;
create policy "censuses: borrar propios"
  on public.censuses for delete
  using (user_id = auth.uid());

drop policy if exists "census_pois: leer propios o admin" on public.census_pois;
create policy "census_pois: leer propios o admin"
  on public.census_pois for select
  using (
    exists (
      select 1 from public.censuses c
      where c.id = census_id and (c.user_id = auth.uid() or public.es_admin())
    )
  );

drop policy if exists "census_pois: insertar en censos propios" on public.census_pois;
create policy "census_pois: insertar en censos propios"
  on public.census_pois for insert
  with check (
    exists (
      select 1 from public.censuses c
      where c.id = census_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "census_pois: borrar de censos propios" on public.census_pois;
create policy "census_pois: borrar de censos propios"
  on public.census_pois for delete
  using (
    exists (
      select 1 from public.censuses c
      where c.id = census_id and c.user_id = auth.uid()
    )
  );

-- RPC: guarda censo + POIs en UNA transacción (security invoker: RLS aplica).
create or replace function public.guardar_censo(
  p_tipo text,
  p_marca_o_categoria text,
  p_alcance_descripcion text,
  p_fuente text,
  p_params jsonb,
  p_pois jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_census_id uuid;
begin
  insert into public.censuses
    (user_id, tipo, marca_o_categoria, alcance_descripcion, fuente, poi_count, params)
  values (
    auth.uid(), p_tipo, p_marca_o_categoria, p_alcance_descripcion, p_fuente,
    coalesce(jsonb_array_length(p_pois), 0), p_params
  )
  returning id into v_census_id;

  insert into public.census_pois
    (census_id, place_key, fuente, name, lat, lng, address, estrato, extra)
  select
    v_census_id,
    r ->> 'place_key',
    r ->> 'fuente',
    r ->> 'name',
    (r ->> 'lat')::double precision,
    (r ->> 'lng')::double precision,
    r ->> 'address',
    r ->> 'estrato',
    r -> 'extra'
  from jsonb_array_elements(coalesce(p_pois, '[]'::jsonb)) as r;

  return v_census_id;
end;
$$;

revoke execute on function public.guardar_censo(text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_censo(text, text, text, text, jsonb, jsonb) to authenticated;
