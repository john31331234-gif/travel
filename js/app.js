/* 트립알림 — 엑셀 여행 일정 + 시간 알림 + 여행 도구.
 * 서버 없이 브라우저에서만 동작하고, 데이터는 localStorage에 저장한다. */
(() => {
  'use strict';

  // ---------- 여행지 ----------
  const CITIES = [
    { id: 'paris', name: '파리', en: 'Paris', country: '프랑스', tz: 'Europe/Paris', cur: 'EUR', lat: 48.8566, lon: 2.3522 },
    { id: 'barcelona', name: '바르셀로나', en: 'Barcelona', country: '스페인', tz: 'Europe/Madrid', cur: 'EUR', lat: 41.3874, lon: 2.1686 },
    { id: 'rome', name: '로마', en: 'Rome', country: '이탈리아', tz: 'Europe/Rome', cur: 'EUR', lat: 41.9028, lon: 12.4964 },
    { id: 'london', name: '런던', en: 'London', country: '영국', tz: 'Europe/London', cur: 'GBP', lat: 51.5072, lon: -0.1276 },
    { id: 'tokyo', name: '도쿄', en: 'Tokyo', country: '일본', tz: 'Asia/Tokyo', cur: 'JPY', lat: 35.6762, lon: 139.6503 },
    { id: 'osaka', name: '오사카', en: 'Osaka', country: '일본', tz: 'Asia/Tokyo', cur: 'JPY', lat: 34.6937, lon: 135.5023 },
    { id: 'fukuoka', name: '후쿠오카', en: 'Fukuoka', country: '일본', tz: 'Asia/Tokyo', cur: 'JPY', lat: 33.5902, lon: 130.4017 },
    { id: 'taipei', name: '타이베이', en: 'Taipei', country: '대만', tz: 'Asia/Taipei', cur: 'TWD', lat: 25.033, lon: 121.5654 },
    { id: 'hongkong', name: '홍콩', en: 'Hong Kong', country: '홍콩', tz: 'Asia/Hong_Kong', cur: 'HKD', lat: 22.3193, lon: 114.1694 },
    { id: 'bangkok', name: '방콕', en: 'Bangkok', country: '태국', tz: 'Asia/Bangkok', cur: 'THB', lat: 13.7563, lon: 100.5018 },
    { id: 'danang', name: '다낭', en: 'Da Nang', country: '베트남', tz: 'Asia/Ho_Chi_Minh', cur: 'VND', lat: 16.0544, lon: 108.2022 },
    { id: 'singapore', name: '싱가포르', en: 'Singapore', country: '싱가포르', tz: 'Asia/Singapore', cur: 'SGD', lat: 1.3521, lon: 103.8198 },
    { id: 'newyork', name: '뉴욕', en: 'New York', country: '미국', tz: 'America/New_York', cur: 'USD', lat: 40.7128, lon: -74.006 },
    { id: 'la', name: 'LA', en: 'Los Angeles', country: '미국', tz: 'America/Los_Angeles', cur: 'USD', lat: 34.0522, lon: -118.2437 },
    { id: 'sydney', name: '시드니', en: 'Sydney', country: '호주', tz: 'Australia/Sydney', cur: 'AUD', lat: -33.8688, lon: 151.2093 },
    { id: 'jeju', name: '제주', en: 'Jeju', country: '한국', tz: 'Asia/Seoul', cur: 'KRW', lat: 33.4996, lon: 126.5312 },
  ];
  const HOME_TZ = 'Asia/Seoul';
  const LEADS = [0, 5, 10, 30, 60];
  const SNOOZE_MIN = 5;
  const DEFAULT_CHECKS = ['여권 · 항공권', '숙소 예약 확인', '보조배터리 · 충전기', '여행자 보험', '현지 유심 / eSIM', '우산'];

  // ---------- 저장소 ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('trip.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('trip.' + key, JSON.stringify(value)); } catch { /* 저장 공간 부족 등은 무시 */ }
    },
  };

  const state = {
    items: store.get('items', []),
    settings: Object.assign({ city: 'paris', lead: 10, notify: false, sound: true, tripName: '', startDate: '', skin: 'journey' }, store.get('settings', {})),
    fired: store.get('fired', {}),
    snooze: store.get('snooze', {}),
    checks: store.get('checks', null) || DEFAULT_CHECKS.map((t, i) => ({ id: 'c' + i, text: t, done: false })),
    extras: store.get('extras', null),
    view: 'today',
    day: null,
    pending: null,
    conv: { foreign: '', krw: '' },
  };
  const save = () => { scheduleShared(); store.set('items', state.items); store.set('settings', state.settings); store.set('fired', state.fired); store.set('snooze', state.snooze); store.set('checks', state.checks); store.set('extras', state.extras); };
  const city = () => CITIES.find(c => c.id === state.settings.city) || CITIES[0];

  // ---------- 시간 ----------
  const pad = n => String(n).padStart(2, '0');
  const partsIn = (ms, tz) => {
    const p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
  };
  const tzOffset = (ms, tz) => { const p = partsIn(ms, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
  // 여행지 현지 벽시계 시각(날짜+시:분) → 실제 시각(ms)
  const zonedToEpoch = (date, time, tz) => {
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = (time || '00:00').split(':').map(Number);
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    let ms = guess - tzOffset(guess, tz);
    ms = guess - tzOffset(ms, tz);
    return ms;
  };
  const dateIn = (ms, tz) => { const p = partsIn(ms, tz); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
  const timeIn = (ms, tz) => { const p = partsIn(ms, tz); return `${pad(p.h)}:${pad(p.mi)}`; };
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = date => WEEK[new Date(date + 'T12:00:00Z').getUTCDay()];
  const fmtDate = date => { const [, m, d] = date.split('-').map(Number); return `${m}월 ${d}일 ${weekday(date)}요일`; };
  const fmtShort = date => { const [, m, d] = date.split('-').map(Number); return `${m}.${d} (${weekday(date)})`; };
  const fmtDur = min => !min ? '' : min < 60 ? `${min}분` : (min % 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min / 60}시간`);
  const fmtLead = min => min == null ? '알림 꺼짐' : min === 0 ? '정각 알림' : min % 60 === 0 ? `${min / 60}시간 전 알림` : `${min}분 전 알림`;
  const fmtLeft = ms => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
  };
  const fmtLeftWords = ms => {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return `${m}분`;
    if (m < 1440) return `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}`;
    return `${Math.floor(m / 1440)}일`;
  };

  // ---------- 엑셀 파싱 ----------
  const FIELDS = {
    date: { label: '날짜', words: ['날짜', '일자', '날', 'date'] },
    day: { label: '일차', words: ['일차', 'day'] },
    // "종료 시간"이 시간 열로 잡히지 않도록 종료를 먼저 맞춘다
    end: { label: '종료', words: ['종료', '끝', '도착', 'end'] },
    time: { label: '시간', words: ['시간', '시각', '시작', '출발', 'time', 'start'] },
    title: { label: '일정', words: ['일정', '제목', '내용', '활동', '할일', '할 일', '이름', 'title', 'event', 'activity', 'plan', 'name'] },
    place: { label: '장소', words: ['장소', '위치', '주소', '어디', 'place', 'location', 'address', 'where'] },
    memo: { label: '메모', words: ['메모', '비고', '참고', '설명', '노트', 'note', 'memo', 'desc'] },
    remind: { label: '알림', words: ['알림', '알람', '리마인드', 'remind', 'alert', 'alarm'] },
    category: { label: '구분', words: ['구분', '분류', '종류', '카테고리', 'category', 'type'] },
    map: { label: '지도 링크', words: ['지도', '링크', 'map', 'url', 'link'] },
  };
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
  const guessMapping = headers => {
    const map = {};
    const used = new Set();
    // 일정·날짜처럼 다른 단어를 포함하기 쉬운 열은 정확히 같은 이름을 먼저 맞춘다
    for (const pass of ['exact', 'contains']) {
      for (const [field, def] of Object.entries(FIELDS)) {
        if (map[field] != null) continue;
        const idx = headers.findIndex((h, i) => !used.has(i) && def.words.some(w => pass === 'exact' ? norm(h) === norm(w) : norm(h).includes(norm(w))));
        if (idx >= 0) { map[field] = idx; used.add(idx); }
      }
    }
    return map;
  };

  const serialToDate = n => { const ms = Math.round((n - 25569) * 86400000); const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const fracToTime = f => { const mins = Math.round((f % 1) * 1440) % 1440; return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`; };
  // today: 'YYYY-MM-DD'. 연도가 없는 날짜(1/18)는 두 달 넘게 지난 날이면 내년으로 본다.
  const parseDate = (v, today) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v > 59 ? serialToDate(Math.floor(v)) : null;
    const s = String(v).trim();
    let m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    if (!m) return null;
    const y = +today.slice(0, 4);
    const d = `${y}-${pad(m[1])}-${pad(m[2])}`;
    const cutoff = new Date(today + 'T12:00:00Z'); cutoff.setUTCDate(cutoff.getUTCDate() - 60);
    return d < cutoff.toISOString().slice(0, 10) ? `${y + 1}-${pad(m[1])}-${pad(m[2])}` : d;
  };
  // "05:00~06:00", "9:00-10:30" 같은 시간 범위 → [시작, 종료]
  const splitRange = v => {
    if (typeof v !== 'string') return [v, null];
    // 오래된 Safari(iOS 16.3 이하)는 lookbehind 정규식을 모르므로 쓰지 않는다
    const m = v.split(/\s*[~〜–—]\s*|\s+-\s+/);
    if (m.length >= 2) return [m[0], m[1]];
    const h = v.match(/^(.*\d)-(\d{1,2}\s*[:시].*)$/);
    return h ? [h[1], h[2]] : [v, null];
  };
  const parseTime = v => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v < 1 ? fracToTime(v) : (v % 1 ? fracToTime(v) : (v < 24 ? `${pad(v)}:00` : null));
    const s = String(v).trim().toLowerCase();
    const pm = /오후|pm|저녁|밤/.test(s), am = /오전|am|새벽|아침/.test(s);
    let m = s.match(/(\d{1,2})\s*[:시h]\s*(\d{1,2})?/) || s.match(/^(\d{1,2})$/);
    if (!m) return null;
    let h = +m[1]; const mi = m[2] ? +m[2] : (/반/.test(s) ? 30 : 0);
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
    if (h > 23 || mi > 59) return null;
    return `${pad(h)}:${pad(mi)}`;
  };
  const parseRemind = v => {
    if (v == null || v === '') return undefined;
    if (typeof v === 'number') return Math.max(0, Math.round(v));
    const s = String(v).replace(/\s/g, '');
    if (/없음|끔|off|no|x|-/i.test(s) && !/\d/.test(s)) return null;
    if (/정각|바로|^0분/.test(s)) return 0;
    const h = s.match(/(\d+)시간/), m = s.match(/(\d+)분/);
    if (h || m) return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
    const n = s.match(/\d+/);
    return n ? +n[0] : undefined;
  };

  // 통합 문서 → [{ name, rows(2차원 배열), links{"행,열": url} }]. 셀에 걸린 하이퍼링크도 함께 읽는다.
  const bookFromWorkbook = wb => wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
    const links = {};
    if (ws['!ref']) {
      const s = XLSX.utils.decode_range(ws['!ref']).s;
      for (const a of Object.keys(ws)) {
        if (a[0] === '!' || !ws[a].l || !ws[a].l.Target) continue;
        const c = XLSX.utils.decode_cell(a);
        links[`${c.r - s.r},${c.c - s.c}`] = String(ws[a].l.Target).replace(/&amp;/g, '&');
      }
    }
    return { name, rows, links };
  });

  const rowsFromSheet = sheet => {
    const rows = sheet.rows;
    // 제목 줄 위에 빈 줄이나 표 제목이 있는 경우: 값이 2개 이상인 첫 줄을 열 이름으로 본다
    const headerIdx = rows.findIndex(r => r.filter(c => String(c).trim() !== '').length >= 2);
    if (headerIdx < 0) return { headers: [], rows: [], headerIdx: -1 };
    return { headers: rows[headerIdx].map(h => String(h).trim()), rows: rows.slice(headerIdx + 1), headerIdx };
  };

  // 시트가 여러 개면 일정을 가장 많이 읽을 수 있는 시트를 고른다(날짜 열이 있는 시트 우선)
  const pendingFromBook = (book, fileName, sheetName) => {
    const candidates = book.map(sheet => {
      const { headers, rows, headerIdx } = rowsFromSheet(sheet);
      const p = { fileName, sheetName: sheet.name, sheetNames: book.map(s => s.name), book, headers, rows, headerIdx, links: sheet.links, map: guessMapping(headers) };
      return { p, score: headers.length ? buildItems(p).items.length + (p.map.date != null ? 0.5 : 0) : 0 };
    });
    const pick = candidates.find(c => c.p.sheetName === sheetName) || candidates.reduce((a, b) => (b.score > a.score ? b : a));
    return pick.p;
  };

  // ---------- 엑셀의 다른 표: 여행경비 · 교통 점검 · 검토 결과 ----------
  const num = v => typeof v === 'number' ? v : (v === '' || v == null ? NaN : parseFloat(String(v).replace(/[^\d.\-]/g, '')));
  // 열 이름 줄 찾기: 단어마다 서로 다른 칸에 있어야 한다(표 제목 한 칸에 단어가 다 들어 있는 줄은 제외)
  const findTable = (rows, words) => rows.findIndex(r => {
    const cells = r.map(norm);
    const hit = words.map(w => cells.findIndex(c => c.includes(norm(w))));
    return hit.every(i => i >= 0) && new Set(hit).size === words.length;
  });
  const colOf = (header, words) => header.findIndex(h => words.some(w => norm(h).includes(norm(w))));
  const firstText = r => (r || []).map(c => String(c).trim()).find(Boolean) || '';
  const asTime = v => typeof v === 'number' ? fracToTime(v) : String(v || '').trim();
  const parseExtras = book => {
    const ex = {};
    for (const sh of book) {
      const rows = sh.rows;
      let hi;
      if (!ex.budget && (hi = findTable(rows, ['항목', '예산'])) >= 0) {
        const h = rows[hi], c = w => colOf(h, w);
        const ci = { day: c(['일차', '날짜']), cat: c(['구분', '분류']), name: c(['항목', '내용']), unit: c(['단가', '금액']), cur: c(['통화']), qty: c(['수량']), budget: c(['예산']), actual: c(['실제']), memo: c(['메모', '비고']), link: c(['지도', '링크']) };
        const get = (r, k) => ci[k] < 0 ? '' : r[ci[k]];
        const lines = [];
        for (let i = hi + 1; i < rows.length; i++) {
          const r = rows[i], name = String(get(r, 'name')).trim(), day = String(get(r, 'day')).trim();
          if (/^합계/.test(day) || /^합계/.test(name)) break;
          if (!name) continue;
          const lk = sh.links[`${i},${ci.link}`] || (/^https:\/\//.test(String(get(r, 'link'))) ? String(get(r, 'link')) : '');
          const act = num(get(r, 'actual'));
          lines.push({ day, cat: String(get(r, 'cat')).trim() || '기타', name, unit: num(get(r, 'unit')) || 0, cur: String(get(r, 'cur') || 'KRW').trim().toUpperCase(), qty: num(get(r, 'qty')) || 1, budget: num(get(r, 'budget')) || 0, actual: act > 0 ? act : null, memo: String(get(r, 'memo')).trim(), link: lk });
        }
        // 표 위쪽에서 환율(원/100엔 같은 표기 포함)과 기준일을 찾는다
        let rate = null, rateDate = '', foreign = (lines.find(l => l.cur !== 'KRW') || {}).cur || 'JPY';
        rows.slice(0, hi).forEach(r => r.forEach((v, j) => {
          const s = String(v);
          if (/환율/.test(s) && !/기준/.test(s) && rate == null) { const n = r.slice(j + 1).find(x => typeof x === 'number'); if (n) rate = /100/.test(s) ? n / 100 : n; }
          if (/기준일/.test(s) && !rateDate) { const d = r.slice(j + 1).find(x => String(x).trim()); if (d) rateDate = typeof d === 'number' ? serialToDate(d) : String(d); }
        }));
        if (rate == null) { const l = lines.find(x => x.cur !== 'KRW' && x.unit && x.budget); if (l) rate = l.budget / (l.unit * l.qty); }
        ex.budget = { title: firstText(rows[0]).replace(/^[^\p{L}\d]+/u, ''), subtitle: firstText(rows[1]), rate, rateDate, foreign, lines };
      }
      if (!ex.transport && (hi = findTable(rows, ['구간', '판정'])) >= 0) {
        const h = rows[hi], c = w => colOf(h, w);
        const ci = { day: c(['일차']), seg: c(['구간']), plan: c(['계획', '시간표']), mode: c(['교통', '노선', '수단']), dep: c(['출발']), arr: c(['도착']), mins: c(['소요']), slack: c(['여유']), verdict: c(['판정']), basis: c(['근거']), note: c(['비고', '제안']) };
        const get = (r, k) => ci[k] < 0 ? '' : r[ci[k]];
        const segs = [];
        for (let i = hi + 1; i < rows.length; i++) {
          const r = rows[i]; if (!String(get(r, 'seg')).trim()) continue;
          const v = String(get(r, 'verdict'));
          segs.push({ day: String(get(r, 'day')).trim(), seg: String(get(r, 'seg')).trim(), plan: String(get(r, 'plan')).trim(), mode: String(get(r, 'mode')).trim(), dep: asTime(get(r, 'dep')), arr: asTime(get(r, 'arr')), mins: num(get(r, 'mins')), slack: num(get(r, 'slack')), level: /❌|지연/.test(v) ? 'late' : /⚠|빠듯/.test(v) ? 'tight' : 'ok', verdict: v.replace(/^[^\p{L}]+/u, '').trim() || v, basis: String(get(r, 'basis')).trim(), note: String(get(r, 'note')).trim() });
        }
        ex.transport = { title: firstText(rows[0]), subtitle: firstText(rows[1]), segs };
      }
      if (!ex.review && (hi = findTable(rows, ['원래', '수정'])) >= 0) {
        const h = rows[hi], c = w => colOf(h, w);
        const ci = { day: c(['일차']), seg: c(['구간', '항목']), before: c(['원래']), after: c(['수정']), why: c(['이유', '확인']) };
        const get = (r, k) => ci[k] < 0 ? '' : String(r[ci[k]]).trim();
        const items = rows.slice(hi + 1).filter(r => get(r, 'after') || get(r, 'why')).map(r => ({ day: get(r, 'day'), seg: get(r, 'seg'), before: get(r, 'before'), after: get(r, 'after'), why: get(r, 'why') }));
        ex.review = { title: firstText(rows[0]), items };
      }
    }
    return Object.keys(ex).length ? ex : null;
  };

  const buildItems = (pending) => {
    const { rows, map } = pending;
    const today = dateIn(Date.now(), city().tz);
    const out = [], problems = [];
    let lastDate = null;
    const start = state.settings.startDate || dateIn(Date.now(), city().tz);
    rows.forEach((r, i) => {
      const cell = f => map[f] == null ? '' : r[map[f]];
      let date = parseDate(cell('date'), today);
      const [timeStart, timeEnd] = splitRange(cell('time'));
      // 날짜 칸에 날짜+시간이 함께 들어 있는 경우
      let time = parseTime(timeStart) || (typeof cell('date') === 'number' && cell('date') % 1 ? fracToTime(cell('date')) : null);
      if (!date && map.day != null) {
        const n = parseInt(String(cell('day')).replace(/\D/g, ''), 10);
        if (n > 0) { const d = new Date(start + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n - 1); date = d.toISOString().slice(0, 10); }
      }
      if (date) lastDate = date;
      else date = lastDate; // 같은 날 일정은 날짜를 한 번만 적는 경우가 많다
      const title = String(cell('title') || '').replace(/^\s*📍\s*/u, '').trim();
      if (!title && !time) return;
      if (!date || !time) { problems.push({ row: pending.headerIdx + 2 + i, title: title || '(제목 없음)', reason: !date ? '날짜를 못 읽었어요' : '시간을 못 읽었어요' }); return; }
      const end = parseTime(cell('end')) || parseTime(timeEnd);
      // 지도 링크: 지도 열의 글자 → 지도 열 셀의 하이퍼링크 → 일정 이름 셀의 하이퍼링크
      const link = (f) => map[f] == null || !pending.links ? '' : pending.links[`${pending.headerIdx + 1 + i},${map[f]}`] || '';
      const mapLink = (/^https:\/\//.test(String(cell('map')).trim()) ? String(cell('map')).trim() : '') || link('map') || link('title');
      let duration = null;
      if (end) { const [a, b] = [time, end].map(t => t.split(':').reduce((h, m) => h * 60 + +m)); duration = b > a ? b - a : null; }
      out.push({
        id: `${date}_${time}_${i}`,
        date, time, end, duration,
        title: title || '(제목 없음)',
        place: String(cell('place') || '').trim(),
        memo: String(cell('memo') || '').trim(),
        remind: parseRemind(cell('remind')),
        category: String(cell('category') || '').trim(),
        mapUrl: /^https:\/\//.test(mapLink) ? mapLink : '',
      });
    });
    out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    // 종료 시간이 없으면 다음 일정 시작까지를 소요 시간으로 본다(같은 날, 최대 4시간)
    out.forEach((it, i) => {
      const nx = out[i + 1];
      if (it.duration == null && nx && nx.date === it.date) {
        const d = nx.time.split(':').reduce((h, m) => h * 60 + +m) - it.time.split(':').reduce((h, m) => h * 60 + +m);
        if (d > 0 && d <= 240) it.duration = d;
      }
    });
    return { items: out, problems };
  };

  // ---------- 일정 계산 ----------
  const leadOf = it => it.remind === undefined ? state.settings.lead : it.remind;
  const startMs = it => zonedToEpoch(it.date, it.time, city().tz);
  const endMs = it => startMs(it) + (it.duration || 60) * 60000;
  const statusOf = (it, now) => {
    const s = startMs(it);
    if (now >= endMs(it)) return 'done';
    if (now >= s) return 'now';
    if (s - now <= 60 * 60000) return 'soon';
    return 'later';
  };
  const days = () => [...new Set(state.items.map(i => i.date))].sort();
  const todayStr = () => dateIn(Date.now(), city().tz);
  const nextItem = now => state.items.find(it => endMs(it) > now && startMs(it) >= now - 5 * 60000) || null;
  const currentItem = now => state.items.find(it => startMs(it) <= now && endMs(it) > now) || null;

  // ---------- DOM 도우미 ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const mapUrl = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  const dirUrl = q => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
  // 엑셀에 지도 링크가 있으면 그걸 쓰고, 없으면 장소(없으면 제목)로 검색한다
  const itemMap = it => it.mapUrl || mapUrl(it.place || `${it.title} ${city().en}`);
  const itemQuery = it => {
    if (it.place) return it.place;
    try { const q = new URL(it.mapUrl).searchParams.get('query'); if (q) return q; } catch { /* 링크가 아니면 제목으로 */ }
    return `${it.title} ${city().en}`;
  };

  // Safari 15.3 이하는 <dialog>를 지원하지 않으므로 열기/닫기만 흉내 낸다
  (() => {
    const d = document.getElementById('detail');
    if (typeof d.showModal === 'function') return;
    d.classList.add('fallback');
    Object.defineProperty(d, 'open', { get() { return this.hasAttribute('open'); } });
    d.showModal = () => d.setAttribute('open', '');
    d.close = () => d.removeAttribute('open');
  })();

  // ---------- 화면: 공통 ----------
  const setView = view => {
    state.view = view;
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
    $$('.tab, .nav-item').forEach(b => { if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (history.replaceState) history.replaceState(null, '', '#' + view);
    render();
    window.scrollTo({ top: 0 });
  };

  const renderTripCard = () => {
    const ds = days(), t = todayStr();
    const name = state.settings.tripName || `${city().name} 여행`;
    if (!ds.length) { $('#trip-card').innerHTML = `<div class="card"><b>${esc(name)}</b><p class="muted small">엑셀을 올리면 여기에 여행 진행도가 보여요</p></div>`; return; }
    const idx = ds.indexOf(t);
    const n = idx >= 0 ? idx + 1 : (t < ds[0] ? 0 : ds.length);
    const pct = Math.round((n / ds.length) * 100);
    $('#trip-card').innerHTML = `<div class="card" style="background:var(--highlight)">
      <span class="small" style="color:var(--brand);font-weight:700">현재 여행</span>
      <b style="font-size:19px">${esc(name)}</b>
      <span class="small muted">${fmtShort(ds[0])} – ${fmtShort(ds[ds.length - 1])} · ${n ? n + '일차' : '출발 전'} / ${ds.length}일</span>
      <div style="height:8px;border:1.5px solid var(--ink);border-radius:6px;background:var(--bg-surface);overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--brand)"></div></div>
    </div>`;
  };

  // 일정 구분 → 색(여정 지도 테마의 포스트잇 색)
  const catKey = c => { c = String(c || ''); return /이동|교통|비행|열차|버스|공항/.test(c) ? 'move' : /식사|아침|점심|저녁|카페/.test(c) ? 'food' : /관광|구경|투어|체험/.test(c) ? 'sight' : /온천|스파/.test(c) ? 'onsen' : /휴식|숙소|호텔/.test(c) ? 'rest' : /준비|수속|체크/.test(c) ? 'prep' : /여유|자유/.test(c) ? 'free' : c ? 'etc' : 'none'; };
  const cardHtml = (it, now) => {
    const st = statusOf(it, now);
    const tr = transportFor(it);
    const chip = (st === 'done' ? '<span class="chip done">완료</span>' : st === 'now' ? '<span class="chip soon">진행 중</span>' : st === 'soon' ? '<span class="chip soon">곧 시작</span>' : '')
      + (tr && tr.level !== 'ok' && st !== 'done' ? `<span class="${LEVEL[tr.level][0]}">${LEVEL[tr.level][1]}</span>` : '');
    return `<button class="s-card ${st === 'done' ? 'done' : ''} ${st === 'soon' || st === 'now' ? 'soon' : ''}" data-cat="${catKey(it.category)}" data-open="${esc(it.id)}">
      <span class="s-time"><b>${it.time}</b><span>${fmtDur(it.duration) || '&nbsp;'}</span></span>
      <span class="s-body">
        <span class="s-title"><span>${esc(it.title)}</span>${chip}</span>
        ${it.place ? `<span class="s-meta">${icon('pin')}<span>${esc(it.place)}</span></span>` : it.category ? `<span class="s-meta"><span>${esc(it.category)}</span>${it.mapUrl ? `${icon('pin')}<span>지도 있음</span>` : ''}</span>` : ''}
        <span class="s-meta s-alert">${icon('bell')}<span>${fmtLead(leadOf(it))}</span></span>
      </span>
      ${icon('chev')}
    </button>`;
  };

  // ---------- 화면: 오늘 ----------
  const renderToday = () => {
    const c = city(), now = Date.now(), ds = days(), t = todayStr();
    const idx = ds.indexOf(t);
    $('#today-eyebrow').textContent = ds.length ? (idx >= 0 ? `여행 ${idx + 1}일차 · ${fmtDate(t)}` : t < ds[0] ? `출발까지 ${fmtLeftWords(zonedToEpoch(ds[0], '00:00', c.tz) - now)} · ${fmtDate(t)}` : `여행 끝! · ${fmtDate(t)}`) : fmtDate(t);
    $$('.city-name').forEach(e => { e.textContent = c.en; });
    $$('.city-label').forEach(e => { e.textContent = `${c.name}, ${c.country}`; });

    if (!state.day || !ds.includes(state.day)) state.day = ds.includes(t) ? t : (ds.find(d => d >= t) || ds[ds.length - 1] || null);
    $('#day-pills').innerHTML = ds.map((d, i) => `<button class="pill" role="tab" aria-selected="${d === state.day}" data-day="${d}">${i + 1}일차</button>`).join('');
    $('#day-pills').hidden = !ds.length;
    renderHero();

    const list = state.items.filter(i => i.date === state.day);
    $('#list-title').firstChild.textContent = state.day === t ? '오늘 일정 ' : state.day ? `${fmtShort(state.day)} 일정 ` : '오늘 일정 ';
    $('#today-list').innerHTML = !state.items.length ? '' : list.length ? list.map(it => cardHtml(it, now)).join('') : '<p class="empty-note">이 날은 일정이 없어요</p>';
    $('#view-today .section-head').hidden = !state.items.length;
    // scrollIntoView는 페이지 전체를 움직이므로 탭 줄만 가로로 맞춘다
    const pills = $('#day-pills'), sel = $('[aria-selected="true"]', pills);
    if (sel) pills.scrollLeft = sel.offsetLeft - pills.offsetLeft - (pills.clientWidth - sel.offsetWidth) / 2;
  };

  const renderHero = () => {
    const now = Date.now();
    const box = $('#next-alert');
    if (!state.items.length) {
      box.innerHTML = `<div class="hero empty">
        <span class="drop-icon">${icon('sheet')}</span>
        <h2 class="hero-title">아직 일정이 없어요</h2>
        <p class="muted">엑셀 파일을 올리면 일정 시간마다 알려 드려요</p>
        <button class="btn btn-primary" data-view="upload">${icon('upload')}엑셀 올리기</button>
        <button class="link" data-add="">${icon('plus')}엑셀 없이 직접 만들기</button>
        <button class="link" data-sample>예시 일정으로 먼저 써 보기</button>
      </div>`;
      return;
    }
    const cur = currentItem(now), nx = nextItem(now);
    const it = nx && (!cur || startMs(nx) - now < 30 * 60000) ? nx : (cur || nx);
    if (!it) { box.innerHTML = `<div class="hero empty"><h2 class="hero-title">모든 일정을 마쳤어요 🎉</h2><p class="muted">즐거운 여행이었길!</p></div>`; return; }
    const s = startMs(it), lead = leadOf(it), ongoing = s <= now;
    const alertAt = lead == null ? null : s - lead * 60000;
    const badge = ongoing ? '지금 진행 중' : alertAt == null ? '알림 꺼짐' : alertAt > now ? `${timeIn(alertAt, city().tz)} 알림 예정` : '알림 보냄';
    box.innerHTML = `<div class="hero-wrap"><div class="hero" data-hero="${esc(it.id)}">
      <div class="hero-top">
        <span class="badge">${icon('bell')}${badge}</span>
        <span class="doodle-circle"><span class="countdown" id="countdown" aria-label="시작까지 남은 시간">${ongoing ? '진행 중' : fmtLeft(s - now)}</span></span>
      </div>
      <div>
        <div class="hero-time">${it.time}${it.date !== todayStr() ? ` <span style="font-size:24px">${fmtShort(it.date)}</span>` : ''}</div>
        <h2 class="hero-title">${esc(it.title)}</h2>
        ${it.place ? `<p class="hero-place">${esc(it.place)}</p>` : ''}
      </div>
      <div class="hero-actions">
        <a class="btn" href="${itemMap(it)}" target="_blank" rel="noopener">${icon('ext')}지도 열기</a>
        <button class="btn" data-open="${esc(it.id)}">자세히</button>
      </div>
    </div>${!ongoing && s - now < 60 * 60000 ? '<span class="hand-note hero-note">곧 출발!</span>' : ''}</div>`;
  };

  const tickCountdown = () => {
    const el = $('#countdown'), hero = $('[data-hero]');
    if (!el || !hero) return;
    const it = state.items.find(i => i.id === hero.dataset.hero);
    if (!it) return;
    if (el.textContent === '진행 중') return;
    const left = startMs(it) - Date.now();
    if (left <= 0) { renderToday(); return; }
    el.textContent = fmtLeft(left);
  };

  // ---------- 여정 지도 (여정 지도 테마의 일정 탭) ----------
  // 하루를 시간대 단계로 나누고, 단계마다 일정(포스트잇) · 컨디션 곡선 · 문제점 · 개선 기회를 쌓는다.
  const STAGES = [['dawn', '새벽 · 아침', 0, 9], ['morning', '오전', 9, 12], ['noon', '점심', 12, 14], ['afternoon', '오후', 14, 18], ['evening', '저녁', 18, 21], ['night', '밤', 21, 24]];
  const FACE = ['😟', '😐', '🙂', '😊'];
  const scoreOf = it => { const tr = transportFor(it); if (tr && tr.level === 'late') return 0; if (tr && tr.level === 'tight') return 1; return /food|onsen|rest/.test(catKey(it.category)) ? 3 : 2; };
  const journeyDay = (d, n, now) => {
    const items = state.items.filter(it => it.date === d);
    const hourOf = it => +it.time.slice(0, 2);
    const cols = STAGES.map(([key, label, a, b]) => ({ key, label, items: items.filter(it => hourOf(it) >= a && hourOf(it) < b) })).filter(c => c.items.length);
    if (!cols.length) return '';
    const segs = (state.extras && state.extras.transport ? state.extras.transport.segs : []).filter(sg => parseInt(sg.day, 10) === n && sg.level !== 'ok');
    const segStage = sg => { const m = String(sg.plan).match(/(\d{1,2}):\d{2}/); const h = m ? +m[1] : -1; const st = STAGES.find(([, , a, b]) => h >= a && h < b); return st ? st[0] : null; };
    const review = state.extras && state.extras.review ? state.extras.review.items.filter(r => parseInt(r.day, 10) === n) : [];
    // 컨디션 곡선: 단계마다 일정 점수 평균(0~3). 지연·빠듯이 있으면 가장 나쁜 점수를 쓴다
    const W = 100, H = 56, pts = cols.map((c, i) => { const sc = c.items.map(scoreOf); const v = Math.min(...sc) <= 1 ? Math.min(...sc) : sc.reduce((x, y) => x + y, 0) / sc.length; return { x: (i + 0.5) * W, y: 8 + (3 - v) / 3 * (H - 16), v }; });
    const path = pts.map((p, i) => { if (!i) return `M${p.x},${p.y}`; const q = pts[i - 1], mx = (q.x + p.x) / 2; return `C${mx},${q.y} ${mx},${p.y} ${p.x},${p.y}`; }).join(' ');
    const grid = `style="grid-template-columns:var(--jl, 96px) repeat(${cols.length}, minmax(var(--jc, 150px), 1fr))"`;
    return `<div class="journey" aria-label="${n}일차 여정 지도"><div class="j-grid" ${grid}>
      <div class="j-row-label">단계</div>${cols.map(c => `<div class="j-stage" data-stage="${c.key}">${c.label}<small>${c.items.length}개</small></div>`).join('')}
      <div class="j-row-label">행동</div>${cols.map(c => `<div class="j-cell">${c.items.map(it => { const st = statusOf(it, now); return `<button class="j-note" data-cat="${catKey(it.category)}" data-open="${esc(it.id)}"${st === 'done' ? ' data-done' : ''}><b>${it.time}</b><span>${esc(it.title)}</span>${it.category ? `<i>${esc(it.category)}</i>` : ''}</button>`; }).join('')}</div>`).join('')}
      <div class="j-row-label">컨디션</div><div class="j-curve" style="grid-column: span ${cols.length}"><svg viewBox="0 0 ${cols.length * W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" class="j-line" vector-effect="non-scaling-stroke"/></svg>
        ${pts.map((p, i) => `<span class="j-face" style="left:${(i + 0.5) / cols.length * 100}%;top:calc(16px + ${(p.y / H).toFixed(3)} * (100% - 32px))" title="여유도 ${p.v.toFixed(1)} / 3">${FACE[Math.round(p.v)]}</span>`).join('')}</div>
      <div class="j-row-label">문제점</div>${cols.map(c => `<div class="j-cell">${segs.filter(sg => segStage(sg) === c.key).map(sg => `<div class="j-pain" data-level="${sg.level}"><b>${sg.level === 'late' ? '지연' : '빠듯'} · ${esc(sg.seg)}</b><span>${esc(sg.note || sg.mode)}</span></div>`).join('')}</div>`).join('')}
    </div>
    ${review.length ? `<div class="j-opps"><span class="j-row-label">개선 기회</span>${review.map(r => `<div class="j-opp"><b>${esc(r.seg)}</b><span>${esc(r.after)}</span></div>`).join('')}</div>` : ''}
    </div>`;
  };

  // ---------- 화면: 전체 일정 ----------
  const renderSchedule = () => {
    const now = Date.now(), ds = days(), t = todayStr();
    const pills = $('#sched-pills');
    pills.hidden = !ds.length;
    if (!ds.length) {
      $('#schedule-list').innerHTML = `<div class="card empty-note"><p>아직 일정이 없어요. 엑셀을 올리거나 직접 만들어 보세요.</p><div class="btn-row"><button class="btn btn-primary" data-add="">${icon('plus')}직접 만들기</button><button class="btn btn-secondary" data-view="upload">${icon('upload')}엑셀 올리기</button></div></div>`;
      return;
    }
    // 일차 버튼으로 하루씩 본다. 처음엔 오늘(여행 중) 또는 다가오는 날
    if (!state.schedDay || !ds.includes(state.schedDay)) state.schedDay = ds.includes(t) ? t : (ds.find(d => d >= t) || ds[0]);
    const d = state.schedDay, n = ds.indexOf(d) + 1;
    pills.innerHTML = ds.map((x, i) => `<button class="pill" role="tab" aria-selected="${x === d}" data-sday="${x}">${i + 1}일차<small>${fmtShort(x)}</small></button>`).join('');
    const sel = $('[aria-selected="true"]', pills);
    if (sel) pills.scrollLeft = sel.offsetLeft - pills.offsetLeft - (pills.clientWidth - sel.offsetWidth) / 2;
    const plan = state.settings.skin === 'journey' ? journeyDay(d, n, now) : '';
    const checks = checksHtml(n);
    const issueCnt = state.extras && state.extras.transport ? state.extras.transport.segs.filter(sg => parseInt(sg.day, 10) === n && sg.level !== 'ok').length : 0;
    // 폰에서는 옆에 둘 자리가 없어 계획표 / 문제점을 바로 옆 버튼으로 바꿔 본다
    $('#schedule-list').innerHTML = `${checks ? `<div class="pills sched-switch" role="tablist"><button class="pill" role="tab" aria-selected="${state.schedPane !== 'issues'}" data-spane="plan">계획표</button><button class="pill" role="tab" aria-selected="${state.schedPane === 'issues'}" data-spane="issues">문제점${issueCnt ? ` <span class="chip soon">${issueCnt}</span>` : ''}</button></div>` : ''}
      <div class="sched-layout${checks ? '' : ' solo'}${state.schedPane === 'issues' ? ' show-issues' : ''}">
        <div class="day-group">
          <div class="day-head">${n}일차 <small>${fmtDate(d)}${d === t ? ' · 오늘' : ''}</small><button class="link add-day" data-add="${d}" aria-label="${fmtShort(d)}에 일정 추가">${icon('plus')}추가</button></div>
          ${plan || `<div class="cards">${state.items.filter(it => it.date === d).map(it => cardHtml(it, now)).join('') || '<p class="empty-note">이 날은 일정이 없어요</p>'}</div>`}
        </div>
        ${checks ? `<aside class="sched-side">${checks}</aside>` : ''}
      </div>`;
  };

  // ---------- 위젯 ----------
  const rates = { data: store.get('rates', null), loading: false, failed: false };
  const weather = { data: null, key: null, loading: false, failed: false };

  const loadRates = async () => {
    const fresh = rates.data && Date.now() - rates.data.at < 6 * 3600000;
    if (fresh || rates.loading) return;
    rates.loading = true;
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/KRW');
      const j = await r.json();
      if (j.result !== 'success') throw new Error('rate');
      rates.data = { at: Date.now(), rates: j.rates };
      store.set('rates', rates.data);
      rates.failed = false;
    } catch { rates.failed = true; }
    rates.loading = false;
    renderWidgets(true);
  };
  const krwPer = cur => {
    if (cur === 'KRW') return 1;
    const manual = store.get('manualRate.' + cur, null);
    if (rates.data && rates.data.rates[cur]) return 1 / rates.data.rates[cur];
    return manual;
  };

  const WCODE = c => c === 0 ? ['☀️', '맑음'] : c <= 2 ? ['🌤️', '구름 조금'] : c === 3 ? ['☁️', '흐림'] : c <= 48 ? ['🌫️', '안개'] : c <= 57 ? ['🌦️', '이슬비'] : c <= 67 ? ['🌧️', '비'] : c <= 77 ? ['🌨️', '눈'] : c <= 82 ? ['🌧️', '소나기'] : c <= 86 ? ['🌨️', '눈 소나기'] : ['⛈️', '뇌우'];
  const loadWeather = async () => {
    const c = city(), key = c.id + ':' + new Date().getHours();
    if (weather.key === key || weather.loading) return;
    weather.loading = true;
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=${encodeURIComponent(c.tz)}&forecast_days=2`;
      const j = await (await fetch(u)).json();
      if (!j.current) throw new Error('weather');
      weather.data = j; weather.key = key; weather.failed = false;
    } catch { weather.failed = true; }
    weather.loading = false;
    renderWidgets(true);
  };

  const widgetsHtml = () => {
    const c = city(), now = Date.now();
    const lt = timeIn(now, c.tz), ht = timeIn(now, HOME_TZ);
    const diffH = (tzOffset(now, HOME_TZ) - tzOffset(now, c.tz)) / 3600000;
    const diffText = diffH === 0 ? '서울과 시간이 같아요' : `서울이 ${Math.abs(diffH)}시간 ${diffH > 0 ? '빨라요' : '느려요'}`;
    const ampm = t => +t.slice(0, 2) < 12 ? '오전' : '오후';

    const per = krwPer(c.cur);
    const rateLine = c.cur === 'KRW' ? '원화를 쓰는 여행지예요' : per ? `1 ${c.cur} = ${Math.round(per * 100) / 100 >= 100 ? Math.round(per).toLocaleString() : (Math.round(per * 100) / 100).toLocaleString()}원` : rates.loading ? '환율 불러오는 중…' : '환율을 못 불러왔어요';
    const quick = { EUR: [5, 10, 20, 50], USD: [5, 10, 20, 50], GBP: [5, 10, 20, 50], JPY: [500, 1000, 3000, 5000], TWD: [100, 300, 500, 1000], HKD: [50, 100, 200, 500], THB: [100, 300, 500, 1000], VND: [50000, 100000, 200000, 500000], SGD: [5, 10, 20, 50], AUD: [5, 10, 20, 50] }[c.cur] || [1, 5, 10, 50];

    let wHtml;
    if (weather.data && weather.key && weather.key.startsWith(c.id)) {
      const w = weather.data, [emo, desc] = WCODE(w.current.weather_code);
      const nowLocal = `${dateIn(now, c.tz)}T${pad(partsIn(now, c.tz).h)}:00`;
      const start = Math.max(0, w.hourly.time.indexOf(nowLocal));
      const hours = w.hourly.time.slice(start, start + 5).map((t, i) => ({ h: +t.slice(11, 13), temp: Math.round(w.hourly.temperature_2m[start + i]), rain: w.hourly.precipitation_probability[start + i] }));
      const rainy = hours.find(h => h.rain >= 50);
      wHtml = `<div class="weather-now"><span class="emoji" aria-hidden="true">${emo}</span><div><b>${c.name} · ${desc}</b><p class="muted small">최고 ${Math.round(w.daily.temperature_2m_max[0])}° · 최저 ${Math.round(w.daily.temperature_2m_min[0])}° · 강수 ${w.daily.precipitation_probability_max[0]}%</p></div><span class="temp">${Math.round(w.current.temperature_2m)}°</span></div>
        <div class="hours">${hours.map(h => `<div class="hour ${h.rain >= 50 ? 'rain' : ''}">${h.h}시<b>${h.temp}°</b></div>`).join('')}</div>
        ${rainy ? `<p class="tip">${rainy.h}시쯤 비 소식 (${rainy.rain}%) · 우산 챙기세요</p>` : ''}`;
    } else wHtml = `<p class="muted">${weather.failed ? '날씨를 못 불러왔어요. 인터넷 연결을 확인해 주세요.' : '날씨 불러오는 중…'}</p>`;

    const done = state.checks.filter(x => x.done).length;
    return `
      <div class="card">
        <h3 class="card-title">${icon('globe')}현지 시각 · 시차</h3>
        <div class="clocks">
          <div class="clock local"><span>${c.name} · 현지</span><b>${lt}</b><span>${ampm(lt)}</span></div>
          <div class="clock"><span>서울</span><b>${ht}</b><span>${ampm(ht)} · KST</span></div>
        </div>
        <p class="muted small">${diffText}</p>
      </div>
      <div class="card">
        <h3 class="card-title">${icon('exchange')}환율 계산기<span class="right">${rateLine}</span></h3>
        ${c.cur === 'KRW' ? '' : per ? `<div class="conv">
          <label><span>${c.cur}</span><input inputmode="decimal" data-conv="foreign" value="${esc(state.conv.foreign)}" placeholder="0" aria-label="${c.cur} 금액"></label>
          <label class="krw"><span>KRW</span><input inputmode="decimal" data-conv="krw" value="${esc(state.conv.krw)}" placeholder="0" aria-label="원화 금액"></label>
        </div>
        <div class="quick">${quick.map(q => `<button data-quick="${q}">${q.toLocaleString()}</button>`).join('')}</div>`
        : `<label class="field"><span>환율 직접 입력 (1 ${c.cur} = ? 원)</span><input inputmode="decimal" data-manual-rate placeholder="예: 1480"></label>`}
      </div>
      <div class="card">
        <h3 class="card-title">${icon('weather')}${c.name} 날씨<a class="link right" style="min-height:auto" href="${mapUrl(c.en)}" target="_blank" rel="noopener">지도 ↗</a></h3>
        ${wHtml}
      </div>
      <div class="card">
        <h3 class="card-title">${icon('checklist')}준비물<span class="right hand" style="font-size:22px;color:var(--brand)">${done} / ${state.checks.length}</span></h3>
        <ul class="check-list">${state.checks.map(x => `<li><label><input type="checkbox" data-check="${x.id}" ${x.done ? 'checked' : ''}><span>${esc(x.text)}</span></label><button class="del" data-del-check="${x.id}" aria-label="${esc(x.text)} 삭제">${icon('x')}</button></li>`).join('')}</ul>
        <form class="check-add" data-check-add><input name="t" placeholder="준비물 추가" aria-label="준비물 추가" maxlength="40"><button class="btn btn-secondary">추가</button></form>
      </div>`;
  };
  // background=true: 주기적 갱신이나 데이터 도착으로 다시 그릴 때. 사용자가 위젯에 입력 중이면 건너뛴다.
  const renderWidgets = background => {
    if (background && document.activeElement && document.activeElement.closest('[data-widgets]')) return;
    const visible = $$('[data-widgets]').filter(el => !el.closest('.view').hidden);
    const active = document.activeElement;
    const focusKey = active && active.dataset && active.dataset.conv;
    const html = widgetsHtml();
    visible.forEach(el => { el.innerHTML = html; });
    if (focusKey) { const again = visible.map(el => $(`[data-conv="${focusKey}"]`, el)).find(Boolean); if (again) { again.focus(); const v = again.value; again.setSelectionRange(v.length, v.length); } }
  };

  // ---------- 화면: 업로드 ----------
  const renderUpload = () => {
    const p = state.pending, box = $('#upload-result');
    if (!p) { box.innerHTML = ''; return; }
    if (p.error) { box.innerHTML = `<div class="card"><p class="warn">${esc(p.error)}</p></div>`; return; }
    const { items, problems } = buildItems(p);
    p.items = items;
    const fieldOpts = idx => `<option value="">사용 안 함</option>` + p.headers.map((h, i) => `<option value="${i}" ${idx === i ? 'selected' : ''}>${esc(h || `(${i + 1}번째 열)`)}</option>`).join('');
    const ds = [...new Set(items.map(i => i.date))];
    if (p.extras === undefined) p.extras = parseExtras(p.book);
    const ex = p.extras, found = ex ? [ex.budget && `여행경비 ${ex.budget.lines.length}줄`, ex.transport && `교통 점검 ${ex.transport.segs.length}구간`, ex.review && `검토 결과 ${ex.review.items.length}건`].filter(Boolean) : [];
    box.innerHTML = `
      <div class="card">
        <div class="file-row"><span class="fi">${icon('sheet')}</span><div><b>${esc(p.fileName)}</b><span class="small" style="color:${items.length ? 'var(--success)' : 'var(--accent)'}">일정 ${items.length}개 인식${ds.length ? ` · ${ds.length}일` : ''}</span></div>${items.length ? `<span class="chip done">${icon('check')}읽기 완료</span>` : ''}</div>
        ${found.length ? `<p class="small muted">함께 찾은 표: <b>${found.join(' · ')}</b> → "경비" 탭과 "일정" 탭에서 보여요</p>` : ''}
      </div>
      <div class="card">
        <h3 class="card-title">${icon('sheet')}열 확인<span class="right">틀리면 직접 골라 주세요</span></h3>
        ${p.sheetNames.length > 1 ? `<label class="field"><span>시트 <span class="muted small">(일정이 가장 많은 시트를 골랐어요)</span></span><select id="sheet-select">${p.sheetNames.map(n => `<option ${n === p.sheetName ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
        <div class="map-grid">${['date', 'time', 'title', 'place', 'memo', 'remind', 'end', 'day', 'category', 'map'].map(f => `<label>${FIELDS[f].label}<select data-map="${f}">${fieldOpts(p.map[f])}</select></label>`).join('')}</div>
        ${!items.length ? '<p class="warn">날짜·시간·일정 열을 확인해 주세요.</p>' : ''}
        ${problems.length ? `<p class="warn">${problems.length}줄은 건너뛰었어요: ${problems.slice(0, 3).map(x => `${x.row}번째 줄 "${esc(x.title)}" (${x.reason})`).join(', ')}${problems.length > 3 ? ' …' : ''}</p>` : ''}
        ${items.length ? `<div class="table-wrap"><table>
          <thead><tr><th>날짜</th><th>시간</th><th>일정</th><th>장소</th><th>알림</th></tr></thead>
          <tbody>${items.slice(0, 6).map(it => `<tr><td>${fmtShort(it.date)}</td><td class="hand" style="color:var(--brand);font-size:19px">${it.time}</td><td>${esc(it.title)}</td><td>${esc(it.place)}</td><td>${fmtLead(leadOf(it)).replace(' 알림', '')}</td></tr>`).join('')}</tbody>
        </table></div>${items.length > 6 ? `<p class="muted small">+ ${items.length - 6}개 더 있어요</p>` : ''}` : ''}
      </div>
      ${items.length ? `<div class="card">
        <h3 class="card-title">${icon('bell')}알림 시점</h3>
        <p class="muted small">엑셀에 "알림" 칸이 비어 있는 일정에 적용돼요.</p>
        <div class="pills wrap">${LEADS.map(l => `<button class="pill ${state.settings.lead === l ? 'on' : ''}" data-lead="${l}">${l === 0 ? '정각' : l >= 60 ? l / 60 + '시간 전' : l + '분 전'}</button>`).join('')}</div>
        <button class="btn btn-primary full" id="commit-btn">${icon('bell')}일정 ${items.length}개 등록하고 알림 켜기</button>
      </div>` : ''}`;
  };

  const readFile = async file => {
    state.pending = null;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false, codepage: 949 });
      state.pending = pendingFromBook(bookFromWorkbook(wb), file.name);
      if (!state.pending.headers.length) throw new Error('empty');
    } catch {
      state.pending = { error: '파일을 읽지 못했어요. .xlsx, .xls, .csv 파일인지 확인해 주세요.' };
    }
    renderUpload();
  };

  const commitPending = async () => {
    const p = state.pending;
    if (!p || !p.items || !p.items.length) return;
    state.items = p.items;
    state.extras = p.extras === undefined ? parseExtras(p.book) : p.extras;
    state.fired = {}; state.snooze = {};
    // 이미 지난 알림은 한꺼번에 울리지 않도록 보낸 것으로 표시한다
    const now = Date.now();
    state.items.forEach(it => { const l = leadOf(it); if (l != null && startMs(it) - l * 60000 < now - 60000) state.fired[it.id] = true; });
    state.pending = null;
    state.day = null;
    save();
    toast('일정을 등록했어요', `${state.items.length}개 일정 · ${fmtLead(state.settings.lead).replace(' 알림', '')} 알림`);
    await enableNotifications(true);
    setView('today');
  };

  const downloadTemplate = () => {
    const rows = [['날짜', '시간', '일정', '장소', '메모', '알림'],
      ['2026-10-24', '14:30', '샤를 드골 공항 도착', 'Aéroport Paris-Charles de Gaulle', '입국 심사 후 RER B', '30분 전'],
      ['2026-10-24', '18:00', '호텔 체크인', 'Hôtel Le Marais', '', ''],
      ['2026-10-25', '09:30', '에펠탑 전망대', 'Champ de Mars, 5 Av. Anatole France', '예약 번호 TK-2931', '1시간 전'],
      ['2026-10-25', '11:00', '루브르 박물관', 'Rue de Rivoli, 75001 Paris', '뮤지엄 패스 지참', '10분 전']];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 34 }, { wch: 22 }, { wch: 10 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '일정');
    XLSX.writeFile(wb, '트립알림_일정_양식.xlsx');
  };

  const loadSample = () => {
    const c = city(), now = Date.now(), t = todayStr();
    const at = mins => { const ms = now + mins * 60000; const p = partsIn(ms, c.tz); const m = Math.floor(p.mi / 10) * 10; return { date: dateIn(ms, c.tz), time: `${pad(p.h)}:${pad(m)}` }; };
    const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    const mk = (o, i) => ({ id: `s${i}_${o.date}_${o.time}`, end: null, memo: '', place: '', remind: undefined, duration: 60, ...o });
    const list = [
      { date: addDays(t, -2), time: '14:30', title: '공항 도착 · 입국', place: 'Aéroport Paris-Charles de Gaulle', memo: '입국 심사 후 RER B 타고 시내로', duration: 90 },
      { date: addDays(t, -2), time: '18:00', title: '호텔 체크인', place: 'Hôtel Le Marais' },
      { date: addDays(t, -1), time: '09:30', title: '에펠탑 전망대', place: 'Champ de Mars, 5 Av. Anatole France', memo: '예약 번호 TK-2931 · 30분 전 도착 권장', remind: 60 },
      { date: addDays(t, -1), time: '15:00', title: '오르세 미술관', place: "Musée d'Orsay", duration: 120 },
      { ...at(-150), title: '호텔 조식', place: 'Hôtel Le Marais, 3F 레스토랑', remind: null },
      { ...at(-70), title: '마레 지구 산책', place: 'Le Marais, Paris' },
      { ...at(14), title: '루브르 박물관', place: 'Rue de Rivoli, 75001 Paris', memo: '뮤지엄 패스 지참 · 피라미드 입구로 입장\n모나리자는 드농관 2층', duration: 150, remind: 10 },
      { ...at(200), title: '점심 · Le Comptoir', place: "9 Carrefour de l'Odéon", memo: '2인 예약 · 카드 결제', remind: 30 },
      { ...at(330), title: '센강 유람선', place: 'Port de la Bourdonnais', duration: 90 },
      { date: addDays(t, 1), time: '07:40', title: 'TGV → 바르셀로나', place: 'Gare de Lyon', memo: '좌석 7호차 42번', remind: 60, duration: 400 },
    ].map(mk);
    // 오늘 일정이 자정을 넘기면 날짜가 섞이므로 정렬한다
    list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    state.items = list;
    state.extras = null;
    state.fired = {}; state.snooze = {};
    list.forEach(it => { const l = leadOf(it); if (l != null && startMs(it) - l * 60000 < now) state.fired[it.id] = true; });
    if (!state.settings.tripName) state.settings.tripName = '파리 · 바르셀로나';
    state.day = null;
    save();
    toast('예시 일정을 불러왔어요', '내 엑셀을 올리면 이 일정은 바뀌어요');
    setView('today');
  };

  // ---------- 상세 ----------
  const openDetail = id => {
    const it = state.items.find(i => i.id === id);
    if (!it) return;
    const dlg = $('#detail'), now = Date.now(), s = startMs(it), lead = leadOf(it), q = itemQuery(it);
    const st = statusOf(it, now);
    const left = st === 'done' ? '끝났어요' : st === 'now' ? '진행 중' : fmtLeftWords(s - now);
    const endT = it.duration ? timeIn(s + it.duration * 60000, city().tz) : null;
    dlg.innerHTML = `<div class="sheet-inner">
      <div class="sheet-hero">
        <div class="row"><span class="muted">${fmtDate(it.date)}</span><span class="row-btns"><button class="btn btn-secondary btn-sm" data-edit="${esc(it.id)}">수정</button><button class="icon-btn" data-close aria-label="닫기">${icon('x')}</button></span></div>
        <div class="hero-time">${it.time}${endT ? `<span style="font-size:28px"> – ${endT}</span>` : ''}</div>
        <h2 id="detail-title">${esc(it.title)}</h2>
      </div>
      <div class="sheet-body">
        ${(() => { const tr = transportFor(it); return tr ? segHtml(tr, true) : ''; })()}
        ${it.place || it.mapUrl ? `<div class="info-row"><span class="ib">${icon('pin')}</span><div><b>${esc(it.place || q)}</b><span class="muted small">구글 지도에서 열려요</span></div><a class="link" href="${itemMap(it)}" target="_blank" rel="noopener">지도 ↗</a></div>` : ''}
        ${it.category ? `<div class="info-row"><span class="ib">${icon('calendar')}</span><div><b>${esc(it.category)}</b><span class="muted small">구분</span></div></div>` : ''}
        <div class="info-row"><span class="ib">${icon('bell')}</span><div><b>${lead == null ? '알림 꺼짐' : `${timeIn(s - lead * 60000, city().tz)}에 알림`}</b><span class="muted small">${fmtLead(lead)}</span></div></div>
        <div class="pills wrap" aria-label="이 일정 알림 시점">${[null, ...LEADS].map(l => `<button class="pill ${lead === l ? 'on' : ''}" data-item-lead="${l == null ? 'off' : l}" data-id="${esc(it.id)}">${l == null ? '끔' : l === 0 ? '정각' : l >= 60 ? l / 60 + '시간 전' : l + '분 전'}</button>`).join('')}</div>
        ${it.memo ? `<div class="memo">${esc(it.memo)}</div>` : ''}
      </div>
      <div class="sheet-cta">
        <div class="left"><small>시작까지</small><b>${left}</b></div>
        <a class="btn btn-primary" href="${dirUrl(q)}" target="_blank" rel="noopener">길찾기 시작 ${icon('arrow')}</a>
      </div>
    </div>`;
    if (!dlg.open) dlg.showModal();
  };

  // ---------- 일정 추가 · 수정 ----------
  const toMin = t => t.split(':').reduce((h, m) => h * 60 + +m);
  let deleteArmed = null;
  const openEditor = (id, date) => {
    const it = id ? state.items.find(i => i.id === id) : null;
    const dlg = $('#detail');
    const d = it ? it.date : (date || state.day || todayStr());
    const cats = [...new Set(state.items.map(i => i.category).filter(Boolean))];
    const lead = it ? (it.remind === undefined ? 'default' : it.remind === null ? 'off' : String(it.remind)) : 'default';
    const v = k => esc(it ? (it[k] || '') : '');
    dlg.innerHTML = `<form class="sheet-inner" id="edit-form" novalidate>
      <div class="sheet-hero">
        <div class="row"><b style="font-size:22px">${it ? '일정 수정' : '새 일정'}</b><button type="button" class="icon-btn" data-close aria-label="닫기">${icon('x')}</button></div>
        <label class="field"><span>일정 이름</span><input id="ed-title" name="title" maxlength="60" required value="${v('title')}" placeholder="예: 다자이후 텐만구 참배"></label>
      </div>
      <div class="sheet-body">
        <div class="field-row three">
          <label class="field"><span>날짜</span><input id="ed-date" type="date" name="date" required value="${d}"></label>
          <label class="field"><span>시작</span><input id="ed-time" type="time" name="time" required value="${it ? it.time : ''}"></label>
          <label class="field"><span>종료 <i class="muted small">선택</i></span><input id="ed-end" type="time" name="end" value="${it && it.end ? it.end : ''}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>장소 <i class="muted small">선택</i></span><input id="ed-place" name="place" maxlength="120" value="${v('place')}" placeholder="주소나 가게 이름"></label>
          <label class="field"><span>구분 <i class="muted small">선택</i></span><input id="ed-category" name="category" list="cat-list" maxlength="20" value="${v('category')}" placeholder="이동 · 식사 · 관광"><datalist id="cat-list">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        </div>
        <label class="field"><span>알림</span><select id="ed-remind" name="remind">
          <option value="default" ${lead === 'default' ? 'selected' : ''}>기본 (${fmtLead(state.settings.lead).replace(' 알림', '')})</option>
          ${[['off', '끔'], ['0', '정각'], ['5', '5분 전'], ['10', '10분 전'], ['30', '30분 전'], ['60', '1시간 전'], ['120', '2시간 전']].map(([k, l]) => `<option value="${k}" ${lead === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
        <label class="field"><span>메모 <i class="muted small">선택</i></span><textarea id="ed-memo" name="memo" rows="3" maxlength="500">${v('memo')}</textarea></label>
        <label class="field"><span>지도 링크 <i class="muted small">선택 · 비우면 장소로 검색</i></span><input id="ed-map" type="url" name="map" value="${v('mapUrl')}" placeholder="https://maps.google.com/..."></label>
        <p class="warn" id="ed-error" hidden></p>
      </div>
      <div class="sheet-cta">
        ${it ? `<button type="button" class="btn btn-danger" id="ed-delete" data-id="${esc(it.id)}">삭제</button>` : ''}
        <button type="submit" class="btn btn-primary">${icon('check')}저장</button>
      </div>
    </form>`;
    if (!dlg.open) dlg.showModal();
    deleteArmed = null;
    $('#ed-title').focus();
  };

  const saveEditor = form => {
    const f = n => form.elements[n].value.trim();
    const err = msg => { const e = $('#ed-error'); e.textContent = msg; e.hidden = false; };
    if (!f('title')) return err('일정 이름을 적어 주세요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f('date'))) return err('날짜를 골라 주세요.');
    if (!/^\d{2}:\d{2}$/.test(f('time'))) return err('시작 시간을 골라 주세요.');
    const map = f('map');
    if (map && !/^https:\/\//.test(map)) return err('지도 링크는 https:// 로 시작해야 해요.');
    const end = /^\d{2}:\d{2}$/.test(f('end')) ? f('end') : null;
    let duration = null;
    if (end) { const a = toMin(f('time')), b = toMin(end); duration = b > a ? b - a : b < a ? b + 1440 - a : null; }
    const r = f('remind');
    const data = { date: f('date'), time: f('time'), end, duration, title: f('title'), place: f('place'), category: f('category'), memo: form.elements.memo.value.trim(), mapUrl: map, remind: r === 'default' ? undefined : r === 'off' ? null : +r };
    const editingId = $('#ed-delete') ? $('#ed-delete').dataset.id : null;
    let it = editingId ? state.items.find(i => i.id === editingId) : null;
    if (it) Object.assign(it, data);
    else { it = { id: 'u' + Date.now().toString(36), ...data }; state.items.push(it); }
    state.items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    delete state.fired[it.id]; delete state.snooze[it.id];
    const l = leadOf(it); if (l != null && startMs(it) - l * 60000 < Date.now() - 60000) state.fired[it.id] = true;
    state.day = it.date;
    save();
    $('#detail').close();
    toast(editingId ? '일정을 고쳤어요' : '일정을 추가했어요', `${fmtShort(it.date)} ${it.time} · ${it.title}`);
    render();
  };

  const deleteItem = btn => {
    if (!deleteArmed) { btn.textContent = '한 번 더 누르면 삭제'; deleteArmed = setTimeout(() => { deleteArmed = null; btn.textContent = '삭제'; }, 4000); return; }
    clearTimeout(deleteArmed); deleteArmed = null;
    const it = state.items.find(i => i.id === btn.dataset.id);
    state.items = state.items.filter(i => i.id !== btn.dataset.id);
    save(); $('#detail').close(); render();
    if (it) toast('일정을 삭제했어요', it.title);
  };

  // 지금 일정을 엑셀로 저장(여행경비 시트가 있으면 실제 지출까지 함께)
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows = [['날짜', '시간', '종료', '일정', '장소', '구분', '메모', '알림', '지도 URL']].concat(state.items.map(it => [it.date, it.time, it.end || '', it.title, it.place || '', it.category || '', it.memo || '', it.remind === undefined ? '' : it.remind === null ? '없음' : it.remind === 0 ? '정각' : `${it.remind}분 전`, it.mapUrl || '']));
    const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 11 }, { wch: 6 }, { wch: 6 }, { wch: 26 }, { wch: 28 }, { wch: 10 }, { wch: 30 }, { wch: 8 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, '일정');
    const b = state.extras && state.extras.budget;
    if (b) {
      const brow = [['일차', '구분', '항목', '단가', '통화', '수량', '예산 (원)', '실제 지출 (원)', '메모', '지도']].concat(b.lines.map(l => [l.day, l.cat, l.name, l.unit, l.cur, l.qty, Math.round(lineKrw(l, b)), l.actual || '', l.memo, l.link]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(brow), '여행경비');
    }
    XLSX.writeFile(wb, `${(state.settings.tripName || '트립알림').replace(/[\\/:*?"<>|]/g, '')}_일정.xlsx`);
  };

  // ---------- 교통 점검 · 검토 결과 ----------
  const LEVEL = { late: ['chip soon', '지연'], tight: ['chip warn', '빠듯'], ok: ['chip done', '여유'] };
  // 교통 표의 "시간표상 계획"(예: 15:10~16:10 원파이브 텐진 이동)과 일차로 일정을 찾는다
  const transportFor = it => {
    const tr = state.extras && state.extras.transport; if (!tr) return null;
    const n = days().indexOf(it.date) + 1;
    return tr.segs.find(s => parseInt(s.day, 10) === n && parseTime(splitRange(s.plan)[0]) === it.time) || null;
  };
  const segHtml = (s, inDetail) => `<div class="seg ${s.level}">
      <div class="seg-head"><span class="${LEVEL[s.level][0]}">${LEVEL[s.level][1]}</span><b>${esc(s.seg)}</b>${inDetail ? '' : `<span class="muted small">${esc(s.day)}</span>`}</div>
      <p class="small">${esc(s.mode)}</p>
      <p class="small seg-times"><span>예상 ${esc(s.dep)} → ${esc(s.arr)}${isNaN(s.mins) ? '' : ` (${s.mins}분)`}</span>${isNaN(s.slack) ? '' : `<span class="${s.slack < 0 ? 'neg' : ''}">여유 ${s.slack}분</span>`}</p>
      ${s.note ? `<p class="small seg-note">${esc(s.note)}</p>` : ''}
    </div>`;
  // n을 주면 그 일차의 구간 · 검토만 보여 준다
  const checksHtml = n => {
    const ex = state.extras; if (!ex || (!ex.transport && !ex.review)) return '';
    const ofDay = x => !n || parseInt(x.day, 10) === n;
    const segs = (ex.transport ? ex.transport.segs : []).filter(ofDay);
    const reviews = (ex.review ? ex.review.items : []).filter(ofDay);
    const cnt = k => segs.filter(s => s.level === k).length;
    const issues = segs.filter(s => s.level !== 'ok');
    return `<div class="card checks">
      <h3 class="card-title">${icon('clock')}${n ? `${n}일차 ` : ''}일정 문제점${segs.length ? `<span class="right">${segs.length}구간 확인</span>` : ''}</h3>
      ${segs.length ? `<p class="check-sum"><span class="chip soon">지연 ${cnt('late')}</span><span class="chip warn">빠듯 ${cnt('tight')}</span><span class="chip done">여유 ${cnt('ok')}</span></p>
      ${!n && ex.transport.subtitle ? `<p class="muted small">${esc(ex.transport.subtitle)}</p>` : ''}
      <div class="segs">${issues.map(s => segHtml(s, !!n)).join('')}</div>
      ${segs.length > issues.length ? `<details class="more"><summary>여유 있는 구간 ${segs.length - issues.length}곳 보기</summary><div class="segs">${segs.filter(s => s.level === 'ok').map(s => segHtml(s, !!n)).join('')}</div></details>` : ''}` : ''}
      ${!segs.length && !reviews.length ? '<p class="muted small">이 날은 점검할 구간이 없어요 👍</p>' : ''}
      ${reviews.length ? `<details class="more"${n ? ' open' : ''}><summary>${esc(ex.review.title || '검토 결과')} · ${reviews.length}건</summary>
        <ul class="review">${reviews.map(r => `<li><div class="seg-head">${n ? '' : `<span class="chip later">${esc(r.day)}</span>`}<b>${esc(r.seg)}</b></div>
          ${r.before ? `<p class="small"><s class="muted">${esc(r.before)}</s></p>` : ''}<p class="small"><b>→</b> ${esc(r.after)}</p>${r.why ? `<p class="small muted">${esc(r.why)}</p>` : ''}</li>`).join('')}</ul></details>` : ''}
    </div>`;
  };

  // ---------- 여행 경비 ----------
  const won = n => '₩' + Math.round(n).toLocaleString();
  const yen = (n, cur) => (cur === 'JPY' ? '¥' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur + ' ') + (Math.round(n * 100) / 100).toLocaleString();
  const lineKrw = (l, b) => l.cur === 'KRW' ? l.unit * l.qty : b.rate ? l.unit * l.qty * b.rate : l.budget;
  const renderBudget = () => {
    const box = $('#budget-body'), b = state.extras && state.extras.budget;
    if (!b) {
      box.innerHTML = `<div class="card empty-note"><p>엑셀에 <b>여행경비</b> 표(구분 · 항목 · 단가 · 통화 · 수량 · 예산 열)가 있으면 여기에 보여요.</p><button class="btn btn-secondary" data-view="upload">${icon('upload')}엑셀 올리기</button></div>`;
      return;
    }
    const total = b.lines.reduce((s, l) => s + lineKrw(l, b), 0);
    const spent = b.lines.reduce((s, l) => s + (l.actual || 0), 0);
    const foreignSum = b.lines.filter(l => l.cur !== 'KRW').reduce((s, l) => s + l.unit * l.qty, 0);
    const krwSum = b.lines.filter(l => l.cur === 'KRW').reduce((s, l) => s + l.unit * l.qty, 0);
    const cats = [];
    b.lines.forEach(l => { let c = cats.find(x => x.name === l.cat); if (!c) cats.push(c = { name: l.cat, budget: 0, actual: 0 }); c.budget += lineKrw(l, b); c.actual += l.actual || 0; });
    const groups = [];
    b.lines.forEach((l, i) => { let g = groups.find(x => x.day === l.day); if (!g) groups.push(g = { day: l.day, lines: [] }); g.lines.push({ ...l, i }); });
    const per100 = b.rate ? Math.round(b.rate * 100 * 100) / 100 : '';
    box.innerHTML = `
      <div class="hero budget-hero">
        <div class="hero-top"><span class="badge">${icon('wallet')}${esc(b.subtitle.split('|')[0].trim() || '1인 기준')}</span></div>
        <div><p class="muted">1인 총 예산</p><div class="hero-time">${won(total)}</div></div>
        <div class="stats">
          <div><span class="muted small">남은 예산</span><b class="${total - spent < 0 ? 'neg' : ''}">${won(total - spent)}</b></div>
          <div><span class="muted small">${b.foreign === 'JPY' ? '엔화' : b.foreign} 준비</span><b>${yen(foreignSum, b.foreign)}</b></div>
          <div><span class="muted small">원화 결제</span><b>${won(krwSum)}</b></div>
        </div>
        <label class="rate">환율 <span>100${b.foreign === 'JPY' ? '엔' : ' ' + b.foreign} =</span><input id="budget-rate" inputmode="decimal" value="${per100}" aria-label="100${b.foreign} 당 원화"><span>원${b.rateDate ? ` · ${esc(b.rateDate)} 기준` : ''}</span></label>
      </div>
      <div class="card">
        <h3 class="card-title">${icon('dash')}구분별 예산<span class="right">실제 ${won(spent)}</span></h3>
        <div class="cat-bars">${cats.sort((a, b2) => b2.budget - a.budget).map(c => `<div class="cat">
          <div class="cat-top"><b>${esc(c.name)}</b><span>${won(c.budget)} <i class="muted small">${total ? Math.round(c.budget / total * 100) : 0}%</i></span></div>
          <div class="bar"><span style="width:${total ? c.budget / total * 100 : 0}%"></span>${c.actual ? `<em style="width:${total ? Math.min(c.actual, c.budget * 1.5) / total * 100 : 0}%" class="${c.actual > c.budget ? 'over' : ''}"></em>` : ''}</div>
          ${c.actual ? `<span class="small ${c.actual > c.budget ? 'neg' : 'muted'}">실제 ${won(c.actual)}</span>` : ''}
        </div>`).join('')}</div>
      </div>
      ${groups.map(g => {
        const sub = g.lines.reduce((s, l) => s + lineKrw(l, b), 0);
        return `<div class="card">
          <h3 class="card-title">${esc(g.day || '기타')}<span class="right">${won(sub)}</span></h3>
          <ul class="exp">${g.lines.map(l => `<li>
            <div class="exp-main"><span class="chip later">${esc(l.cat)}</span><b>${esc(l.name)}</b>${l.memo ? `<span class="muted small">${esc(l.memo)}</span>` : ''}${l.link ? `<a class="link small" href="${esc(l.link)}" target="_blank" rel="noopener">${icon('pin')}경로 보기</a>` : ''}</div>
            <div class="exp-num"><b>${won(lineKrw(l, b))}</b>${l.cur !== 'KRW' ? `<span class="muted small">${yen(l.unit, l.cur)}${l.qty !== 1 ? ` × ${l.qty}` : ''}</span>` : l.qty !== 1 ? `<span class="muted small">${won(l.unit)} × ${l.qty}</span>` : ''}
              <label class="actual"><span class="small muted">실제</span><input inputmode="numeric" data-actual="${l.i}" value="${l.actual ? Math.round(l.actual).toLocaleString() : ''}" placeholder="0" aria-label="${esc(l.name)} 실제 지출(원)"></label></div>
          </li>`).join('')}</ul>
        </div>`;
      }).join('')}`;
  };

  // ---------- 알림 ----------
  let swReg = null;
  const notifySupported = () => 'Notification' in window;
  // claude.ai 미리보기처럼 다른 사이트 안(iframe)에 열리면 브라우저가 알림 권한 요청을 막는다
  const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // 시스템 알림을 켤 수 없는 이유(없으면 null)
  const notifyBlocker = () => {
    if (embedded) return { title: '이 화면에서는 시스템 알림을 켤 수 없어요', body: 'claude.ai 미리보기 안에서는 브라우저가 알림을 막아요. 페이지를 열어 두면 화면 알림과 소리로 알려 드려요. 폰 알림 센터로 받으려면 사이트 주소(GitHub Pages)로 여세요.' };
    if (!notifySupported()) return isIOS && !standalone
      ? { title: '홈 화면에 추가해야 알림을 켤 수 있어요', body: '아이폰은 Safari 공유 버튼 → 홈 화면에 추가 → 그 아이콘으로 열어 주세요 (iOS 16.4 이상). 지금은 화면 알림과 소리만 울려요.' }
      : { title: '이 브라우저는 시스템 알림을 지원하지 않아요', body: '페이지를 열어 두면 화면 알림과 소리로 알려 드려요.' };
    if (Notification.permission === 'denied') return isIOS
      ? { title: '알림이 꺼져 있어요', body: '아이폰 설정 앱 → 알림 → 트립알림 → 알림 허용을 켜 주세요.' }
      : { title: '브라우저에서 알림이 막혀 있어요', body: '주소창 왼쪽 아이콘 → 사이트 설정(권한) → 알림 → 허용으로 바꾼 뒤 새로고침해 주세요.' };
    return null;
  };
  const updateNotifyStatus = () => {
    const el = $('#notify-status'); if (!el) return;
    const blk = notifyBlocker();
    el.textContent = blk ? `${blk.title}. ${blk.body}` : state.settings.notify && Notification.permission === 'granted' ? '켜짐 · 이 페이지가 열려 있으면 일정 시간에 알려요' : '일정 시간에 팝업으로 알려요';
    el.classList.toggle('warn', !!blk);
  };
  const enableNotifications = async silent => {
    let blk = notifyBlocker();
    if (!blk && Notification.permission === 'default') {
      let p;
      try { p = await Notification.requestPermission(); } catch { p = 'denied'; }
      state.settings.notify = p === 'granted';
      if (p !== 'granted') blk = p === 'denied' ? notifyBlocker() : { title: '알림을 허용하지 않았어요', body: '다시 켜려면 설정 탭에서 브라우저 알림을 눌러 주세요.' };
    } else state.settings.notify = !blk;
    save(); renderSettings();
    if (!silent && blk) toast(blk.title, blk.body);
  };

  let audioCtx = null;
  const beep = () => {
    if (!state.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((d, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = i ? 1046 : 784; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + d + 0.25);
        o.connect(g).connect(audioCtx.destination); o.start(audioCtx.currentTime + d); o.stop(audioCtx.currentTime + d + 0.3);
      });
    } catch { /* 오디오를 못 쓰면 소리 없이 진행 */ }
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
  };

  const fire = (it, testing) => {
    const s = startMs(it), now = Date.now();
    const when = s <= now ? '지금 시작' : `${fmtLeftWords(s - now)} 뒤`;
    const title = `${when} · ${it.title}`;
    const body = [it.time, it.place, it.memo.split('\n')[0]].filter(Boolean).join(' · ');
    toast(title, body, testing ? null : it);
    beep();
    if (state.settings.notify && notifySupported() && Notification.permission === 'granted') {
      const opts = { body, tag: it.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { id: it.id }, requireInteraction: true };
      if (swReg && swReg.showNotification) swReg.showNotification(title, opts).catch(() => {});
      else { try { new Notification(title, opts); } catch { /* 안드로이드 크롬은 서비스 워커로만 가능 */ } }
    }
  };

  const checkAlerts = () => {
    const now = Date.now();
    for (const it of state.items) {
      const lead = leadOf(it);
      if (lead == null) continue;
      const s = startMs(it), at = s - lead * 60000;
      const sz = state.snooze[it.id];
      if (sz && now >= sz) { delete state.snooze[it.id]; save(); fire(it); continue; }
      if (state.fired[it.id] || now < at) continue;
      state.fired[it.id] = true; save();
      // 탭이 오래 닫혀 있다가 열린 경우, 이미 끝난 일정은 조용히 넘긴다
      if (now < endMs(it)) fire(it);
    }
  };

  const toast = (title, body, it) => {
    const wrap = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="tm">${icon('plane')}</span><div><b>${esc(title)}</b>${body ? `<span class="muted small">${esc(body)}</span>` : ''}
      ${it ? `<div class="acts"><a href="${itemMap(it)}" target="_blank" rel="noopener" style="color:var(--brand);font-weight:700">지도 열기</a><button data-snooze="${esc(it.id)}">${SNOOZE_MIN}분 뒤 다시</button></div>` : ''}</div>
      <button class="del" aria-label="닫기" style="width:32px;height:32px;display:grid;place-items:center">${icon('x')}</button>`;
    wrap.prepend(el);
    const close = () => el.remove();
    el.querySelector('.del').addEventListener('click', close);
    setTimeout(close, it ? 20000 : 5000);
  };

  // ---------- 설정 ----------
  const SKINS = [['journey', '여정 지도'], ['sketch', '손그림 노트']];
  const applySkin = () => { document.documentElement.dataset.skin = state.settings.skin === 'sketch' ? 'sketch' : 'journey'; const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = state.settings.skin === 'sketch' ? '#FFF0A0' : '#FFFFFF'; };
  const renderSettings = () => {
    $('#skin-pills').innerHTML = SKINS.map(([k, l]) => `<button class="pill ${(state.settings.skin || 'journey') === k ? 'on' : ''}" data-skin="${k}">${l}</button>`).join('');
    $('#t-notify').setAttribute('aria-checked', String(!!state.settings.notify && !notifyBlocker() && Notification.permission === 'granted'));
    $('#t-sound').setAttribute('aria-checked', String(!!state.settings.sound));
    $('#lead-pills').innerHTML = LEADS.map(l => `<button class="pill ${state.settings.lead === l ? 'on' : ''}" data-lead="${l}">${l === 0 ? '정각' : l >= 60 ? l / 60 + '시간 전' : l + '분 전'}</button>`).join('');
    const sel = $('#city-select');
    if (!sel.options.length) sel.innerHTML = CITIES.map(c => `<option value="${c.id}">${c.name} (${c.country}) · ${c.cur}</option>`).join('');
    sel.value = state.settings.city;
    if (document.activeElement !== $('#trip-name')) $('#trip-name').value = state.settings.tripName || '';
    $('#start-date').value = state.settings.startDate || '';
    updateNotifyStatus();
  };

  // ---------- 렌더 ----------
  const render = background => {
    renderTripCard();
    if (state.view === 'today') renderToday();
    if (state.view === 'schedule') renderSchedule();
    if (state.view === 'upload' && !background) renderUpload();
    if (state.view === 'settings' && !background) renderSettings();
    if (state.view === 'budget' && !(background && document.activeElement && document.activeElement.closest('#budget-body'))) renderBudget();
    renderWidgets(background);
  };

  // ---------- 이벤트 ----------
  document.addEventListener('click', e => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.view) { e.preventDefault(); setView(t.dataset.view); return; }
    if (t.dataset.open) { openDetail(t.dataset.open); return; }
    if (t.dataset.add != null) { openEditor(null, t.dataset.add || null); return; }
    if (t.dataset.edit) { openEditor(t.dataset.edit); return; }
    if (t.id === 'ed-delete') { deleteItem(t); return; }
    if (t.hasAttribute('data-close')) { $('#detail').close(); return; }
    if (t.hasAttribute('data-sample')) { loadSample(); return; }
    if (t.dataset.day) { state.day = t.dataset.day; renderToday(); return; }
    if (t.dataset.spane) { state.schedPane = t.dataset.spane; renderSchedule(); return; }
    if (t.dataset.sday) { state.schedDay = t.dataset.sday; renderSchedule(); window.scrollTo({ top: 0 }); return; }
    if (t.dataset.skin) { state.settings.skin = t.dataset.skin; save(); applySkin(); render(); return; }
    if (t.dataset.lead != null) { state.settings.lead = +t.dataset.lead; save(); render(); return; }
    if (t.dataset.itemLead != null) {
      const it = state.items.find(i => i.id === t.dataset.id);
      if (it) { it.remind = t.dataset.itemLead === 'off' ? null : +t.dataset.itemLead; delete state.fired[it.id]; const l = leadOf(it); if (l != null && startMs(it) - l * 60000 < Date.now()) state.fired[it.id] = true; save(); openDetail(it.id); render(); }
      return;
    }
    if (t.dataset.snooze) { state.snooze[t.dataset.snooze] = Date.now() + SNOOZE_MIN * 60000; save(); t.closest('.toast').remove(); toast(`${SNOOZE_MIN}분 뒤에 다시 알려 드릴게요`); return; }
    if (t.dataset.quick) { state.conv.foreign = t.dataset.quick; const per = krwPer(city().cur); state.conv.krw = per ? Math.round(+t.dataset.quick * per).toLocaleString() : ''; renderWidgets(); return; }
    if (t.dataset.delCheck) { state.checks = state.checks.filter(x => x.id !== t.dataset.delCheck); save(); renderWidgets(); return; }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.check) { const x = state.checks.find(c => c.id === t.dataset.check); if (x) { x.done = t.checked; save(); renderWidgets(); } }
    if (t.dataset.map) { state.pending.map[t.dataset.map] = t.value === '' ? null : +t.value; renderUpload(); }
    if (t.id === 'sheet-select') { const ex = state.pending.extras; state.pending = pendingFromBook(state.pending.book, state.pending.fileName, t.value); state.pending.extras = ex; renderUpload(); }
    if (t.dataset.manualRate != null) { const v = parseFloat(t.value.replace(/,/g, '')); if (v > 0) { store.set('manualRate.' + city().cur, v); renderWidgets(); } }
    const b = state.extras && state.extras.budget;
    if (b && t.dataset.actual != null) { const v = num(t.value); b.lines[+t.dataset.actual].actual = v > 0 ? v : null; save(); renderBudget(); }
    if (b && t.id === 'budget-rate') { const v = num(t.value); if (v > 0) { b.rate = v / 100; save(); } renderBudget(); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset.conv) return;
    const per = krwPer(city().cur); if (!per) return;
    const v = parseFloat(t.value.replace(/,/g, ''));
    if (t.dataset.conv === 'foreign') { state.conv.foreign = t.value; state.conv.krw = isNaN(v) ? '' : Math.round(v * per).toLocaleString(); }
    else { state.conv.krw = t.value; state.conv.foreign = isNaN(v) ? '' : String(Math.round((v / per) * 100) / 100); }
    const other = t.dataset.conv === 'foreign' ? 'krw' : 'foreign';
    $$(`[data-conv="${other}"]`).forEach(el => { el.value = state.conv[other]; });
    $$(`[data-conv="${t.dataset.conv}"]`).forEach(el => { if (el !== t) el.value = t.value; });
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'edit-form') { e.preventDefault(); saveEditor(e.target); return; }
    if (!e.target.matches('[data-check-add]')) return;
    e.preventDefault();
    const v = e.target.t.value.trim(); if (!v) return;
    state.checks.push({ id: 'c' + Date.now(), text: v, done: false }); save(); renderWidgets();
  });

  $('#file-input').addEventListener('change', e => { const f = e.target.files[0]; if (f) readFile(f); e.target.value = ''; });
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
  $('#upload-result').addEventListener('click', e => { if (e.target.closest('#commit-btn')) commitPending(); });
  $('#template-btn').addEventListener('click', downloadTemplate);
  $('#sample-btn').addEventListener('click', loadSample);
  $('#t-notify').addEventListener('click', async () => {
    if (state.settings.notify && !notifyBlocker() && Notification.permission === 'granted') { state.settings.notify = false; save(); renderSettings(); return; }
    await enableNotifications(false);
  });
  $('#t-sound').addEventListener('click', () => { state.settings.sound = !state.settings.sound; save(); renderSettings(); if (state.settings.sound) beep(); });
  $('#test-notify').addEventListener('click', async () => {
    if (!state.settings.notify && !notifyBlocker()) await enableNotifications(true);
    fire({ id: 'test', title: '알림 테스트', time: timeIn(Date.now(), city().tz), place: '이렇게 알려 드려요', memo: '', date: todayStr() }, true);
  });
  $('#city-select').addEventListener('change', e => { state.settings.city = e.target.value; state.conv = { foreign: '', krw: '' }; save(); weather.key = null; loadWeather(); render(); });
  $('#trip-name').addEventListener('input', e => { state.settings.tripName = e.target.value; save(); renderTripCard(); });
  $('#start-date').addEventListener('change', e => { state.settings.startDate = e.target.value; save(); });
  // confirm()은 앱 안 웹뷰 등에서 막히는 경우가 있어 버튼을 두 번 누르게 한다
  let clearArmed = null;
  $('#clear-btn').addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!clearArmed) {
      btn.textContent = '한 번 더 누르면 모두 지워져요';
      clearArmed = setTimeout(() => { clearArmed = null; btn.textContent = '일정 모두 지우기'; }, 4000);
      return;
    }
    clearTimeout(clearArmed); clearArmed = null; btn.textContent = '일정 모두 지우기';
    state.items = []; state.extras = null; state.fired = {}; state.snooze = {}; store.set('presetDismissed', true); save(); toast('일정을 지웠어요'); setView('today');
  });
  $('#detail').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkAlerts(); render(true); } });

  // ---------- 시작 ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) { setView('today'); openDetail(e.data.open); } });
  }
  // ---------- 공유 저장소 (claude.ai 미리보기의 db 기능) ----------
  // trip/current 문서 하나에 여행 이름 · 여행지 · 일정 · 경비/점검 표를 둔다. 여러 기기와 다른 Claude 대화가
  // 같은 문서를 읽고 쓴다. 알림 설정과 보낸 알림 기록은 기기마다 따로(localStorage) 둔다.
  // 문서에 items가 없고 book(엑셀 시트 행 배열)만 있으면 사이트가 직접 읽어 일정을 만든다.
  // 같은 방식으로 GitHub Pages에서는 Firebase(로그인한 계정의 users/<uid>/trips/current 문서)를 쓴다.
  // kind: 'claude'(미리보기 공유 저장소) | 'firebase'(계정) | null
  const sync = { ref: null, kind: null, unsub: null, canWrite: true, lastJson: null, timer: null, writing: Promise.resolve(), status: 'local', first: true };
  const sharedState = () => JSON.parse(JSON.stringify({ tripName: state.settings.tripName || '', city: state.settings.city, items: state.items, extras: state.extras || null }));
  const setSyncStatus = (status, detail) => {
    sync.status = status;
    const where = sync.kind === 'firebase' ? '계정' : '공유 저장소';
    const text = {
      local: fb.ready ? '로그인하지 않아서 일정이 이 기기에만 저장돼요.' : '일정은 이 기기 브라우저에만 저장돼요.',
      connecting: `${where}에 연결하는 중…`,
      synced: sync.kind === 'firebase' ? '계정에 저장됨 · 같은 계정으로 로그인한 모든 기기에서 같은 일정을 봐요.' : '공유 저장소와 연결됨 · 다른 기기와 Claude 대화에서도 같은 일정을 봐요.',
      saving: `${where}에 저장하는 중…`,
      readonly: '보기 전용이라 고친 내용은 이 기기에만 남아요.',
      error: `${where}에 저장하지 못했어요${detail ? ` (${detail})` : ''}. 고친 내용은 이 기기에 남아 있어요.`,
    }[status];
    $$('[data-sync-status]').forEach(el => { el.textContent = text; el.dataset.state = status; });
  };
  const syncErrorText = e => !e ? '' : e.code === 'permission-denied' ? '권한 없음 · Firestore 보안 규칙을 확인해 주세요' : e.code === 'unavailable' ? '인터넷 연결 확인' : e.code || '';
  function scheduleShared() {
    if (!sync.ref || !sync.canWrite || sync.lastJson == null) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(() => {
      const body = sharedState(), json = JSON.stringify(body);
      if (json === sync.lastJson) return;
      sync.lastJson = json;
      setSyncStatus('saving');
      sync.writing = sync.writing
        .then(() => sync.ref.set({ ...body, updatedAt: new Date().toISOString(), updatedBy: 'site' }))
        .then(() => setSyncStatus('synced'))
        .catch(e => {
          if (sync.kind === 'claude' && e && e.code === 'invalid_argument' && JSON.stringify(body).length < 250000) { sync.canWrite = false; setSyncStatus('readonly'); }
          else { sync.lastJson = null; setSyncStatus('error', syncErrorText(e)); }
        });
    }, 600);
  }
  const applyShared = snap => {
    if (snap.metadata && snap.metadata.hasPendingWrites) return;
    if (!snap.exists) {
      // 저장소가 비어 있으면 이 기기의 일정으로 채운다
      sync.lastJson = JSON.stringify({ tripName: '', city: '', items: [], extras: null });
      setSyncStatus('synced');
      if (state.items.length) scheduleShared();
      sync.first = false;
      return;
    }
    const d = snap.data() || {};
    let items = Array.isArray(d.items) ? d.items : null, extras = d.extras === undefined ? null : d.extras;
    if (!items && Array.isArray(d.book)) {
      const p = pendingFromBook(d.book, d.file || '엑셀', d.sheet);
      items = buildItems(p).items;
      if (d.extras === undefined) extras = parseExtras(d.book);
    }
    const incoming = JSON.parse(JSON.stringify({ tripName: d.tripName || '', city: CITIES.some(c => c.id === d.city) ? d.city : state.settings.city, items: items || [], extras }));
    incoming.items.forEach(it => { if (!it.id) it.id = `${it.date}_${it.time}_${Math.random().toString(36).slice(2, 7)}`; });
    const changed = JSON.stringify(incoming) !== JSON.stringify(sharedState());
    if (changed) {
      const known = new Set(state.items.map(i => i.id));
      state.items = incoming.items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      state.extras = incoming.extras;
      state.settings.tripName = incoming.tripName;
      if (incoming.city !== state.settings.city) { state.settings.city = incoming.city; weather.key = null; loadWeather(); }
      const now = Date.now();
      state.items.forEach(it => { if (known.has(it.id)) return; const l = leadOf(it); if (l != null && startMs(it) - l * 60000 < now - 60000) state.fired[it.id] = true; });
    }
    sync.lastJson = JSON.stringify(sharedState());
    save();
    setSyncStatus('synced');
    if (changed) {
      if (!sync.first) toast('일정이 업데이트됐어요', `${d.updatedBy === 'site' ? '다른 기기' : 'Claude'}에서 바꾼 내용을 받았어요`);
      else if (sync.kind === 'firebase') toast('계정의 일정을 불러왔어요', `${incoming.items.length}개 일정`);
      if ($('#detail').open && !$('#edit-form')) $('#detail').close();
      render();
    }
    sync.first = false;
  };
  const attachDoc = (kind, ref) => {
    if (sync.unsub) { try { sync.unsub(); } catch { /* 이미 끊김 */ } }
    clearTimeout(sync.timer);
    Object.assign(sync, { kind, ref, unsub: null, canWrite: true, lastJson: null, first: true });
    if (!ref) { setSyncStatus('local'); return; }
    setSyncStatus('connecting');
    sync.unsub = ref.onSnapshot(applyShared, e => setSyncStatus('error', syncErrorText(e)));
  };
  const initShared = async () => {
    if (!window.claude || typeof window.claude.use !== 'function') return false;
    let db = null;
    try { db = await window.claude.use('db'); } catch { db = null; }
    if (!db) return false;
    attachDoc('claude', db.doc('trip/current'));
    return true;
  };

  // ---------- 로그인 (Firebase · GitHub Pages 등 일반 사이트에서) ----------
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAqW77wiHgampjaegS3LtBb1FUegdHZvxo',
    authDomain: 'travel-6fd2d.firebaseapp.com',
    projectId: 'travel-6fd2d',
    storageBucket: 'travel-6fd2d.firebasestorage.app',
    messagingSenderId: '139758128237',
    appId: '1:139758128237:web:650fc9b457b8a482790364',
  };
  const fb = { ready: false, auth: null, db: null, user: null, busy: false };
  const AUTH_ERRORS = {
    'auth/invalid-email': '이메일 형식이 맞지 않아요.',
    'auth/missing-password': '비밀번호를 입력해 주세요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 해요.',
    'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인을 눌러 주세요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/invalid-login-credentials': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/user-not-found': '가입되지 않은 이메일이에요. 회원가입을 눌러 주세요.',
    'auth/too-many-requests': '시도가 너무 많아요. 잠시 뒤 다시 해 주세요.',
    'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
    'auth/operation-not-allowed': 'Firebase에서 이메일/비밀번호 로그인이 꺼져 있어요. Authentication → 로그인 방법에서 사용 설정해 주세요.',
    'auth/unauthorized-domain': '이 주소가 Firebase 승인된 도메인에 없어요. Authentication → 설정 → 승인된 도메인에 추가해 주세요.',
  };
  const authMsg = e => AUTH_ERRORS[e && e.code] || `로그인 중 문제가 생겼어요${e && e.code ? ` (${e.code})` : ''}.`;
  const renderAccount = () => {
    const box = $('#account'); if (!box) return;
    if (!fb.ready) { box.closest('.card').hidden = true; return; }
    box.closest('.card').hidden = false;
    if (fb.user) {
      box.innerHTML = `<p class="small muted">로그인한 계정</p><p class="account-email">${esc(fb.user.email || '')}</p>
        <p class="sync-note" data-sync-status></p>
        <button class="btn btn-secondary full" id="logout-btn">로그아웃</button>`;
    } else {
      box.innerHTML = `<p class="small muted">로그인하면 폰 · 컴퓨터 · 홈 화면 앱에서 같은 일정과 경비를 봐요. 처음이면 이메일과 비밀번호(6자 이상)를 넣고 <b>회원가입</b>을 눌러 주세요.</p>
        <form id="login-form" class="login-form" novalidate>
          <label class="field"><span>이메일</span><input id="login-email" type="email" autocomplete="email" inputmode="email" required></label>
          <label class="field"><span>비밀번호</span><input id="login-password" type="password" autocomplete="current-password" minlength="6" required></label>
          <p class="warn" id="login-error" hidden></p>
          <div class="btn-row login-btns"><button class="btn btn-primary" type="submit" data-mode="login">로그인</button><button class="btn btn-secondary" type="submit" data-mode="signup">회원가입</button></div>
          <button class="link" type="button" id="reset-btn">비밀번호를 잊었어요</button>
        </form>
        <p class="sync-note" data-sync-status></p>`;
    }
    setSyncStatus(sync.status);
  };
  const initFirebase = () => {
    if (typeof window.firebase === 'undefined' || !firebase.initializeApp) return false;
    try {
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
      fb.auth = app.auth(); fb.db = app.firestore(); fb.ready = true;
    } catch { return false; }
    fb.auth.onAuthStateChanged(user => {
      fb.user = user;
      attachDoc(user ? 'firebase' : null, user ? fb.db.doc(`users/${user.uid}/trips/current`) : null);
      renderAccount(); renderTripCard();
    });
    renderAccount();
    return true;
  };
  const submitLogin = async (form, mode) => {
    if (fb.busy) return;
    const email = form.elements['login-email'].value.trim(), pw = form.elements['login-password'].value;
    const err = $('#login-error');
    const show = m => { err.textContent = m; err.hidden = false; };
    if (!email) return show('이메일을 입력해 주세요.');
    if (pw.length < 6) return show('비밀번호는 6자 이상이어야 해요.');
    fb.busy = true; err.hidden = true;
    $$('#login-form button').forEach(b => { b.disabled = true; });
    try {
      if (mode === 'signup') await fb.auth.createUserWithEmailAndPassword(email, pw);
      else await fb.auth.signInWithEmailAndPassword(email, pw);
      toast(mode === 'signup' ? '가입했어요' : '로그인했어요', email);
    } catch (e) { show(authMsg(e)); $$('#login-form button').forEach(b => { b.disabled = false; }); }
    fb.busy = false;
  };

  // data/preset.json이 함께 배포돼 있으면, 일정이 비어 있을 때 그 엑셀을 자동으로 불러온다
  // 형식: { "file": "일정.xlsx", "city": "fukuoka", "tripName": "후쿠오카 여행", "sheet": "(선택)" }
  const loadPreset = async () => {
    // 이미 일정이 있으면 건드리지 않고, 경비·점검 표만 비어 있을 때 채운다
    if (store.get('presetDismissed', false) || (state.items.length && state.extras)) return;
    const keepItems = state.items.length > 0;
    try {
      const res = await fetch('data/preset.json', { cache: 'no-store' });
      if (!res.ok) return;
      const cfg = await res.json();
      // book: [{ name, rows, links }] 그대로, rows: 시트 하나의 행 배열, 아니면 file의 엑셀을 읽는다
      const book = Array.isArray(cfg.book) ? cfg.book
        : Array.isArray(cfg.rows) ? [{ name: cfg.sheet || '일정', rows: cfg.rows, links: {} }]
        : bookFromWorkbook(XLSX.read(await (await fetch('data/' + encodeURIComponent(cfg.file))).arrayBuffer(), { type: 'array' }));
      const p = pendingFromBook(book, cfg.file || cfg.tripName || '일정', cfg.sheet);
      const { items } = buildItems(p);
      if (!items.length) return;
      if (keepItems) {
        // 같은 여행(날짜가 겹치는 일정)일 때만 표를 붙인다
        const presetDays = new Set(items.map(i => i.date));
        if (state.items.some(i => presetDays.has(i.date))) { state.extras = parseExtras(book); save(); render(); }
        return;
      }
      if (cfg.city && CITIES.some(c => c.id === cfg.city)) state.settings.city = cfg.city;
      if (cfg.tripName) state.settings.tripName = cfg.tripName;
      state.items = items;
      state.extras = parseExtras(book);
      const now = Date.now();
      items.forEach(it => { const l = leadOf(it); if (l != null && startMs(it) - l * 60000 < now - 60000) state.fired[it.id] = true; });
      state.day = null;
      save();
      toast(`${state.settings.tripName || cfg.file} 일정을 불러왔어요`, `${items.length}개 일정 · 설정에서 알림을 켜 주세요`);
      weather.key = null; loadWeather();
      render();
    } catch { /* 미리 넣어 둔 일정이 없으면 빈 화면으로 시작 */ }
  };

  $('#export-btn').addEventListener('click', exportExcel);
  // 위젯 스크립트를 클립보드로 복사(아이폰에서 Scriptable에 붙여 넣기용)
  $('#copy-widget').addEventListener('click', async () => {
    const msg = $('#copy-widget-msg');
    const show = t => { msg.textContent = t; msg.hidden = false; };
    const rawUrl = 'https://raw.githubusercontent.com/john31331234-gif/travel/main/widget/trip-widget.js';
    try {
      // 클립보드 쓰기는 누른 직후에 해야 하므로 내용을 Promise로 넘긴다(Safari)
      const text = fetch('widget/trip-widget.js', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(t => new Blob([t], { type: 'text/plain' })) })]);
      } else await navigator.clipboard.writeText(await text);
      show('복사했어요. Scriptable에서 + 를 누르고 붙여 넣어 주세요.');
    } catch {
      show(`복사가 안 됐어요. 이 주소를 열어 전체 선택 → 복사해 주세요: ${rawUrl}`);
    }
  });
  applySkin();
  const VIEWS = ['today', 'schedule', 'budget', 'upload', 'tools', 'settings'];
  const initial = (location.hash || '').slice(1);
  setView(VIEWS.includes(initial) ? initial : 'today');
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS.includes(v) && v !== state.view) { if ($('#detail').open) $('#detail').close(); setView(v); } });
  setSyncStatus('local');
  // claude.ai 미리보기면 그 공유 저장소, 아니면 Firebase 로그인을 쓴다
  initShared().then(shared => { if (shared) return; initFirebase(); loadPreset(); });
  // e.submitter가 없는 오래된 Safari를 위해 마지막으로 누른 버튼을 기억한다
  let loginMode = 'login';
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#login-form [data-mode]'); if (b) loginMode = b.dataset.mode; }, true);
  document.addEventListener('submit', e => {
    if (e.target.id !== 'login-form') return;
    e.preventDefault();
    const mode = (e.submitter && e.submitter.dataset.mode) || loginMode;
    loginMode = 'login';
    submitLogin(e.target, mode);
  });
  document.addEventListener('click', async e => {
    if (e.target.closest('#logout-btn')) { await fb.auth.signOut(); toast('로그아웃했어요', '이 기기에 남은 일정은 그대로 볼 수 있어요'); }
    if (e.target.closest('#reset-btn')) {
      const email = ($('#login-email') || {}).value || '';
      const err = $('#login-error');
      if (!email.trim()) { err.textContent = '이메일을 먼저 입력해 주세요.'; err.hidden = false; return; }
      try { await fb.auth.sendPasswordResetEmail(email.trim()); toast('비밀번호 재설정 메일을 보냈어요', email.trim()); }
      catch (x) { err.textContent = authMsg(x); err.hidden = false; }
    }
  });
  loadRates(); loadWeather();
  checkAlerts();
  setInterval(tickCountdown, 1000);
  setInterval(checkAlerts, 10000);
  setInterval(() => { render(true); loadWeather(); }, 60000);

  // 테스트용으로 몇 가지 함수를 노출한다
  window.__trip = { parseDate, parseTime, parseRemind, guessMapping, zonedToEpoch, buildItems, state, sharedState, applyShared, sync };
})();
