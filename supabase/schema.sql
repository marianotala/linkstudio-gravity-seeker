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


-- ============================================================
-- MIGRACIÓN FASE 5 — PostGIS, AGEBs del Censo 2020 y universos
-- ============================================================

create extension if not exists postgis with schema extensions;

-- AGEBs urbanas del Censo de Población y Vivienda 2020 (INEGI).
-- Se cargan con scripts/ingesta-ageb, una vez por entidad.
create table if not exists public.agebs (
  cvegeo text primary key,          -- EE+MMM+LLLL+AAAA (13 chars)
  entidad text not null,            -- clave de entidad "09", "15", …
  municipio text not null,
  pobtot int,
  p_18ymas int,
  p_18a24 int,
  p_60ymas int,
  graproes numeric,                 -- grado promedio de escolaridad
  tvivhab int,                      -- viviendas habitadas
  vph_autom int,
  vph_inter int,
  vph_pc int,
  nse_proxy numeric,                -- índice socioeconómico aproximado 0-100 (proxy censal)
  geom extensions.geometry(MultiPolygon, 4326) not null
);

create index if not exists agebs_geom_gix on public.agebs using gist (geom);
create index if not exists agebs_entidad_idx on public.agebs (entidad);

alter table public.agebs enable row level security;

drop policy if exists "agebs: leer autenticados" on public.agebs;
create policy "agebs: leer autenticados"
  on public.agebs for select
  to authenticated
  using (true);

alter table public.searches add column if not exists universos jsonb;
alter table public.censuses add column if not exists universos jsonb;

-- ------------------------------------------------------------
-- RPC calcular_universos: interpolación areal sobre la UNIÓN de
-- geocercas (círculos {lat,lng,radio_m} o rectángulos {viewport}).
-- La unión evita contar doble los traslapes.
-- ------------------------------------------------------------

