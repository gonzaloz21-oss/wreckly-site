-- Wreckly — tabla yards en Supabase
-- Corre esto en el SQL Editor de Supabase antes de ejecutar el script Python

create table if not exists yards (
  id           bigserial primary key,
  hubspot_id   text unique not null,
  company      text not null,
  city         text,
  province     text default 'Ontario',
  postal_code  text,
  phone        text,
  email        text,
  lat          double precision,
  lng          double precision,
  active       boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Índice para búsquedas por coordenadas (PostGIS no es necesario para distancia simple)
create index if not exists yards_lat_lng_idx on yards (lat, lng);
create index if not exists yards_active_idx  on yards (active);

-- Función de distancia en km (Haversine) — usada desde Netlify function
create or replace function yards_near(
  buyer_lat double precision,
  buyer_lng double precision,
  radius_km double precision default 150,
  max_results int default 10
)
returns table (
  id          bigint,
  hubspot_id  text,
  company     text,
  city        text,
  phone       text,
  email       text,
  lat         double precision,
  lng         double precision,
  distance_km double precision
)
language sql stable as $$
  select
    y.id,
    y.hubspot_id,
    y.company,
    y.city,
    y.phone,
    y.email,
    y.lat,
    y.lng,
    round(
      (6371 * acos(
        cos(radians(buyer_lat)) * cos(radians(y.lat)) *
        cos(radians(y.lng) - radians(buyer_lng)) +
        sin(radians(buyer_lat)) * sin(radians(y.lat))
      ))::numeric, 1
    ) as distance_km
  from yards y
  where y.active = true
    and y.lat is not null
    and y.lng is not null
    and (6371 * acos(
      cos(radians(buyer_lat)) * cos(radians(y.lat)) *
      cos(radians(y.lng) - radians(buyer_lng)) +
      sin(radians(buyer_lat)) * sin(radians(y.lat))
    )) <= radius_km
  order by distance_km asc
  limit max_results;
$$;
