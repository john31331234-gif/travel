// 트립알림 위젯 — Scriptable(iOS) 스크립트
// 사이트(https://john31331234-gif.github.io/travel/)에 로그인한 계정의 일정을 읽어 홈 화면 · 잠금 화면 위젯으로 보여 줍니다.
//
// 설치: Scriptable 앱 → + → 이 파일 내용을 모두 붙여 넣기 → 이름 "트립알림" → ▶ 실행 → 사이트와 같은 이메일 · 비밀번호 입력
// 위젯: 홈 화면 길게 누르기 → + → Scriptable → 크기 선택 → 위젯 편집 → Script: 트립알림
//       Parameter 칸에 "ticket"을 쓰면 보딩패스(노랑 · 검정) 테마로 보여요.

const SITE_URL = 'https://john31331234-gif.github.io/travel/';
const API_KEY = 'AIzaSyAqW77wiHgampjaegS3LtBb1FUegdHZvxo';
const PROJECT_ID = 'travel-6fd2d';
const KEY_CRED = 'tripalarm.credentials';
const KEY_TOKEN = 'tripalarm.token';
const CACHE_FILE = 'tripalarm-cache.json';

// 사이트의 여행지 목록과 같은 id → 시간대
const TZ = { paris: 'Europe/Paris', barcelona: 'Europe/Madrid', rome: 'Europe/Rome', london: 'Europe/London', tokyo: 'Asia/Tokyo', osaka: 'Asia/Tokyo', fukuoka: 'Asia/Tokyo', taipei: 'Asia/Taipei', hongkong: 'Asia/Hong_Kong', bangkok: 'Asia/Bangkok', danang: 'Asia/Ho_Chi_Minh', singapore: 'Asia/Singapore', newyork: 'America/New_York', la: 'America/Los_Angeles', sydney: 'Australia/Sydney', jeju: 'Asia/Seoul' };