create or replace function public.calcular_universos(
  p_geocercas jsonb,
  p_incluir_agebs boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_n int;
  v_total jsonb;
  v_por jsonb := '[]'::jsonb;
  v_agebs jsonb := null;
  v_count_agebs int;
begin
  v_n := coalesce(jsonb_array_length(p_geocercas), 0);
  if v_n = 0 or v_n > 2000 then
    return jsonb_build_object('disponible', false, 'motivo', 'geocercas_invalidas');
  end if;

  with gc as (
    select
      coalesce(g.value->>'id', g.ordinality::text) as gid,
      case
        when g.value ? 'viewport' then ST_MakeEnvelope(
          (g.value->'viewport'->>'west')::float,
          (g.value->'viewport'->>'south')::float,
          (g.value->'viewport'->>'east')::float,
          (g.value->'viewport'->>'north')::float, 4326)
        else (ST_Buffer(
          ST_SetSRID(ST_MakePoint((g.value->>'lng')::float, (g.value->>'lat')::float), 4326)::geography,
          least(greatest((g.value->>'radio_m')::float, 10), 100000)
        ))::geometry
      end as geom
    from jsonb_array_elements(p_geocercas) with ordinality as g
  ),
  un as (select ST_Union(geom) as geom from gc),
  inter as (
    select a.cvegeo, a.pobtot, a.p_18ymas, a.p_18a24, a.p_60ymas,
           a.tvivhab, a.nse_proxy,
           ST_Area(ST_Intersection(a.geom, un.geom)::geography)
             / nullif(ST_Area(a.geom::geography), 0) as frac
    from public.agebs a, un
    where un.geom is not null and a.geom && un.geom and ST_Intersects(a.geom, un.geom)
  )
  select count(*),
    jsonb_build_object(
      'poblacion',  round(coalesce(sum(pobtot * frac), 0))::int,
      'adultos18',  round(coalesce(sum(p_18ymas * frac), 0))::int,
      'viviendas',  round(coalesce(sum(tvivhab * frac), 0))::int,
      'nse_proxy',  round((sum(nse_proxy * coalesce(pobtot,0) * frac)
                      / nullif(sum(case when nse_proxy is not null then coalesce(pobtot,0) * frac end), 0))::numeric, 1),
      'pct_18a24',  round((100.0 * sum(p_18a24 * frac) / nullif(sum(pobtot * frac), 0))::numeric, 1),
      'pct_60ymas', round((100.0 * sum(p_60ymas * frac) / nullif(sum(pobtot * frac), 0))::numeric, 1)
    )
  into v_count_agebs, v_total
  from inter where frac > 0;

  if coalesce(v_count_agebs, 0) = 0 then
    return jsonb_build_object('disponible', false, 'motivo', 'sin_agebs');
  end if;

  if v_n <= 200 then
    with gc as (
      select
        coalesce(g.value->>'id', g.ordinality::text) as gid,
        g.ordinality as orden,
        case
          when g.value ? 'viewport' then ST_MakeEnvelope(
            (g.value->'viewport'->>'west')::float,
            (g.value->'viewport'->>'south')::float,
            (g.value->'viewport'->>'east')::float,
            (g.value->'viewport'->>'north')::float, 4326)
          else (ST_Buffer(
            ST_SetSRID(ST_MakePoint((g.value->>'lng')::float, (g.value->>'lat')::float), 4326)::geography,
            least(greatest((g.value->>'radio_m')::float, 10), 100000)
          ))::geometry
        end as geom
      from jsonb_array_elements(p_geocercas) with ordinality as g
    ),
    porg as (
      select gc.gid, gc.orden,
        round(coalesce(sum(a.pobtot * ST_Area(ST_Intersection(a.geom, gc.geom)::geography) / nullif(ST_Area(a.geom::geography),0)), 0))::int as poblacion,
        round(coalesce(sum(a.p_18ymas * ST_Area(ST_Intersection(a.geom, gc.geom)::geography) / nullif(ST_Area(a.geom::geography),0)), 0))::int as adultos18,
        round((sum(a.nse_proxy * coalesce(a.pobtot,0) * ST_Area(ST_Intersection(a.geom, gc.geom)::geography) / nullif(ST_Area(a.geom::geography),0))
          / nullif(sum(case when a.nse_proxy is not null then coalesce(a.pobtot,0) * ST_Area(ST_Intersection(a.geom, gc.geom)::geography) / nullif(ST_Area(a.geom::geography),0) end), 0))::numeric, 1) as nse_proxy
      from gc
      left join public.agebs a on a.geom && gc.geom and ST_Intersects(a.geom, gc.geom)
      group by gc.gid, gc.orden
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', gid, 'poblacion', poblacion, 'adultos18', adultos18, 'nse_proxy', nse_proxy
    ) order by orden), '[]'::jsonb)
    into v_por from porg;
  end if;

  if p_incluir_agebs then
    with gc as (
      select case
        when g.value ? 'viewport' then ST_MakeEnvelope(
          (g.value->'viewport'->>'west')::float,
          (g.value->'viewport'->>'south')::float,
          (g.value->'viewport'->>'east')::float,
          (g.value->'viewport'->>'north')::float, 4326)
        else (ST_Buffer(
          ST_SetSRID(ST_MakePoint((g.value->>'lng')::float, (g.value->>'lat')::float), 4326)::geography,
          least(greatest((g.value->>'radio_m')::float, 10), 100000)
        ))::geometry
      end as geom
      from jsonb_array_elements(p_geocercas) with ordinality as g
    ),
    un as (select ST_Union(geom) as geom from gc),
    sel as (
      select a.cvegeo, a.pobtot, a.nse_proxy, a.geom
      from public.agebs a, un
      where a.geom && un.geom and ST_Intersects(a.geom, un.geom)
      order by a.pobtot desc nulls last
      limit 1500
    )
    select jsonb_agg(jsonb_build_object(
      'cvegeo', cvegeo, 'pobtot', pobtot, 'nse_proxy', nse_proxy,
      'geometria', ST_AsGeoJSON(geom, 5)::jsonb
    ))
    into v_agebs from sel;
  end if;

  return jsonb_build_object(
    'disponible', true,
    'agebs', v_count_agebs,
    'total', v_total,
    'por_geocerca', v_por,
    'agebs_geo', v_agebs
  );
end;
$$;

revoke execute on function public.calcular_universos(jsonb, boolean) from public, anon;
grant execute on function public.calcular_universos(jsonb, boolean) to authenticated;

-- guardar_busqueda y guardar_censo ahora aceptan universos (se
-- recrean con el parámetro nuevo; el default null mantiene compatibilidad).

drop function if exists public.guardar_busqueda(text, jsonb, jsonb);
create or replace function public.guardar_busqueda(
  p_mode text,
  p_params jsonb,
  p_results jsonb,
  p_universos jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_search_id uuid;
begin
  insert into public.searches (user_id, mode, params, result_count, universos)
  values (auth.uid(), p_mode, p_params, coalesce(jsonb_array_length(p_results), 0), p_universos)
  returning id into v_search_id;

  insert into public.search_results
    (search_id, name, category, lat, lng, address, origin_name, distance_m, place_id)
  select
    v_search_id,
    r ->> 'name', r ->> 'category',
    (r ->> 'lat')::double precision, (r ->> 'lng')::double precision,
    r ->> 'address', r ->> 'origin_name', (r ->> 'distance_m')::int, r ->> 'place_id'
  from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) as r;

  return v_search_id;
