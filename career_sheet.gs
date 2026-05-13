// ══════════════════════════════════════════════════════
// career_sheet.gs  —  진로심리검사 회원 관리 + 토큰 로그
//
// 【설정 방법】
//   1. 구글 시트 '진로심리검사' ID 복사
//      (URL에서: /spreadsheets/d/[여기가_SHEET_ID]/edit)
//   2. 아래 SHEET_ID 에 붙여넣기
//   3. Apps Script → 배포 → 웹 앱
//      - 액세스: 모든 사용자
//      - 배포 후 URL을 career_index.html 의 SHEET_PROXY_URL 에 입력
//
// 【재배포 주의】
//   배포 관리 → 기존 배포 편집 → 새 버전 (URL 유지)
//
// 【시트 구성】
//   ① 대기목록 — 이용 신청자 (승인 전)
//   ② 회원목록 — 승인된 회원
//   ③ 토큰로그 — AI 검사 토큰 사용 이력
//   ④ 로그인로그 — 로그인 성공 이력
// ══════════════════════════════════════════════════════

const SHEET_ID        = '100uaEYfmzJVZPahwoD5f-SRk-XfLtFV6X80gga7Luak';
const SHEET_TOKEN_LOG = '토큰로그';   // 토큰 사용 이력 시트
const MEMBER_SHEET    = '회원목록';   // 회원 관리 시트
const WAIT_SHEET      = '대기목록';   // 처음 이용자 신청 대기
const LOGIN_LOG_SHEET = '로그인로그'; // 로그인 성공 이력

