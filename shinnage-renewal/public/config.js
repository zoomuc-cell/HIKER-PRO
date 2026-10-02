// 배포 설정. 비워 두면 레터 신청 폼이 안내 문구만 보여 줍니다(사이트는 정상 동작).
// anon key는 공개용 키입니다. RLS 정책(supabase/schema.sql)이 '추가만 가능'하게 막아 줍니다.
window.SHINNAGE_CONFIG = {
  supabaseUrl: '',      // 예: https://evcbgjhlemwtlzhyldwk.supabase.co
  supabaseAnonKey: ''   // Supabase 대시보드 → Project Settings → API → anon public
};