end;
$$;

revoke execute on function public.guardar_busqueda(text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_busqueda(text, jsonb, jsonb, jsonb) to authenticated;

drop function if exists public.guardar_censo(text, text, text, text, jsonb, jsonb);
create or replace function public.guardar_censo(
  p_tipo text,
  p_marca_o_categoria text,
  p_alcance_descripcion text,
  p_fuente text,
  p_params jsonb,
  p_pois jsonb,
  p_universos jsonb default null
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
    (user_id, tipo, marca_o_categoria, alcance_descripcion, fuente, poi_count, params, universos)
  values (
    auth.uid(), p_tipo, p_marca_o_categoria, p_alcance_descripcion, p_fuente,
    coalesce(jsonb_array_length(p_pois), 0), p_params, p_universos
  )
  returning id into v_census_id;

  insert into public.census_pois
    (census_id, place_key, fuente, name, lat, lng, address, estrato, extra)
  select
    v_census_id,
    r ->> 'place_key', r ->> 'fuente', r ->> 'name',
    (r ->> 'lat')::double precision, (r ->> 'lng')::double precision,
    r ->> 'address', r ->> 'estrato', r -> 'extra'
  from jsonb_array_elements(coalesce(p_pois, '[]'::jsonb)) as r;

  return v_census_id;
end;
$$;

revoke execute on function public.guardar_censo(text, text, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_censo(text, text, text, text, jsonb, jsonb, jsonb) to authenticated;


-- ============================================================
-- MIGRACIÓN FASE 5b — carga de AGEBs desde la página /admin
-- ============================================================

drop policy if exists "agebs: insertar admin" on public.agebs;
create policy "agebs: insertar admin"
  on public.agebs for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "agebs: actualizar admin" on public.agebs;
create policy "agebs: actualizar admin"
  on public.agebs for update
  to authenticated
  using (public.es_admin());

drop policy if exists "agebs: borrar admin" on public.agebs;
create policy "agebs: borrar admin"
  on public.agebs for delete
  to authenticated
  using (public.es_admin());

-- Carga por lotes desde /admin (geometrías en GeoJSON). security
-- invoker: las políticas de arriba limitan la escritura a admins.
create or replace function public.admin_upsert_agebs(p_agebs jsonb)
returns int
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_n int;
begin
  if coalesce(jsonb_array_length(p_agebs), 0) = 0
     or jsonb_array_length(p_agebs) > 300 then
    raise exception 'Lote inválido: manda entre 1 y 300 AGEBs';
  end if;

  insert into public.agebs
    (cvegeo, entidad, municipio, pobtot, p_18ymas, p_18a24, p_60ymas,
     graproes, tvivhab, vph_autom, vph_inter, vph_pc, nse_proxy, geom)
  select
    r ->> 'cvegeo',
    r ->> 'entidad',
    r ->> 'municipio',
    (r ->> 'pobtot')::int,
    (r ->> 'p_18ymas')::int,
    (r ->> 'p_18a24')::int,
    (r ->> 'p_60ymas')::int,
    (r ->> 'graproes')::numeric,
    (r ->> 'tvivhab')::int,
    (r ->> 'vph_autom')::int,
    (r ->> 'vph_inter')::int,
    (r ->> 'vph_pc')::int,
    (r ->> 'nse_proxy')::numeric,
    ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(r -> 'geometria'), 4326))
  from jsonb_array_elements(p_agebs) as r
  on conflict (cvegeo) do update set
    entidad = excluded.entidad, municipio = excluded.municipio,
    pobtot = excluded.pobtot, p_18ymas = excluded.p_18ymas,
    p_18a24 = excluded.p_18a24, p_60ymas = excluded.p_60ymas,
    graproes = excluded.graproes, tvivhab = excluded.tvivhab,
    vph_autom = excluded.vph_autom, vph_inter = excluded.vph_inter,
    vph_pc = excluded.vph_pc, nse_proxy = excluded.nse_proxy,
    geom = excluded.geom;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.admin_upsert_agebs(jsonb) from public, anon;
grant execute on function public.admin_upsert_agebs(jsonb) to authenticated;

-- Resumen de entidades cargadas para la página /admin.
create or replace function public.agebs_resumen()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'entidad', entidad,
    'agebs', n,
    'poblacion', pob
  ) order by entidad), '[]'::jsonb)
  from (
    select entidad, count(*) as n, sum(pobtot) as pob
    from public.agebs
    group by entidad
  ) t;
$$;

revoke execute on function public.agebs_resumen() from public, anon;
grant execute on function public.agebs_resumen() to authenticated;


