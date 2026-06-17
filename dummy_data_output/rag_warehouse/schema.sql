-- Supabase RAG warehouse schema
-- Reference: pgvector + Storage Access Control docs

create schema if not exists rag;

create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists rag.source_files (
  id bigint generated always as identity primary key,
  owner_user_id uuid,
  source_kind text not null check (source_kind in ('csv', 'json', 'markdown', 'upload')),
  original_filename text not null,
  storage_bucket text not null default 'agent-uploads',
  storage_path text not null,
  source_month smallint,
  source_year smallint,
  content_hash text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists source_files_owner_month_idx
  on rag.source_files (owner_user_id, source_year, source_month);

create table if not exists rag.monthly_summary (
  id bigint generated always as identity primary key,
  source_file_id bigint references rag.source_files(id) on delete set null,
  year smallint not null check (year between 2000 and 2100),
  month smallint not null check (month between 1 and 12),
  month_open numeric(12,1) not null,
  coverage numeric(12,1) not null,
  health_month_open numeric(12,1) not null,
  health_pure numeric(12,1) not null,
  health_refund numeric(12,1) not null,
  health_special numeric(12,1) not null,
  life_month_open numeric(12,1) not null,
  life_target numeric(12,1) not null,
  life_general numeric(12,1) not null,
  annuity_month_open numeric(12,1) not null,
  annuity_detail numeric(12,1) not null,
  savings_detail numeric(12,1) not null,
  market_total numeric(12,1) not null,
  market_share numeric(6,2) not null,
  competitor_coverage numeric(12,1) not null,
  business_days smallint not null,
  promo_cost_total numeric(12,1) not null,
  channel_check numeric(12,1) not null,
  product_check numeric(12,1) not null,
  gap numeric(12,1) not null,
  created_at timestamptz not null default now(),
  unique (year, month)
);

create index if not exists monthly_summary_year_month_idx
  on rag.monthly_summary (year desc, month desc);

create table if not exists rag.main_fact (
  id bigint generated always as identity primary key,
  source_file_id bigint references rag.source_files(id) on delete set null,
  year smallint not null check (year between 2000 and 2100),
  month smallint not null check (month between 1 and 12),
  channel text not null,
  major_category text not null,
  minor_category text not null,
  amount numeric(12,1) not null,
  created_at timestamptz not null default now()
);

create index if not exists main_fact_year_month_channel_idx
  on rag.main_fact (year desc, month desc, channel);

create table if not exists rag.monthly_events (
  id bigint generated always as identity primary key,
  source_file_id bigint references rag.source_files(id) on delete set null,
  year smallint not null check (year between 2000 and 2100),
  month smallint not null check (month between 1 and 12),
  event_type text not null,
  scenario text not null,
  impact_direction text not null,
  impact_strength text not null,
  target_scope text not null,
  created_at timestamptz not null default now()
);

create index if not exists monthly_events_year_month_idx
  on rag.monthly_events (year desc, month desc);

create table if not exists rag.special_products (
  id bigint generated always as identity primary key,
  source_file_id bigint references rag.source_files(id) on delete set null,
  year smallint not null check (year between 2000 and 2100),
  month smallint not null check (month between 1 and 12),
  product_name text not null,
  product_group text not null,
  major_category text not null,
  minor_category text not null,
  month_open numeric(12,1) not null,
  health_month_open numeric(12,1) not null,
  life_month_open numeric(12,1) not null,
  include_in_body boolean not null,
  managed boolean not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists special_products_year_month_idx
  on rag.special_products (year desc, month desc, include_in_body);

create table if not exists rag.channel_profile (
  id bigint generated always as identity primary key,
  source_file_id bigint references rag.source_files(id) on delete set null,
  category text not null,
  channel text not null,
  share numeric(6,2) not null,
  created_at timestamptz not null default now(),
  unique (category, channel)
);

create table if not exists rag.product_profile (
  id bigint generated always as identity primary key,
  source_file_id bigint references rag.source_files(id) on delete set null,
  major_category text not null,
  minor_category text not null,
  share numeric(6,2) not null,
  created_at timestamptz not null default now(),
  unique (major_category, minor_category)
);

create table if not exists rag.knowledge_chunks (
  id bigint generated always as identity primary key,
  source_file_id bigint references rag.source_files(id) on delete set null,
  source_kind text not null check (source_kind in ('markdown', 'summary_row', 'fact_row', 'event_row', 'product_row')),
  source_name text not null,
  source_key text not null,
  year smallint,
  month smallint,
  chunk_no integer not null,
  chunk_type text not null,
  search_text text not null,
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(search_text, ''))) stored,
  embedding extensions.vector(384),
  embedding_model text,
  embedding_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_name, source_key, chunk_no)
);

create index if not exists knowledge_chunks_search_text_trgm_idx
  on rag.knowledge_chunks using gin (search_text gin_trgm_ops);

create index if not exists knowledge_chunks_search_vector_idx
  on rag.knowledge_chunks using gin (search_vector);

create index if not exists knowledge_chunks_embedding_hnsw_idx
  on rag.knowledge_chunks using hnsw (embedding vector_cosine_ops);