// ---------- 시간 계산 (사이트와 같은 규칙) ----------
const pad = n => String(n).padStart(2, '0');
function partsIn(ms, tz) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
function tzOffset(ms, tz) { const p = partsIn(ms, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; }
function zonedToEpoch(date, time, tz) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - tzOffset(guess, tz);
  return guess - tzOffset(ms, tz);
}
const dateIn = (ms, tz) => { const p = partsIn(ms, tz); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const shortDate = d => { const [, m, dd] = d.split('-').map(Number); return `${m}.${dd} (${WEEK[new Date(d + 'T12:00:00Z').getUTCDay()]})`; };

// 위젯에 보여 줄 내용을 계산한다(그리기와 분리해서 테스트할 수 있게)
function buildView(trip, now) {
  const tz = TZ[trip.city] || 'Asia/Seoul';
  const items = (trip.items || []).filter(i => i && i.date && i.time).map(i => {
    const start = zonedToEpoch(i.date, i.time, tz);
    return { ...i, start, end: start + (i.duration || 60) * 60000 };
  }).sort((a, b) => a.start - b.start);
  const days = [...new Set(items.map(i => i.date))].sort();
  const today = dateIn(now, tz);
  const dayIdx = days.indexOf(today);
  const segs = (trip.extras && trip.extras.transport && trip.extras.transport.segs) || [];
  const flagOf = it => {
    const n = days.indexOf(it.date) + 1;
    const s = segs.find(x => { const m = String(x.plan || '').match(/(\d{1,2}):(\d{2})/); return parseInt(x.day, 10) === n && m && `${pad(m[1])}:${m[2]}` === it.time; });
    return s && s.level !== 'ok' ? (s.level === 'late' ? '지연' : '빠듯') : '';
  };
  const current = items.find(i => i.start <= now && i.end > now) || null;
  const next = items.find(i => i.start > now) || null;
  // 진행 중인 일정이 있어도 다음 일정이 30분 안에 시작하면 다음 일정을 크게 보여 준다
  const focus = next && (!current || next.start - now < 30 * 60000) ? next : current;
  // 크게 보여 주는 일정과 진행 중인 일정은 목록에서 뺀다(진행 중인 일정은 카드 안에 따로 표시)
  const upcoming = items.filter(i => i.start > now && i !== focus).slice(0, 8);
  const hhmm = ms => { const p = partsIn(ms, tz); return `${pad(p.h)}:${pad(p.mi)}`; };
  const b = trip.extras && trip.extras.budget;
  let budget = null;
  if (b && Array.isArray(b.lines)) {
    const krw = l => l.cur === 'KRW' ? l.unit * l.qty : b.rate ? l.unit * l.qty * b.rate : (l.budget || 0);
    const total = b.lines.reduce((s, l) => s + krw(l), 0), spent = b.lines.reduce((s, l) => s + (l.actual || 0), 0);
    budget = { total, left: total - spent };
  }
  let label;
  if (!items.length) label = '일정 없음';
  else if (dayIdx >= 0) label = `${dayIdx + 1}일차`;
  else if (today < days[0]) label = `출발까지 ${Math.max(1, Math.round((zonedToEpoch(days[0], '00:00', tz) - now) / 86400000))}일`;
  else label = '여행 끝';
  return {
    tripName: trip.tripName || '트립알림', label, today,
    focus: focus && { ...focus, isNow: focus === current, flag: flagOf(focus), dateLabel: focus.date === today ? '' : shortDate(focus.date), endTime: hhmm(focus.end) },
    now: current && current !== focus ? { title: current.title, endTime: hhmm(current.end) } : null,
    upcoming: upcoming.map(i => ({ ...i, flag: flagOf(i), isToday: i.date === today, dateLabel: shortDate(i.date) })),
    budget,
    refreshAt: Math.min(...[now + 30 * 60000, focus ? focus.start : Infinity, focus ? focus.end : Infinity].filter(t => t > now)),
  };
}

// ---------- Firebase 로그인 · 일정 읽기 ----------
async function postJSON(url, body) {
  const r = new Request(url);
  r.method = 'POST'; r.headers = { 'Content-Type': 'application/json' }; r.body = JSON.stringify(body);
  const j = await r.loadJSON();
  if (j && j.error) { const e = new Error(j.error.message || 'error'); e.code = j.error.message; throw e; }
  return j;
}
function readKey(k) { return Keychain.contains(k) ? JSON.parse(Keychain.get(k)) : null; }
async function getToken() {
  const t = readKey(KEY_TOKEN);
  if (t && t.exp > Date.now() + 60000) return t;
  if (t && t.refresh) {
    try {
      const j = await postJSON(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, { grant_type: 'refresh_token', refresh_token: t.refresh });
      const nt = { id: j.id_token, refresh: j.refresh_token, uid: j.user_id, exp: Date.now() + (+j.expires_in) * 1000 };
      Keychain.set(KEY_TOKEN, JSON.stringify(nt));
      return nt;
    } catch (e) { /* 아래에서 다시 로그인 */ }
  }
  const c = readKey(KEY_CRED);
  if (!c) { const e = new Error('로그인 정보가 없어요'); e.code = 'NO_LOGIN'; throw e; }
  const j = await postJSON(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, { email: c.email, password: c.password, returnSecureToken: true });
  const nt = { id: j.idToken, refresh: j.refreshToken, uid: j.localId, exp: Date.now() + (+j.expiresIn) * 1000 };
  Keychain.set(KEY_TOKEN, JSON.stringify(nt));
  return nt;
}
function decode(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) { const o = {}; const f = v.mapValue.fields || {}; for (const k in f) o[k] = decode(f[k]); return o; }
  return null;
}
async function loadTrip() {
  const fm = FileManager.local(), cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
  try {
    const t = await getToken();
    const r = new Request(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${t.uid}/trips/current`);
    r.headers = { Authorization: `Bearer ${t.id}` };
    const j = await r.loadJSON();
    if (r.response && r.response.statusCode === 404) return { trip: { items: [] }, fresh: true };
    if (j.error) { const e = new Error(j.error.message); e.code = j.error.status; throw e; }
    const trip = decode({ mapValue: { fields: j.fields || {} } });
    fm.writeString(cachePath, JSON.stringify({ at: Date.now(), trip }));
    return { trip, fresh: true };
  } catch (e) {
    if (e.code === 'NO_LOGIN' || /INVALID|PASSWORD|EMAIL/.test(String(e.code))) throw e;
    // 인터넷이 안 되면 마지막으로 받은 일정을 보여 준다
    if (fm.fileExists(cachePath)) { const c = JSON.parse(fm.readString(cachePath)); return { trip: c.trip, fresh: false, at: c.at }; }
    throw e;
  }
}

// ---------- 그리기 ----------
const THEMES = {
  clean: { bg: Color.dynamic(new Color('#FFFFFF'), new Color('#1C1C1E')), card: Color.dynamic(new Color('#F2F4F6'), new Color('#2C2C2E')), text: Color.dynamic(new Color('#191F28'), new Color('#F2F2F7')), sub: Color.dynamic(new Color('#6B7684'), new Color('#9E9EA6')), accent: new Color('#3182F6'), warn: new Color('#F04452'), tight: new Color('#E8A100') },
  ticket: { bg: new Color('#0F1217'), card: new Color('#FFB020'), text: new Color('#ECEEF2'), sub: new Color('#8C94A6'), accent: new Color('#FFB020'), warn: new Color('#FF6B5A'), tight: new Color('#FFB020'), cardText: new Color('#14161B') },
};
function addText(stack, str, size, color, weight, lines) {
  const t = stack.addText(String(str));
  t.font = weight === 'heavy' ? Font.heavySystemFont(size) : weight === 'bold' ? Font.boldSystemFont(size) : weight === 'semibold' ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = color; t.lineLimit = lines || 1; t.minimumScaleFactor = 0.7;
  return t;
}
function addRelative(stack, ms, size, color) {
  const d = stack.addDate(new Date(ms));
  d.applyRelativeStyle(); d.font = Font.semiboldSystemFont(size); d.textColor = color; d.lineLimit = 1; d.minimumScaleFactor = 0.7;
  return d;
}
function flagText(stack, flag, th, size) {
  if (!flag) return;
  stack.addSpacer(4);
  addText(stack, flag, size, flag === '지연' ? th.warn : th.tight, 'bold');
}

function focusBlock(parent, v, th, family) {
  const f = v.focus;
  const big = family === 'small' ? 30 : 34;
  const box = parent.addStack(); box.layoutVertically();
  if (th.cardText) { box.backgroundColor = th.card; box.cornerRadius = 14; box.setPadding(8, 10, 8, 10); }
  const ink = th.cardText || th.text, sub = th.cardText ? new Color('#14161B', 0.7) : th.sub;
  const top = box.addStack(); top.centerAlignContent();
  addText(top, f.isNow ? '지금 진행 중' : f.dateLabel ? `다음 · ${f.dateLabel}` : '다음 일정', 11, th.cardText ? ink : th.accent, 'semibold');
  flagText(top, f.flag, th, 11);
  box.addSpacer(2);
  addText(box, f.time, big, ink, 'heavy');
  addText(box, f.title, family === 'small' ? 14 : 15, ink, 'bold', 2);
  box.addSpacer(2);
  if (f.isNow) addText(box, `${f.endTime}까지`, 12, sub, 'semibold');
  else addRelative(box, f.start, 12, sub);
  if (v.now && family === 'large') { box.addSpacer(4); addText(box, `지금 · ${v.now.title} ~${v.now.endTime}`, 11, sub, 'regular'); }
}

function makeWidget(v, family, th, stale) {
  const w = new ListWidget();
  w.backgroundColor = th.bg; w.url = SITE_URL;
  w.refreshAfterDate = new Date(v.refreshAt);
  const inline = family === 'accessoryInline', rect = family === 'accessoryRectangular', circ = family === 'accessoryCircular';

  if (inline || rect || circ) {
    // 잠금 화면 위젯은 시스템 색을 따른다
    const f = v.focus;
    if (!f) { addText(w, inline ? '트립알림 · 남은 일정 없음' : '남은 일정 없음', 12, Color.white(), 'semibold'); return w; }
    if (circ) { addText(w, f.time, 13, Color.white(), 'bold'); addText(w, f.title, 9, Color.white(), 'semibold'); return w; }
    if (inline) { addText(w, `${f.time} ${f.title}`, 12, Color.white(), 'semibold'); return w; }
    addText(w, `${f.isNow ? '진행 중' : '다음'} · ${v.label}`, 11, Color.white(), 'semibold');
    addText(w, `${f.time} ${f.title}`, 15, Color.white(), 'bold');
    if (!f.isNow) addRelative(w, f.start, 13, Color.white());
    return w;
  }

  const pad = family === 'small' ? 14 : 16;
  w.setPadding(pad, pad, pad, pad);
  const head = w.addStack(); head.centerAlignContent();
  const ic = head.addImage(SFSymbol.named('airplane').image); ic.imageSize = new Size(12, 12); ic.tintColor = th.accent;
  head.addSpacer(4);
  addText(head, v.label, 11, th.sub, 'semibold');
  head.addSpacer();
  if (family !== 'small') addText(head, v.tripName, 11, th.sub, 'regular');
  w.addSpacer(6);

  if (!v.focus) {
    addText(w, v.label === '일정 없음' ? '사이트에서 일정을 올려 주세요' : '남은 일정이 없어요', 15, th.text, 'bold', 2);
    w.addSpacer();
    return w;
  }

  if (family === 'small') {
    focusBlock(w, v, th, family);
    w.addSpacer();
  } else if (family === 'medium') {
    const row = w.addStack(); row.layoutHorizontally(); row.topAlignContent();
    const left = row.addStack(); left.layoutVertically(); left.size = new Size(140, 0);
    focusBlock(left, v, th, family);
    row.addSpacer(12);
    const right = row.addStack(); right.layoutVertically();
    listRows(right, v.upcoming.slice(0, 4), th, 12);
    w.addSpacer();
  } else {
    focusBlock(w, v, th, family);
    w.addSpacer(10);
    addText(w, '이어서', 11, th.sub, 'semibold');
    w.addSpacer(4);
    listRows(w, v.upcoming.slice(0, 7), th, 13);
    w.addSpacer();
    if (v.budget) {
      const br = w.addStack(); br.centerAlignContent();
      addText(br, '남은 예산', 11, th.sub, 'semibold'); br.addSpacer();
      addText(br, '₩' + Math.round(v.budget.left).toLocaleString(), 13, th.text, 'bold');
    }
  }
  if (stale) { const s = w.addStack(); addText(s, '오프라인 · 마지막으로 받은 일정', 9, th.sub, 'regular'); }
  return w;
}

function listRows(parent, items, th, size) {
  let lastDate = null;
  items.forEach((i, idx) => {
    if (!i.isToday && i.date !== lastDate) { addText(parent, i.dateLabel, size - 2, th.sub, 'semibold'); parent.addSpacer(2); }
    lastDate = i.date;
    const r = parent.addStack(); r.centerAlignContent();
    addText(r, i.time, size, th.accent, 'bold'); r.addSpacer(6);
    addText(r, i.title, size, th.text, 'semibold');
    flagText(r, i.flag, th, size - 2);
    if (idx < items.length - 1) parent.addSpacer(4);
  });
}

function messageWidget(title, body, th) {
  const w = new ListWidget(); w.backgroundColor = th.bg; w.url = SITE_URL; w.setPadding(14, 14, 14, 14);
  addText(w, '트립알림', 11, th.accent, 'semibold'); w.addSpacer(4);
  addText(w, title, 14, th.text, 'bold', 2); w.addSpacer(2);
  addText(w, body, 11, th.sub, 'regular', 4);
  return w;
}

// ---------- 앱에서 실행했을 때: 로그인 · 미리보기 ----------
async function askLogin() {
  const a = new Alert();
  a.title = '트립알림 로그인';
  a.message = '사이트에서 쓰는 이메일과 비밀번호를 입력해 주세요. 이 아이폰의 키체인에만 저장돼요.';
  const old = readKey(KEY_CRED);
  a.addTextField('이메일', old ? old.email : '');
  a.addSecureTextField('비밀번호', '');
  a.addAction('저장');
  a.addCancelAction('취소');
  if (await a.present() === -1) return false;
  const email = a.textFieldValue(0).trim(), password = a.textFieldValue(1);
  Keychain.set(KEY_CRED, JSON.stringify({ email, password }));
  if (Keychain.contains(KEY_TOKEN)) Keychain.remove(KEY_TOKEN);
  return true;
}

async function main() {
  const family = config.widgetFamily || 'medium';
  const th = THEMES[(args.widgetParameter || '').trim().toLowerCase()] || THEMES.clean;
  if (config.runsInApp) {
    if (!Keychain.contains(KEY_CRED)) { if (!(await askLogin())) return; }
    const m = new Alert();
    m.title = '트립알림 위젯';
    m.addAction('미리보기 · 작게'); m.addAction('미리보기 · 중간'); m.addAction('미리보기 · 크게'); m.addAction('계정 다시 입력'); m.addCancelAction('닫기');
    const pick = await m.present();
    if (pick === 3) { await askLogin(); return; }
    if (pick < 0) return;
    const fam = ['small', 'medium', 'large'][pick];
    const w = await render(fam, th);
    if (fam === 'small') await w.presentSmall(); else if (fam === 'medium') await w.presentMedium(); else await w.presentLarge();
    return;
  }
  Script.setWidget(await render(family, th));
}

async function render(family, th) {
  try {
    const { trip, fresh } = await loadTrip();
    return makeWidget(buildView(trip, Date.now()), family, th, !fresh);
  } catch (e) {
    if (e.code === 'NO_LOGIN') return messageWidget('로그인이 필요해요', 'Scriptable 앱에서 이 스크립트를 한 번 실행해 로그인해 주세요.', th);
    if (/INVALID|PASSWORD|EMAIL/.test(String(e.code))) return messageWidget('로그인 정보가 맞지 않아요', 'Scriptable에서 실행 → 계정 다시 입력을 눌러 주세요.', th);
    return messageWidget('일정을 불러오지 못했어요', String(e.message || e).slice(0, 80), th);
  }
}

await main();
Script.complete();