-- ============================================================
-- MIGRACIÓN FASE 6 — acceso con Google restringido por dominio
-- ============================================================

create table if not exists public.dominios_permitidos (
  dominio text primary key
);

insert into public.dominios_permitidos (dominio)
values ('linkstudio.mx')
on conflict do nothing;

alter table public.dominios_permitidos enable row level security;

drop policy if exists "dominios: leer autenticados" on public.dominios_permitidos;
create policy "dominios: leer autenticados"
  on public.dominios_permitidos for select
  to authenticated
  using (true);

drop policy if exists "dominios: escribir admin" on public.dominios_permitidos;
create policy "dominios: escribir admin"
  on public.dominios_permitidos for all
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- handle_new_user: las altas por OAuth (Google) exigen dominio en
-- dominios_permitidos; si no, la transacción se aborta y el usuario
-- NO se crea. Las altas por email (dashboard) no se filtran.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', 'email') <> 'email'
     and not exists (
       select 1 from public.dominios_permitidos d
       where lower(split_part(new.email, '@', 2)) = d.dominio
     ) then
    raise exception 'Dominio no autorizado para acceso con Google: %',
      split_part(new.email, '@', 2);
  end if;

  insert into public.profiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'nombre',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'rol', 'vendedor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- ============================================================
-- MIGRACIÓN FASE 7 — perfil demográfico ampliado
-- (sexo, 65+, distribución NSE por nivel y tabla por AGEB)
-- ============================================================

-- Nuevas variables del RESAGEBURB: POBFEM, POBMAS y POB65_MAS.
-- Nota: INEGI NO publica rangos adultos 25-34/35-44/45-54/55-64 a
-- nivel AGEB; los rangos reales disponibles son 18-24 (P_18A24),
-- 60+ (P_60YMAS) y 65+ (POB65_MAS) — 25-59 y 60-64 se derivan.
alter table public.agebs add column if not exists pobfem int;
alter table public.agebs add column if not exists pobmas int;
alter table public.agebs add column if not exists pob65_mas int;

-- admin_upsert_agebs con las variables nuevas
create or replace function public.admin_upsert_agebs(p_agebs jsonb)
returns int
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_n int;
begin
  if coalesce(jsonb_array_length(p_agebs), 0) = 0
     or jsonb_array_length(p_agebs) > 300 then
    raise exception 'Lote inválido: manda entre 1 y 300 AGEBs';
  end if;

  insert into public.agebs
    (cvegeo, entidad, municipio, pobtot, pobfem, pobmas, p_18ymas,
     p_18a24, p_60ymas, pob65_mas, graproes, tvivhab, vph_autom,
     vph_inter, vph_pc, nse_proxy, geom)
  select
    r ->> 'cvegeo',
    r ->> 'entidad',
    r ->> 'municipio',
    (r ->> 'pobtot')::int,
    (r ->> 'pobfem')::int,
    (r ->> 'pobmas')::int,
    (r ->> 'p_18ymas')::int,
    (r ->> 'p_18a24')::int,
    (r ->> 'p_60ymas')::int,
    (r ->> 'pob65_mas')::int,
    (r ->> 'graproes')::numeric,
    (r ->> 'tvivhab')::int,
    (r ->> 'vph_autom')::int,
    (r ->> 'vph_inter')::int,
    (r ->> 'vph_pc')::int,
    (r ->> 'nse_proxy')::numeric,
    ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(r -> 'geometria'), 4326))
  from jsonb_array_elements(p_agebs) as r
  on conflict (cvegeo) do update set
    entidad = excluded.entidad, municipio = excluded.municipio,
    pobtot = excluded.pobtot, pobfem = excluded.pobfem,
    pobmas = excluded.pobmas, p_18ymas = excluded.p_18ymas,
    p_18a24 = excluded.p_18a24, p_60ymas = excluded.p_60ymas,
    pob65_mas = excluded.pob65_mas, graproes = excluded.graproes,
    tvivhab = excluded.tvivhab, vph_autom = excluded.vph_autom,
    vph_inter = excluded.vph_inter, vph_pc = excluded.vph_pc,
    nse_proxy = excluded.nse_proxy, geom = excluded.geom;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.admin_upsert_agebs(jsonb) from public, anon;
grant execute on function public.admin_upsert_agebs(jsonb) to authenticated;

