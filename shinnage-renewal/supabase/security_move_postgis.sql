-- 보안 조치: PostGIS를 public → extensions 스키마로 이동
-- 목적: public.spatial_ref_sys(PostGIS 좌표계 표)를 공개 키로 수정할 수 있는 문제 해결
-- 실행: Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run
-- 전체가 한 묶음으로 실행되어, 중간에 실패하면 모두 원래대로 돌아갑니다.
-- 전제: postcards.location에 데이터가 없을 때만 실행됩니다(있으면 자동 중단).

begin;

do $$ begin
  if (select count(*) from public.postcards where location is not null) > 0 then
    raise exception 'postcards.location 에 데이터가 있어 중단합니다. 먼저 백업 방법을 상의하세요.';
  end if;
end $$;

alter table public.postcards drop column location;
drop extension postgis;

create extension postgis with schema extensions;

alter table public.postcards add column location extensions.geography(Point, 4326);
create index idx_postcards_location on public.postcards using gist (location);

create or replace function public.search_postcards_nearby(
  p_lat double precision, p_lng double precision,
  p_radius_m integer default 2000, p_limit integer default 60)
returns table(id uuid, postcard_type text, status text, title text, excerpt text, mood text,
              media jsonb, place_label text, distance_m double precision,
              created_at timestamp with time zone, release_at timestamp with time zone)
language sql
stable
set search_path = public, extensions
as $function$
  select p.id, p.postcard_type, p.status, p.title, p.excerpt, p.mood, p.media,
         p.place_label,
         ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
         p.created_at, p.release_at
  from postcards p
  where p.status = 'published'
    and (p.release_at is null or p.release_at <= now())
    and p.location is not null
    and ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by distance_m asc
  limit p_limit;
$function$;

commit;

-- 확인: public_srs 가 비어 있고(null), ext_srs 가 채워져 있으면 성공
select to_regclass('public.spatial_ref_sys')     as public_srs,
       to_regclass('extensions.spatial_ref_sys') as ext_srs,
       (select count(*) from public.search_postcards_nearby(37.5665, 126.9780)) as nearby_search_ok;
