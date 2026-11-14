-- Limbo schema. Idempotent: safe to run on every deploy.
-- Nexconn carries the messages; Postgres holds what must be authoritative:
-- vote tallies, pool seats (fair ordering), reports, rate limits and metrics.

create table if not exists users (
  id            text primary key check (id ~ '^[A-Za-z0-9]{1,64}$'), -- also the Nexconn user ID
  display_name  text not null,
  avatar_color  text not null,
  language      text not null default 'en',
  is_agent      boolean not null default false,  -- verified airline / airport / agency staff
  agent_org     text,
  is_sim        boolean not null default false,  -- simulated traveller used in demo rooms
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists rooms (
  id           uuid primary key default gen_random_uuid(),
  room_key     text not null unique,                 -- flight:AI101:2026-12-14
  mode         text not null check (mode in ('flight', 'train', 'bus')),
  code         text not null,
  travel_date  date not null,
  channel_id   text not null unique,                 -- Nexconn community channel ID
  channel_ready boolean not null default false,      -- community channel created on Nexconn
  is_demo      boolean not null default false,
  status       text not null default 'open' check (status in ('open', 'read_only', 'archived')),
  created_by   text references users(id),
  created_at   timestamptz not null default now()
);

create table if not exists room_members (
  room_id      uuid not null references rooms(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_user on room_members (user_id, last_seen_at desc);

create table if not exists cards (
  id            uuid primary key,
  room_id       uuid not null references rooms(id) on delete cascade,
  author_id     text not null references users(id),
  kind          text not null,
  official      boolean not null default false,
  content       jsonb not null,          -- the exact payload sent as the Limbo:Intel message
  message_id    text unique,             -- Nexconn message ID (null until sent)
  confirms      int not null default 0,
  disputes      int not null default 0,
  last_confirm_at timestamptz,
  superseded    boolean not null default false,
  removed       boolean not null default false,
  ver           int not null default 1,
  supersedes    uuid references cards(id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index if not exists cards_room on cards (room_id, created_at desc);

create table if not exists votes (
  card_id    uuid not null references cards(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  vote       text not null check (vote in ('confirm', 'dispute')),
  updated_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

create table if not exists pools (
  id               uuid primary key,
  room_id          uuid not null references rooms(id) on delete cascade,
  organiser_id     text not null references users(id),
  kind             text not null check (kind in ('cab', 'hotel', 'meal')),
  capacity         int not null check (capacity between 2 and 8),
  content          jsonb not null,       -- the exact payload sent as the Limbo:Pool message
  status           text not null default 'open' check (status in ('open', 'full', 'done', 'cancelled')),
  message_id       text unique,
  group_channel_id text not null unique, -- Nexconn group channel for the pool's members
  ver              int not null default 1,
  created_at       timestamptz not null default now()
);
create index if not exists pools_room on pools (room_id, created_at desc);

-- Seat order is decided inside a transaction holding a row lock on the pool,
-- so two simultaneous claims for the last seat always get a single, consistent answer.
create table if not exists pool_members (
  pool_id   uuid not null references pools(id) on delete cascade,
  user_id   text not null references users(id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp(),
  primary key (pool_id, user_id)
);

create table if not exists pool_waitlist (
  pool_id    uuid not null references pools(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (pool_id, user_id)
);

create table if not exists reports (
  id          bigserial primary key,
  room_id     uuid references rooms(id) on delete cascade,
  reporter_id text not null references users(id),
  target_type text not null check (target_type in ('message', 'card', 'pool', 'user')),
  target_id   text not null,
  reason      text not null,
  status      text not null default 'open',
  created_at  timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create table if not exists rate_limits (
  bucket       text primary key,
  window_start timestamptz not null,
  hits         int not null
);

-- Product analytics for the traction dashboard (demo rooms are excluded at query time).
create table if not exists events (
  id         bigserial primary key,
  name       text not null,
  user_id    text,
  room_id    uuid,
  props      jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists events_name_time on events (name, created_at);

create table if not exists demo_runs (
  room_id    uuid primary key references rooms(id) on delete cascade,
  owner_id   text not null references users(id),
  step       int not null default 0,
  started_at timestamptz not null default now()
);