-- calcular_universos ampliado (fase 8: acepta geocercas {cp} que
-- resuelven al polígono real del código postal). Agrega a `total`:
--   pobfem/pobmas          población por sexo (interpolada)
--   edades                 % del universo 18+ por rango REAL del censo:
--                          18-24, 25-59 (derivado), 60-64 (derivado,
--                          solo si hay POB65_MAS) y 65+; pct_60ymas
--                          como respaldo para datos sin POB65_MAS
--   nse_dist               distribución % por nivel tipo NSE ponderada
--                          por población del AGEB (proxy censal, NO
--                          AMAI). Cortes heurísticos — espejo de
--                          lib/nse.ts, cambiar en ambos lados:
--                          AB ≥75 · C+ 65 · C 55 · C- 45 · D+ 35 · DE <35
-- y al nivel raíz `por_ageb`: hasta 300 AGEBs (cvegeo, población
-- interpolada, nse_proxy) para la tabla de detalle.
create or replace function public.calcular_universos(
  p_geocercas jsonb,
  p_incluir_agebs boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_n int;
  v_total jsonb;
  v_por jsonb := '[]'::jsonb;
  v_por_ageb jsonb := '[]'::jsonb;
  v_agebs jsonb := null;
  v_count_agebs int;
begin
  v_n := coalesce(jsonb_array_length(p_geocercas), 0);
  if v_n = 0 or v_n > 2000 then
    return jsonb_build_object('disponible', false, 'motivo', 'geocercas_invalidas');
  end if;

  with gc as (
    select
      coalesce(g.value->>'id', g.ordinality::text) as gid,
      case
        when g.value ? 'cp' then (select c.geom from public.cp_poligonos c where c.codigo_postal = g.value->>'cp')
        when g.value ? 'viewport' then ST_MakeEnvelope(
          (g.value->'viewport'->>'west')::float,
          (g.value->'viewport'->>'south')::float,
          (g.value->'viewport'->>'east')::float,
          (g.value->'viewport'->>'north')::float, 4326)
        else (ST_Buffer(
          ST_SetSRID(ST_MakePoint((g.value->>'lng')::float, (g.value->>'lat')::float), 4326)::geography,
          least(greatest((g.value->>'radio_m')::float, 10), 100000)
        ))::geometry
      end as geom
    from jsonb_array_elements(p_geocercas) with ordinality as g
  ),
  un as (select ST_Union(geom) as geom from gc),
  inter as (
    select a.cvegeo, a.pobtot, a.pobfem, a.pobmas, a.p_18ymas, a.p_18a24,
           a.p_60ymas, a.pob65_mas, a.tvivhab, a.nse_proxy,
           ST_Area(ST_Intersection(a.geom, un.geom)::geography)
             / nullif(ST_Area(a.geom::geography), 0) as frac
    from public.agebs a, un
    where un.geom is not null and a.geom && un.geom and ST_Intersects(a.geom, un.geom)
  ),
  agg as (
    select
      count(*) as n,
      round(coalesce(sum(pobtot * frac), 0))::int as poblacion,
      round(coalesce(sum(p_18ymas * frac), 0))::int as adultos18,
      round(coalesce(sum(tvivhab * frac), 0))::int as viviendas,
      round(sum(pobfem * frac))::int as pobfem,
      round(sum(pobmas * frac))::int as pobmas,
      round((sum(nse_proxy * coalesce(pobtot,0) * frac)
        / nullif(sum(case when nse_proxy is not null then coalesce(pobtot,0) * frac end), 0))::numeric, 1) as nse_proxy,
      round((100.0 * sum(p_18a24 * frac) / nullif(sum(pobtot * frac), 0))::numeric, 1) as pct_18a24,
      round((100.0 * sum(p_60ymas * frac) / nullif(sum(pobtot * frac), 0))::numeric, 1) as pct_60ymas,
      -- rangos de edad como % del universo 18+
      nullif(sum(p_18ymas * frac), 0) as base18,
      sum(p_18a24 * frac) as n_18a24,
      sum(greatest(coalesce(p_18ymas,0) - coalesce(p_18a24,0) - coalesce(p_60ymas,0), 0) * frac) as n_25a59,
      sum(p_60ymas * frac) as n_60ymas,
      sum(pob65_mas * frac) as n_65ymas,
      sum(greatest(coalesce(p_60ymas,0) - coalesce(pob65_mas,0), 0) * frac)
        filter (where pob65_mas is not null) as n_60a64,
      -- distribución NSE ponderada por población (solo AGEBs con índice)
      nullif(sum(coalesce(pobtot,0) * frac) filter (where nse_proxy is not null), 0) as w_nse,
      coalesce(sum(coalesce(pobtot,0) * frac) filter (where nse_proxy >= 75), 0) as w_ab,
      coalesce(sum(coalesce(pobtot,0) * frac) filter (where nse_proxy >= 65 and nse_proxy < 75), 0) as w_cmas,
      coalesce(sum(coalesce(pobtot,0) * frac) filter (where nse_proxy >= 55 and nse_proxy < 65), 0) as w_c,
      coalesce(sum(coalesce(pobtot,0) * frac) filter (where nse_proxy >= 45 and nse_proxy < 55), 0) as w_cmenos,
      coalesce(sum(coalesce(pobtot,0) * frac) filter (where nse_proxy >= 35 and nse_proxy < 45), 0) as w_dmas,
      coalesce(sum(coalesce(pobtot,0) * frac) filter (where nse_proxy < 35), 0) as w_de
    from inter where frac > 0
  )
  select n, jsonb_build_object(
    'poblacion', poblacion,
    'adultos18', adultos18,
    'viviendas', viviendas,
    'pobfem', pobfem,
    'pobmas', pobmas,
    'nse_proxy', nse_proxy,
    'pct_18a24', pct_18a24,
    'pct_60ymas', pct_60ymas,
    'edades', case when base18 is not null then jsonb_build_object(
      'pct_18a24', round((100.0 * coalesce(n_18a24, 0) / base18)::numeric, 1),
      'pct_25a59', round((100.0 * coalesce(n_25a59, 0) / base18)::numeric, 1),
      'pct_60a64', case when n_65ymas is not null
        then round((100.0 * coalesce(n_60a64, 0) / base18)::numeric, 1) end,
      'pct_65ymas', case when n_65ymas is not null
        then round((100.0 * n_65ymas / base18)::numeric, 1) end,
      'pct_60ymas', round((100.0 * coalesce(n_60ymas, 0) / base18)::numeric, 1)
    ) end,
    'nse_dist', case when w_nse is not null then jsonb_build_object(
      'ab', round((100.0 * w_ab / w_nse)::numeric, 1),
      'c_mas', round((100.0 * w_cmas / w_nse)::numeric, 1),
      'c', round((100.0 * w_c / w_nse)::numeric, 1),
      'c_menos', round((100.0 * w_cmenos / w_nse)::numeric, 1),
      'd_mas', round((100.0 * w_dmas / w_nse)::numeric, 1),
      'de', round((100.0 * w_de / w_nse)::numeric, 1)
    ) end
  )
  into v_count_agebs, v_total
  from agg;

  if coalesce(v_count_agebs, 0) = 0 then
    return jsonb_build_object('disponible', false, 'motivo', 'sin_agebs');
  end if;

  -- tabla de detalle por AGEB (población interpolada dentro de la zona)
  with gc as (
    select case
      when g.value ? 'cp' then (select c.geom from public.cp_poligonos c where c.codigo_postal = g.value->>'cp')
        when g.value ? 'viewport' then ST_MakeEnvelope(
        (g.value->'viewport'->>'west')::float,
        (g.value->'viewport'->>'south')::float,
        (g.value->'viewport'->>'east')::float,
        (g.value->'viewport'->>'north')::float, 4326)
      else (ST_Buffer(
        ST_SetSRID(ST_MakePoint((g.value->>'lng')::float, (g.value->>'lat')::float), 4326)::geography,
        least(greatest((g.value->>'radio_m')::float, 10), 100000)
      ))::geometry
    end as geom
    from jsonb_array_elements(p_geocercas) with ordinality as g
  ),
  un as (select ST_Union(geom) as geom from gc),
  filas as (
    select a.cvegeo,
      round(coalesce(a.pobtot, 0) * ST_Area(ST_Intersection(a.geom, un.geom)::geography)
        / nullif(ST_Area(a.geom::geography), 0))::int as poblacion,
      a.nse_proxy
    from public.agebs a, un
    where un.geom is not null and a.geom && un.geom and ST_Intersects(a.geom, un.geom)
    order by 2 desc nulls last
    limit 300
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cvegeo', cvegeo, 'poblacion', poblacion, 'nse_proxy', nse_proxy
  )), '[]'::jsonb)
  into v_por_ageb from filas;

  if v_n <= 200 then
    with gc as (
      select
        coalesce(g.value->>'id', g.ordinality::text) as gid,
        g.ordinality as orden,
        case
          when g.value ? 'cp' then (select c.geom from public.cp_poligonos c where c.codigo_postal = g.value->>'cp')
        when g.value ? 'viewport' then ST_MakeEnvelope(
            (g.value->'viewport'->>'west')::float,
            (g.value->'viewport'->>'south')::float,
            (g.value->'viewport'->>'east')::float,
            (g.value->'viewport'->>'north')::float, 4326)
          else (ST_Buffer(
            ST_SetSRID(ST_MakePoint((g.value->>'lng')::float, (g.value->>'lat')::float), 4326)::geography,
            least(greatest((g.value->>'radio_m')::float, 10), 100000)
          ))::geometry
        end as geom
      from jsonb_array_elements(p_geocercas) with ordinality as g
    ),
    porg as (
      select gc.gid, gc.orden,
        round(coalesce(sum(a.pobtot * ST_Area(ST_Intersection(a.geom, gc.geom)::geography) / nullif(ST_Area(a.geom::geography),0)), 0))::int as poblacion,
        round(coalesce(sum(a.p_18ymas * ST_Area(ST_Intersection(a.geom, gc.geom)::geography) / nullif(ST_Area(a.geom::geography),0)), 0))::int as adultos18,
        round((sum(a.nse_proxy * coalesce(a.pobtot,0) * ST_Area(ST_Intersection(a.geom, gc.geom)::geography) / nullif(ST_Area(a.geom::geography),0))
          / nullif(sum(case when a.nse_proxy is not null then coalesce(a.pobtot,0) * ST_Area(ST_Intersection(a.geom, gc.geom)::geography) / nullif(ST_Area(a.geom::geography),0) end), 0))::numeric, 1) as nse_proxy
      from gc
      left join public.agebs a on a.geom && gc.geom and ST_Intersects(a.geom, gc.geom)
      group by gc.gid, gc.orden
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', gid, 'poblacion', poblacion, 'adultos18', adultos18, 'nse_proxy', nse_proxy
    ) order by orden), '[]'::jsonb)
    into v_por from porg;
  end if;

  if p_incluir_agebs then
    with gc as (
      select case
        when g.value ? 'cp' then (select c.geom from public.cp_poligonos c where c.codigo_postal = g.value->>'cp')
        when g.value ? 'viewport' then ST_MakeEnvelope(
          (g.value->'viewport'->>'west')::float,
          (g.value->'viewport'->>'south')::float,
          (g.value->'viewport'->>'east')::float,
          (g.value->'viewport'->>'north')::float, 4326)
        else (ST_Buffer(
          ST_SetSRID(ST_MakePoint((g.value->>'lng')::float, (g.value->>'lat')::float), 4326)::geography,
          least(greatest((g.value->>'radio_m')::float, 10), 100000)
        ))::geometry
      end as geom
      from jsonb_array_elements(p_geocercas) with ordinality as g
    ),
    un as (select ST_Union(geom) as geom from gc),
    sel as (
      select a.cvegeo, a.pobtot, a.nse_proxy, a.geom
      from public.agebs a, un
      where a.geom && un.geom and ST_Intersects(a.geom, un.geom)
      order by a.pobtot desc nulls last
      limit 1500
    )
    select jsonb_agg(jsonb_build_object(
      'cvegeo', cvegeo, 'pobtot', pobtot, 'nse_proxy', nse_proxy,
      'geometria', ST_AsGeoJSON(geom, 5)::jsonb
    ))
    into v_agebs from sel;
  end if;

  return jsonb_build_object(
    'disponible', true,
    'agebs', v_count_agebs,
    'total', v_total,
    'por_geocerca', v_por,
    'por_ageb', v_por_ageb,
    'agebs_geo', v_agebs
  );
