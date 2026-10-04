// 배포 설정. 비워 두면 레터 신청 폼이 안내 문구만 보여 줍니다(사이트는 정상 동작).
// 공개용 키(sb_publishable_...)입니다. 예전 eyJ... 형식 키는 이 프로젝트에서 동작하지 않습니다. RLS 정책(supabase/schema.sql)이 '추가만 가능'하게 막아 줍니다.
window.SHINNAGE_CONFIG = {
  supabaseUrl: 'https://evcbgjhlemwtlzhyldwk.supabase.co',
  supabaseAnonKey: 'sb_publishable_0dJWPyfrjjRRT7-fxPUAwA_cjHdMOZp'
};
