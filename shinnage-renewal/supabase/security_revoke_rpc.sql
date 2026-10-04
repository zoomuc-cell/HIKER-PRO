-- 보안 조치 (2026-10-04 적용 완료): 서버 전용 함수를 공개 API에서 호출하지 못하게 막음
-- dispatch_push_for_card 는 푸시 구독자의 endpoint·p256dh·auth_token 을 돌려주므로 외부 호출 차단이 필요했음
-- 서버(service_role, Edge Function 등)에서는 그대로 호출 가능
revoke execute on function public.dispatch_push_for_card(uuid) from public, anon, authenticated;
revoke execute on function public.mark_digest_sent(uuid)       from public, anon, authenticated;
revoke execute on function public.build_weekly_digest(uuid)    from public, anon;
revoke execute on function public.letter_unsubscribe(uuid)     from authenticated;

-- 되돌리기가 필요하면:
-- grant execute on function public.dispatch_push_for_card(uuid) to anon, authenticated;