end;
$$;

revoke execute on function public.calcular_universos(jsonb, boolean) from public, anon;
grant execute on function public.calcular_universos(jsonb, boolean) to authenticated;


-- ============================================================
-- MIGRACIÓN FASE 8 — búsqueda por código postal (polígono real)
-- ============================================================

-- Polígonos oficiales de códigos postales (Correos de México /
-- datos.gob.mx), cargados por entidad desde /admin. El CP es texto
-- de 5 dígitos SIEMPRE (preserva ceros a la izquierda: "01000").
create table if not exists public.cp_poligonos (
  codigo_postal text primary key check (codigo_postal ~ '^\d{5}$'),
  entidad text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null
);

create index if not exists cp_poligonos_geom_gix on public.cp_poligonos using gist (geom);
create index if not exists cp_poligonos_entidad_idx on public.cp_poligonos (entidad);

alter table public.cp_poligonos enable row level security;

drop policy if exists "cps: leer autenticados" on public.cp_poligonos;
create policy "cps: leer autenticados"
  on public.cp_poligonos for select
  to authenticated
  using (true);

drop policy if exists "cps: insertar admin" on public.cp_poligonos;
create policy "cps: insertar admin"
  on public.cp_poligonos for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "cps: actualizar admin" on public.cp_poligonos;
