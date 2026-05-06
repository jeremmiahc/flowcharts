
create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  symbol text,
  direction text,
  entry_time text,
  contracts numeric,
  entry_price numeric,
  points_risked numeric,
  points_finished numeric,
  exit_type text,
  pnl numeric,
  rr numeric,
  orderflow_tags text[],
  mistake_tags text[],
  notes text,
  atas_screenshot boolean,
  bookmap_screenshot boolean,
  gamma_context jsonb
);

create table if not exists gamma_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  timestamp timestamptz,
  symbol text,
  target_symbol text,
  expiration text,
  dte numeric,
  qqq_spot numeric,
  nq_spot numeric,
  conversion_ratio numeric,
  qqq_call_wall numeric,
  nq_call_wall numeric,
  qqq_put_wall numeric,
  nq_put_wall numeric,
  qqq_gamma_flip numeric,
  nq_gamma_flip numeric,
  net_gex numeric,
  total_gex numeric,
  strike_data jsonb
);
