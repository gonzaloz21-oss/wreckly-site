-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run
create extension if not exists pgcrypto;

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new',           -- new | quoted | paid | closed | no_stock
  part text not null,
  year text, make text, model text, vin text,
  postal text,
  name text not null, email text not null, phone text,
  notes text,
  -- quote (filled by admin)
  yard_name text, yard_phone text, yard_address text, yard_email text,
  price_cents integer, deposit_cents integer,
  link_url text, link_id text,
  quoted_at timestamptz,
  paid_at timestamptz, payment_intent text,
  admin_notes text
);

create table if not exists yards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null, contact text, email text, phone text,
  address text, city text, vehicle_types text, notes text,
  status text not null default 'new'            -- new | active | paused
);

-- Lock the tables: only the server (service role key) can read/write.
alter table requests enable row level security;
alter table yards enable row level security;