create policy "cps: actualizar admin"
  on public.cp_poligonos for update
  to authenticated
  using (public.es_admin());

drop policy if exists "cps: borrar admin" on public.cp_poligonos;
create policy "cps: borrar admin"
  on public.cp_poligonos for delete
  to authenticated
  using (public.es_admin());

-- Carga por lotes desde /admin. security invoker: las políticas de
-- arriba limitan la escritura a admins.
create or replace function public.admin_upsert_cps(p_entidad text, p_cps jsonb)
returns int
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_n int;
begin
  if p_entidad !~ '^\d{2}$' then
    raise exception 'Entidad inválida: usa la clave INEGI de dos dígitos';
  end if;
  if coalesce(jsonb_array_length(p_cps), 0) = 0
     or jsonb_array_length(p_cps) > 300 then
    raise exception 'Lote inválido: manda entre 1 y 300 CPs';
  end if;

  insert into public.cp_poligonos (codigo_postal, entidad, geom)
  select
    r ->> 'codigo_postal',
    p_entidad,
    ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(r -> 'geometria'), 4326))
  from jsonb_array_elements(p_cps) as r
  on conflict (codigo_postal) do update set
    entidad = excluded.entidad,
    geom = excluded.geom;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.admin_upsert_cps(text, jsonb) from public, anon;
