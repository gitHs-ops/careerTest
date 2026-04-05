// ══════════════════════════════════════════════
// session_helper.js — 진로심리검사 세션 헬퍼
// career_index.html 이후 모든 페이지 상단에 추가
// ══════════════════════════════════════════════

// 세션에서 로그인 정보 읽기
function getSession() {
  return {
    id:   sessionStorage.getItem('ct_id')   || '',
    type: sessionStorage.getItem('ct_type') || '',  // 'email' | 'phone'
    role: sessionStorage.getItem('ct_role') || ''   // 'user' | 'admin'
  };
}

// 세션 유효성 체크 — 없으면 로그인 페이지로 이동
function requireSession() {
  const s = getSession();
  if (!s.id) {
    alert('로그인이 필요합니다.');
    window.location.href = 'career_login.html'; // ← 로그인 페이지명으로 수정
    return null;
  }
  return s;
}

// 세션 초기화 (로그아웃)
function clearSession() {
  sessionStorage.removeItem('ct_id');
  sessionStorage.removeItem('ct_type');
  sessionStorage.removeItem('ct_role');
}