// GET 방식 처리 (웹에서 호출 — CORS 우회)
function doGet(e) {
  const action = e.parameter.action || '';
  Logger.log('action=' + action + ' / id=' + (e.parameter.id || '') + ' / name=' + (e.parameter.name || ''));

  // ── 관리자에게 신청 알림 ──
  if (action === 'notify') {
    return notifyAdmin(e.parameter.id || '', e.parameter.smsOnly === '1');
  }

  // ── 로그인 로그 기록 + 관리자 알림 ──
  if (action === 'loginLog') {
    return loginLog(e.parameter.id || '', e.parameter.type || '', e.parameter.time || '');
  }

  // ── 이메일/전화번호 조회 ──
  if (action === 'check') {
    return checkMember(e.parameter.id || '');
  }

  // ── 회원 등록 (관리자) ──
  if (action === 'register') {
    return registerMember(e.parameter.id || '', e.parameter.memo || '');
  }

  // ── 토큰 로그 기록 ──
  if (e.parameter.name) {
    return writeLog(e);
  }

  // ── 연결 확인 ──
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, message: 'career_sheet 정상 작동 중' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 로그인 로그 기록 + 관리자 알림 ──────────────────────
function loginLog(id, idType, timeStr) {
  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    let   sheet = ss.getSheetByName(LOGIN_LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(LOGIN_LOG_SHEET);
      sheet.appendRow(['일시(KST)', '이메일/전화번호', '유형']);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    const kst       = timeStr || Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const typeLabel = idType === 'email' ? '이메일' : '전화번호';
    sheet.appendRow([kst, id, typeLabel]);

    const ADMIN_EMAIL = 'khsq2011@gmail.com';
    MailApp.sendEmail({
      to:      ADMIN_EMAIL,
      subject: '[진로심리검사] 로그인 — ' + id,
      body:    '[진로심리검사] 로그인 알림\n\n' + typeLabel + ': ' + id + '\n시각: ' + kst
    });

    return result(true, '로그인 로그 완료');
  } catch(err) {
    Logger.log('loginLog 오류: ' + err.message);
    return result(false, err.message);
  }
}

// ── 관리자에게 신청 알림 + 대기목록 저장 ────────────────
function notifyAdmin(id, smsOnly) {
  try {
    // 대기목록 시트에 저장
    const ss   = SpreadsheetApp.openById(SHEET_ID);
    let   wait = ss.getSheetByName(WAIT_SHEET);
    if (!wait) {
      wait = ss.insertSheet(WAIT_SHEET);
      wait.appendRow(['신청일', '이메일/전화번호', '상태']);
      wait.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#d97706').setFontColor('#ffffff');
      wait.setFrozenRows(1);
    }
    const kstStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    // 중복 신청 방지
    const rows   = wait.getDataRange().getValues();
    const normalizeN = v => v.toString().trim().toLowerCase().replace(/^'/, '').replace(/-/g, '');
    const exists = rows.some((r, i) => i > 0 && normalizeN(r[1]||'') === normalizeN(id));
    if (!exists) {
      const idForSheet = /^\d/.test(id) ? "'" + id : id;
      wait.appendRow([kstStr, idForSheet, '대기중']);
    }

    // 관리자에게 이메일 알림 (전화번호 신청 시 생략)
    if (!smsOnly) {
      const ADMIN_EMAIL = 'khsq2011@gmail.com';
      const msg =
        '[진로심리검사] 이용 신청\n\n' +
        '신청자: ' + id + '\n\n' +
        '승인하려면 로그인 페이지에서 관리자 버튼으로 등록해 주세요.\n' +
        'https://giths-ops.github.io/careerTest/';
      MailApp.sendEmail({
        to:      ADMIN_EMAIL,
        subject: '[진로심리검사] 이용 신청 — ' + id,
        body:    msg
      });
    }
    return result(true, '신청 완료');
  } catch(err) {
    Logger.log('관리자 알림 오류: ' + err.message);
    return result(false, err.message);
  }
}

// ── 회원 조회 ──────────────────────────────────────────
function checkMember(id) {
  try {
    id = id.trim().toLowerCase();
    if (!id) return result(false, '입력값 없음');

    const ss    = SpreadsheetApp.openById(SHEET_ID);
    let   sheet = ss.getSheetByName(MEMBER_SHEET);
    if (!sheet) return result(false, '미등록');

    // 비교용 정규화: 앞 ' 제거 + 하이픈 제거 (전화번호 010-xxxx-xxxx 대응)
    const normalize = v => v.toString().trim().toLowerCase()
                            .replace(/^'/, '')
                            .replace(/-/g, '');
    const idNorm = normalize(id);

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const stored = normalize(data[i][2] || '');
      if (stored === idNorm) {
        return result(true, '등록된 회원', { name: data[i][1] || '' });
      }
    }
    return result(false, '미등록');
  } catch(err) {
    return result(false, err.message);
  }
}

// ── 회원 등록 ──────────────────────────────────────────
function registerMember(id, memo) {
  try {
    id = id.trim().toLowerCase();
    if (!id) return result(false, '입력값 없음');

    const ss    = SpreadsheetApp.openById(SHEET_ID);
    let   sheet = ss.getSheetByName(MEMBER_SHEET);

    // 시트 없으면 자동 생성
    if (!sheet) {
      sheet = ss.insertSheet(MEMBER_SHEET);
      sheet.appendRow(['등록일', '이름', '이메일/전화번호', '메모']);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#4a4a6a').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // 중복 확인 (정규화: ' 제거 + 하이픈 제거)
    const normalize = v => v.toString().trim().toLowerCase().replace(/^'/, '').replace(/-/g, '');
    const idNorm    = normalize(id);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const stored = normalize(data[i][2] || '');
      if (stored === idNorm) return result(true, '이미 등록된 회원');
    }

    const kstStr     = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const idForSheet = /^\d/.test(id) ? "'" + id : id;
    sheet.appendRow([kstStr, '', idForSheet, memo]);

    // 대기목록 상태 → 승인으로 변경
    const wait = ss.getSheetByName(WAIT_SHEET);
    if (wait) {
      const normalizeW = v => v.toString().trim().toLowerCase().replace(/^'/, '').replace(/-/g, '');
      const waitRows = wait.getDataRange().getValues();
      for (let i = 1; i < waitRows.length; i++) {
        const stored = normalizeW(waitRows[i][1] || '');
        if (stored === normalizeW(id)) {
          wait.getRange(i + 1, 3).setValue('✅ 승인');
          break;
        }
      }
    }

    // 승인 알림 발송
    const approvalMsg =
      '[진로심리검사] 이용 승인 안내\n\n' +
      '안녕하세요!\n회원 가입이 승인되었습니다.\n' +
      '아래 주소에서 서비스를 이용하실 수 있습니다.\n' +
      'https://giths-ops.github.io/careerTest/';

    const isPhone = /^01[016789]\d{7,8}$/.test(id.replace(/-/g, ''));
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id);

    // 사용자에게 발송
    if (isPhone) sendApprovalSms(id.replace(/-/g, ''), approvalMsg);
    if (isEmail) sendApprovalEmail(id, approvalMsg);

    // 관리자에게 조건부 발송 (사용자와 동일한 채널로)
    const adminMsg = '[승인 완료 알림]\n등록자: ' + id + '\n\n' + approvalMsg;
    if (isPhone) sendApprovalSms('01026989056', adminMsg);
    if (isEmail) sendApprovalEmail('khsq2011@gmail.com', adminMsg);

    return result(true, '등록 완료');
  } catch(err) {
    return result(false, err.message);
  }
}

// ── 승인 SMS (솔라피) ──────────────────────────────────
function sendApprovalSms(receiver, msg) {
  try {
    const API_KEY    = PropertiesService.getScriptProperties().getProperty('SOLAPI_KEY');
    const API_SECRET = PropertiesService.getScriptProperties().getProperty('SOLAPI_SECRET');
    const SENDER     = '01026989056';

    const dateTime  = new Date().toISOString();
    const salt      = Utilities.getUuid().replace(/-/g, '');
    const signBytes = Utilities.computeHmacSha256Signature(
      dateTime + salt, API_SECRET, Utilities.Charset.UTF_8
    );
    const signature  = signBytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
    const authHeader = `HMAC-SHA256 apiKey=${API_KEY}, date=${dateTime}, salt=${salt}, signature=${signature}`;

    const res = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': authHeader },
      payload: JSON.stringify({ message: { to: receiver, from: SENDER, text: msg } }),
      muteHttpExceptions: true
    });
    Logger.log('솔라피 응답: ' + res.getResponseCode() + ' / ' + res.getContentText());
  } catch(err) {
    Logger.log('승인 SMS 오류: ' + err.message);
  }
}

// ── 승인 이메일 (GAS MailApp) ──────────────────────────
function sendApprovalEmail(toEmail, msg) {
  try {
    MailApp.sendEmail({
      to:      toEmail,
      subject: '[진로심리검사] 이용이 승인되었습니다',
      body:    msg
    });
  } catch(err) {
    Logger.log('승인 이메일 오류: ' + err.message);
  }
}

// ── 토큰 로그 기록 ─────────────────────────────────────
function writeLog(e) {
  try {
    const name   = e.parameter.name   || '(미입력)';
    const tokens = parseInt(e.parameter.tokens || '0');
    const input  = parseInt(e.parameter.input  || '0');
    const output = parseInt(e.parameter.output || '0');
    const email  = e.parameter.email  || '(미로그인)';
    const type   = e.parameter.type   || '';        // 검사 종류 (홀랜드/적성/가치관 등)
    const ip     = e.parameter.ip     || '(알 수 없음)';
    const kstStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    const ss    = SpreadsheetApp.openById(SHEET_ID);
    let   sheet = ss.getSheetByName(SHEET_TOKEN_LOG);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_TOKEN_LOG);
      sheet.appendRow(['일시(KST)', '학생이름', '로그인계정', '검사종류', '입력토큰', '출력토큰', '합계토큰', 'IP주소']);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4a4a6a').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([kstStr, name, email, type, input, output, tokens, ip]);
    return result(true);
  } catch(err) {
    Logger.log('로그 오류: ' + err.message);
    return result(false, err.message);
  }
}

// ── 공통 응답 헬퍼 ────────────────────────────────────
function result(success, message, extra) {
  const obj = { success: success };
  if (message) obj.message = message;
  if (extra)   Object.assign(obj, extra);
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 테스트 함수 — GAS 에디터에서 직접 실행
function testLog() {
  const fakeEvent = {
    parameter: {
      name:   '홍길동',
      tokens: '1531',
      input:  '546',
      output: '985',
      email:  'test@example.com',
      type:   '홀랜드검사',
      ip:     '1.2.3.4'
    }
  };
  const res = writeLog(fakeEvent);
  Logger.log(res.getContent());
}
