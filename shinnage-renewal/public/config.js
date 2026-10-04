// 배포 설정. 비워 두면 레터 신청 폼이 안내 문구만 보여 줍니다(사이트는 정상 동작).
// anon key는 공개용 키입니다. RLS 정책(supabase/schema.sql)이 '추가만 가능'하게 막아 줍니다.
window.SHINNAGE_CONFIG = {
  supabaseUrl: 'https://evcbgjhlemwtlzhyldwk.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2Y2JnamhsZW13dGx6aHlsZHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTYyMTAsImV4cCI6MjA5Mzk5MjIxMH0.3d9U4X3GBbod4yfUdzQZKjXoep_3E9l5bQQP5YSyC3o'
};
