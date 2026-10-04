-- SHINNAGE 가입자 관리: 유입 경로 · 수신 거부 · 관리자 통계
-- schema.sql 다음에 한 번 실행합니다. 여러 번 실행해도 안전합니다.

-- 1) 가입자 테이블 보강
alter table public.letter_subscribers
  add column if not exists source text check (source is null or char_length(source) <= 60),
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists letter_subscribers_unsubscribe_token_key
  on public.letter_subscribers (unsubscribe_token);

-- 방문자는 정해진 열만 채울 수 있음 (수신 거부 토큰·가입 시각은 서버가 정함)
revoke insert, update, delete on public.letter_subscribers from anon, authenticated;
grant insert (email, role, consent_version, source) on public.letter_subscribers to anon;

-- 2) 관리자 전용 스키마 (API에 노출되지 않음)
create schema if not exists admin;
revoke all on schema admin from public, anon, authenticated;

-- 개인정보 없는 이벤트 기록: 수신 거부로 이메일을 지워도 통계는 남음
create table if not exists admin.letter_events (
  id     bigint generated always as identity primary key,
  event  text not null check (event in ('subscribe', 'unsubscribe')),
  role   text,
  source text,
  at     timestamptz not null default now()
);

create or replace function admin.log_letter_subscribe() returns trigger
language plpgsql security definer set search_path = admin, public as $$
begin
  insert into admin.letter_events (event, role, source) values ('subscribe', new.role, new.source);
  return new;
end $$;

create or replace trigger letter_subscribe_log after insert on public.letter_subscribers
  for each row execute function admin.log_letter_subscribe();

-- 3) 수신 거부: 토큰을 아는 본인만, 호출 즉시 이메일 파기
create or replace function public.letter_unsubscribe(p_token uuid) returns boolean
language plpgsql security definer set search_path = public, admin as $$
declare r public.letter_subscribers;
begin
  delete from public.letter_subscribers where unsubscribe_token = p_token returning * into r;
  if r.id is null then return false; end if;
  insert into admin.letter_events (event, role, source) values ('unsubscribe', r.role, r.source);
  return true;
end $$;
revoke all on function public.letter_unsubscribe(uuid) from public;
grant execute on function public.letter_unsubscribe(uuid) to anon, authenticated;

-- 4) 관리자 보기 (SQL Editor에서 select * from admin.<이름>)
create or replace view admin.letter_summary as
select
  count(*)                                                     as active_total,
  count(*) filter (where role = 'CREATOR')                     as creators,
  count(*) filter (where role = 'EVALUATOR')                   as evaluators,
  count(*) filter (where role = 'BOTH')                        as both_roles,
  count(*) filter (where created_at > now() - interval '7 days')  as new_7d,
  count(*) filter (where created_at > now() - interval '30 days') as new_30d,
  (select count(*) from admin.letter_events
    where event = 'unsubscribe' and at > now() - interval '30 days') as unsub_30d
from public.letter_subscribers;

create or replace view admin.letter_monthly as
select to_char(date_trunc('month', at at time zone 'Asia/Seoul'), 'YYYY-MM') as month,
       count(*) filter (where event = 'subscribe')   as joined,
       count(*) filter (where event = 'unsubscribe') as left_,
       count(*) filter (where event = 'subscribe') - count(*) filter (where event = 'unsubscribe') as net,
       sum(count(*) filter (where event = 'subscribe') - count(*) filter (where event = 'unsubscribe'))
         over (order by date_trunc('month', at at time zone 'Asia/Seoul')) as running_total
from admin.letter_events
group by date_trunc('month', at at time zone 'Asia/Seoul')
order by 1 desc;

create or replace view admin.letter_sources as
select coalesce(source, '(직접 방문)') as source,
       count(*) filter (where event = 'subscribe')   as joined,
       count(*) filter (where event = 'unsubscribe') as left_
from admin.letter_events
group by 1
order by joined desc;

-- 레터 발송용 목록 (CSV 내보내기 → 뉴스레터 서비스에 업로드)
create or replace view admin.letter_export as
select email, role, source,
       to_char(created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') as joined_on,
       unsubscribe_token
from public.letter_subscribers
order by created_at;

revoke all on all tables in schema admin from public, anon, authenticated;
