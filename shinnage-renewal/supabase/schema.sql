-- SHINNAGE 리뉴얼: 월간 레터 신청 + keep-alive 용 최소 테이블
-- Supabase 대시보드 → SQL Editor에서 한 번 실행하세요.

-- 1) 월간 레터 신청자: 누구나 '추가'만 가능, 조회·수정·삭제는 불가
create table if not exists public.letter_subscribers (
  id              bigint generated always as identity primary key,
  email           text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role            text not null default 'EVALUATOR' check (role in ('CREATOR', 'EVALUATOR', 'BOTH')),
  consent_version text not null default '1.0',
  created_at      timestamptz not null default now(),
  unsubscribed_at timestamptz
);
alter table public.letter_subscribers enable row level security;

drop policy if exists "anyone can subscribe" on public.letter_subscribers;
create policy "anyone can subscribe" on public.letter_subscribers
  for insert to anon with check (unsubscribed_at is null);

-- 2) keep-alive: 주기적으로 읽기만 하는 1행짜리 테이블
create table if not exists public.heartbeat (
  id int primary key default 1 check (id = 1),
  note text not null default 'shinnage keep-alive'
);
insert into public.heartbeat (id) values (1) on conflict do nothing;
alter table public.heartbeat enable row level security;

drop policy if exists "heartbeat readable" on public.heartbeat;
create policy "heartbeat readable" on public.heartbeat
  for select to anon using (true);