grant execute on function public.admin_upsert_cps(text, jsonb) to authenticated;

-- Resumen de entidades con CPs cargados, para /admin.
create or replace function public.cps_resumen()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'entidad', entidad,
    'cps', n
  ) order by entidad), '[]'::jsonb)
  from (
    select entidad, count(*) as n
    from public.cp_poligonos
    group by entidad
  ) t;
$$;

revoke execute on function public.cps_resumen() from public, anon;
grant execute on function public.cps_resumen() to authenticated;

-- Busca los polígonos de una lista de CPs. Regresa encontrados (con
-- bbox y, opcionalmente, geometría GeoJSON para dibujar en el mapa)
-- y la lista de no encontrados — un CP inexistente no bloquea al resto.
create or replace function public.buscar_cps(
  p_cps text[],
  p_incluir_geometria boolean default true
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_enc jsonb;
  v_no jsonb;
begin
  if coalesce(array_length(p_cps, 1), 0) = 0 or array_length(p_cps, 1) > 100 then
    raise exception 'Manda entre 1 y 100 códigos postales';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'codigo_postal', c.codigo_postal,
    'entidad', c.entidad,
    'bbox', jsonb_build_object(
      'north', ST_YMax(c.geom), 'south', ST_YMin(c.geom),
      'east', ST_XMax(c.geom), 'west', ST_XMin(c.geom)
    ),
    'geometria', case when p_incluir_geometria
      then ST_AsGeoJSON(c.geom, 5)::jsonb end
  ) order by c.codigo_postal), '[]'::jsonb)
  into v_enc
  from public.cp_poligonos c
  where c.codigo_postal = any(p_cps);

  select coalesce(jsonb_agg(cp order by cp), '[]'::jsonb)
  into v_no
  from unnest(p_cps) as cp
  where not exists (
    select 1 from public.cp_poligonos c where c.codigo_postal = cp
  );

  return jsonb_build_object('encontrados', v_enc, 'no_encontrados', v_no);
end;
$$;

revoke execute on function public.buscar_cps(text[], boolean) from public, anon;
grant execute on function public.buscar_cps(text[], boolean) to authenticated;

-- Filtro espacial: de una lista de puntos [{id, lat, lng}], regresa
-- SOLO los que caen dentro de alguno de los CPs pedidos, con el CP
-- que los contiene ([{id, cp}]). Un punto en la frontera de dos CPs
-- se asigna al de clave menor.
create or replace function public.puntos_en_cps(
  p_cps text[],
  p_puntos jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_res jsonb;
begin
  if coalesce(array_length(p_cps, 1), 0) = 0 or array_length(p_cps, 1) > 100 then
    raise exception 'Manda entre 1 y 100 códigos postales';
  end if;
  if coalesce(jsonb_array_length(p_puntos), 0) = 0
     or jsonb_array_length(p_puntos) > 5000 then
    raise exception 'Manda entre 1 y 5000 puntos';
  end if;

  with pts as (
    select p ->> 'id' as id,
      ST_SetSRID(ST_MakePoint((p ->> 'lng')::float, (p ->> 'lat')::float), 4326) as g
    from jsonb_array_elements(p_puntos) as p
  ),
  sel as (
    select distinct on (pts.id) pts.id, c.codigo_postal
    from pts
    join public.cp_poligonos c
      on c.codigo_postal = any(p_cps)
     and c.geom && pts.g
     and ST_Intersects(c.geom, pts.g)
    order by pts.id, c.codigo_postal
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'cp', codigo_postal)), '[]'::jsonb)
  into v_res from sel;

  return v_res;
end;
$$;

revoke execute on function public.puntos_en_cps(text[], jsonb) from public, anon;
grant execute on function public.puntos_en_cps(text[], jsonb) to authenticated;
