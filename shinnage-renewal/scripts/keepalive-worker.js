// Cloudflare Workers Cron 용 keep-alive (무료, GitHub Actions의 60일 비활성 정지 문제 없음)
// 설정: Worker 생성 → 이 코드 붙여넣기 → Settings → Variables에 SUPABASE_URL, SUPABASE_ANON_KEY
//       → Triggers → Cron: "0 3 */2 * *" (이틀마다 03:00 UTC)
export default {
  async scheduled(_event, env) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/heartbeat?select=id&limit=1`, {
      headers: { apikey: env.SUPABASE_ANON_KEY },
    });
    if (!res.ok) throw new Error(`keep-alive failed: ${res.status}`);
  },
};
