/* สหพันธรัฐแห่งคีรันนา · หอเกียรติยศอัตโนมัติและลานความคิดเห็น (Google Apps Script)
 *
 * วางโค้ดนี้ใน Apps Script ของ Google Sheet หนึ่งไฟล์ แล้วเผยแพร่เป็น Web app (Execute as: Me, Who has access: Anyone)
 * ผู้ชนะที่ลงชื่อเข้าใช้ Google (หรือเครื่องผู้พัฒนา) จะถูกบันทึกลงชีต "hof" เองตอนจบเกม หน้าเกมอ่านรายชื่อจากที่นี่
 * ความคิดเห็นที่ผู้เล่นที่ลงชื่อเข้าใช้กดส่งลงชีต "cmt" ทันที เครื่องผู้พัฒนาลบรายชื่อหรือความคิดเห็นจากหน้าเกมได้
 * การลบจดไว้ในชีต "removed" ทุกหน้าเกมจึงซ่อนรายการนั้น แม้รายการจะยังค้างอยู่ในไฟล์ของคลังหรือในเครื่องผู้เล่น
 * ลบแถวในชีตเพื่อเอาบันทึกที่ไม่ต้องการออกได้ทันทีเหมือนเดิม
 * ถ้าเคยเผยแพร่รุ่นก่อนแล้ว วางโค้ดนี้ทับ แล้ว Deploy > Manage deployments > แก้ไข > Version: New version ที่อยู่เดิมใช้ต่อได้
 *
 * สถิติการเล่น: ชีต "daily" นับจำนวนคนเข้าต่อวัน (เบราว์เซอร์ละครั้งต่อวัน แยกสมาชิกกับผู้มาเยือน ไม่มีรายการการเข้าชม)
 * ชีต "games" เก็บเกมที่เริ่ม จบ หรือออกกลางคัน พร้อมผล การ์ดที่แต่ละรัฐเลือก และบันทึกการเดินของแต่ละเกม
 * สองชีตนี้ไม่มีทางอ่านผ่านที่อยู่สาธารณะ อ่านได้จากหน้าสถิติบนเครื่องผู้พัฒนาเท่านั้น (และจากตัวชีตเองในบัญชีของเจ้าของ)
 * ตั้ง CONFIG.STATS เป็น false เพื่อหยุดเก็บ
 *
 * สิ่งที่สคริปต์เก็บ: บันทึกเกมแบบเดียวกับไฟล์ data/hall-of-fame.json แฮชของรหัสบัญชี และสถิติการเล่นข้างต้น
 * (รหัสสุ่มของเบราว์เซอร์ ไม่ใช่ชื่อหรืออีเมล) สคริปต์ไม่เห็นที่อยู่ IP ของผู้เล่นและไม่เก็บอีเมล
 * โทเค็นการลงชื่อเข้าใช้ใช้ตรวจกับ Google ครั้งเดียวแล้วทิ้ง ที่เหลือใช้ตั๋วที่สคริปต์ลงลายมือชื่อเอง
 */
const CONFIG = {
  // OAuth Client ID ตัวเดียวกับใน config.js ของหน้าเกม ว่างไว้ = ยอมรับบัญชี Google ที่ยืนยันแล้วจากทุกแอป
  GOOGLE_CLIENT_ID: '',
  // แฮชของโทเค็นเครื่องผู้พัฒนา ต้องตรงกับ DEV_HASH ในหน้าเกม
  DEV_HASH: '34605b69ee31ea08c513356452b54d0d6093cdcedab4e2151355e1840c7f15fc',
  MAX_PER_DAY: 20,      // บันทึกที่บัญชีหนึ่งส่งได้ใน 24 ชั่วโมง
  LIST_SIZE: 30,        // จำนวนอันดับที่หน้าเกมอ่าน (หน้าเกมแสดง 10)
  SESSION_DAYS: 120,    // อายุตั๋วหลังลงชื่อเข้าใช้
  MAX_CMT_PER_DAY: 30,  // ความคิดเห็นที่บัญชีหนึ่งส่งได้ใน 24 ชั่วโมง
  CMT_LIST: 200,        // จำนวนความคิดเห็นล่าสุดที่หน้าเกมอ่าน
  REMOVED_LIST: 1000,   // จำนวนรายการที่ลบแล้วที่หน้าเกมอ่าน
  // สถิติการเล่น (อ่านได้เฉพาะเครื่องผู้พัฒนา)
  STATS: true,               // false = ไม่เก็บสถิติเลย
  KEEP_DAYS: 365,            // เก็บย้อนหลังกี่วัน แถวที่เก่ากว่านี้ถูกลบตอนผู้พัฒนาเปิดหน้าสถิติ
  UTC_OFFSET: 7,             // เขตเวลาที่ใช้แบ่งวัน (ไทย UTC+7)
  GAMES_PER_BROWSER: 80,     // เหตุการณ์เกมที่เบราว์เซอร์หนึ่งส่งได้ต่อวัน
  VISITS_PER_DAY: 20000,     // เพดานจำนวนคนเข้าต่อวัน กันตัวนับพองเพราะสแปม
  GAMES_PER_DAY: 3000,       // เพดานเหตุการณ์เกมทั้งเว็บต่อวัน
  TOP_CARDS: 15,             // จำนวนการ์ดยอดนิยมต่อชุดกฎที่หน้าสถิติแสดง
};
const SHEET = 'hof';
const HEAD = ['id', 'ts', 'by', 'score', 'margin', 'json'];
const CSHEET = 'cmt';
const CHEAD = ['id', 'ts', 'by', 'json'];
const RSHEET = 'removed';
const RHEAD = ['kind', 'id', 'ts', 'by'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.list === 'hof') return out(listCached());
  if (p.list === 'cmt') return out(listComments());
  if (p.list === 'removed') return out(listRemoved());
  return out({ ok: true, app: 'kirana-federation-hof', v: 3, count: Math.max(0, sheet().getLastRow() - 1) });
}

function doPost(e) {
  let b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ ok: false, err: 'json' }); }
  if (!b || typeof b !== 'object') return out({ ok: false, err: 'json' });
  if (b.action === 'session') return out(session(b));
  if (b.action === 'hof') return out(addRecord(b));
  if (b.action === 'cmt') return out(addComment(b));
  if (b.action === 'del') return out(removeEntry(b));
  if (b.action === 'ev') return out(addEvent(b));
  if (b.action === 'stats') return out(readStats(b));
  if (b.action === 'replay') return out(readReplay(b));
  return out({ ok: false, err: 'action' });
}

// ---------- who is sending: a Google sign-in (checked with Google) or the developer device ----------
function session(b) {
  let acct = null;
  if (typeof b.dev === 'string' && /^[0-9a-f]{64}$/.test(b.dev)) {
    if (hex(sha256(b.dev)) === CONFIG.DEV_HASH) acct = 'dev';
  } else if (typeof b.google === 'string' && b.google.length < 4096) {
    const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(b.google), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return { ok: false, err: 'token' };
    let t; try { t = JSON.parse(r.getContentText()); } catch (err) { return { ok: false, err: 'token' }; }
    if (!/^(https:\/\/)?accounts\.google\.com$/.test(t.iss || '')) return { ok: false, err: 'token' };
    if (CONFIG.GOOGLE_CLIENT_ID && t.aud !== CONFIG.GOOGLE_CLIENT_ID) return { ok: false, err: 'audience' };
    if (!(+t.exp * 1000 > Date.now()) || !t.sub) return { ok: false, err: 'token' };
    acct = hex(sha256('kirana-acct|' + t.sub)).slice(0, 16);
  }
  if (!acct) return { ok: false, err: 'auth' };
  const exp = Date.now() + CONFIG.SESSION_DAYS * 864e5;
  return { ok: true, session: signTicket(acct, exp), acct: acct, exp: exp };
}
function signTicket(acct, exp) { const body = 'v1.' + acct + '.' + exp; return body + '.' + Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret())); }
function checkTicket(t) {
  if (typeof t !== 'string') return null;
  const m = t.match(/^v1\.([0-9a-f]{16}|dev)\.(\d{10,16})\.([\w\-=]+)$/);
  if (!m || +m[2] < Date.now()) return null;
  return signTicket(m[1], m[2]) === t ? m[1] : null;
}
function secret() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SECRET', s); }
  return s;
}

// ---------- a winner's record: every field rebuilt, nothing taken as it came ----------
function addRecord(b) {
  const acct = checkTicket(b.session);
  if (!acct) return { ok: false, err: 'session' };
  let rec;
  try { rec = cleanRecord(b.rec); } catch (err) { return { ok: false, err: 'record', msg: String(err && err.message || err) }; }
  rec.by = acct; rec.via = 'auto';
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    // a record the developer removed stays out, even when the winner's page sends it again
    if (isRemoved('hof', rec.id)) return { ok: true, removed: true };
    const sh = sheet();
    const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues() : [];
    const key = 'r:' + rec.id;
    if (rows.some(r => r[0] === key)) return { ok: true, dup: true, rank: rankIn(rows, rec.id), total: rows.length };
    const dayAgo = Date.now() - 864e5;
    if (rows.filter(r => r[2] === 'u:' + acct && +r[1] > dayAgo).length >= CONFIG.MAX_PER_DAY) return { ok: false, err: 'limit' };
    const row = [key, Date.now(), 'u:' + acct, rec.score, rec.margin, JSON.stringify(rec)];
    sh.appendRow(row);
    CacheService.getScriptCache().remove('list');
    rows.push(row);
    return { ok: true, rank: rankIn(rows, rec.id), total: rows.length };
  } finally { lock.releaseLock(); }
}
function rankIn(rows, id) {
  const sorted = rows.slice().sort((a, b) => (+b[3]) - (+a[3]) || (+b[4]) - (+a[4]));
  return sorted.findIndex(r => r[0] === 'r:' + id) + 1;
}
const str = (x, n) => (typeof x === 'string' ? x : '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi ? x : 0;
const okImg = (x, n) => typeof x === 'string' && x.length < n && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(x);
function cleanRecord(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('ไม่ใช่บันทึก');
  if (typeof d.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(d.id)) throw new Error('รหัสบันทึกไม่ถูกต้อง');
  if (!Number.isInteger(d.score) || Math.abs(d.score) > 300) throw new Error('คะแนนไม่ถูกต้อง');
  const r = d.research || {}, st = d.style || {};
  const rec = {
    v: 1, id: d.id, at: str(d.at, 10), mode: d.mode === 'online' ? 'online' : 'solo', rules: str(d.rules, 8), n: int(d.n, 3, 4) || 4, seed: int(d.seed, 0, 4294967295),
    leader: str(d.leader, 24) || 'ผู้เล่น', title: str(d.title, 32), traits: (Array.isArray(d.traits) ? d.traits : []).slice(0, 3).map(x => str(x, 24)).filter(Boolean),
    state: str(d.state, 24) || 'รัฐไร้นาม', latin: str(d.latin, 24), meaning: str(d.meaning, 60),
    color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#888888',
    flag: d.flag && okImg(d.flag.img, 9000) ? { img: d.flag.img } : { seed: int(d.flag && d.flag.seed, 0, 4294967295) || 1 },
    score: d.score, legit: int(d.legit, -300, 300), stigma: int(d.stigma, 0, 300), grav: int(d.grav, 0, 9999),
    research: { culture: int(r.culture, 0, 99), innovation: int(r.innovation, 0, 99), building: int(r.building, 0, 99) },
    military: int(d.military, 0, 200), projects: int(d.projects, 0, 60),
    style: { label: str(st.label, 40), desc: str(st.desc, 160), key: str(st.key, 24) },
    margin: int(d.margin, -300, 300),
    opp: (Array.isArray(d.opp) ? d.opp : []).slice(0, 3).map(o => ({ state: str(o && o.state, 24), score: int(o && o.score, -300, 300), ai: !!(o && o.ai) })),
  };
  if (['easy', 'normal', 'hard'].indexOf(d.lvl) >= 0) rec.lvl = d.lvl;
  if (rec.legit - rec.stigma !== rec.score) throw new Error('คะแนนสุทธิไม่ตรงกับความชอบธรรมลบตราบาป');
  if (rec.opp.length !== rec.n - 1) throw new Error('จำนวนคู่แข่งไม่ตรงกับจำนวนรัฐ');
  if (rec.opp.some(o => o.score > rec.score)) throw new Error('ผู้ชนะต้องมีคะแนนไม่น้อยกว่าคู่แข่ง');
  return rec;
}

// ---------- comments: posted by a signed-in player, shown to everyone at once ----------
function addComment(b) {
  const acct = checkTicket(b.session);
  if (!acct) return { ok: false, err: 'session' };
  let c;
  try { c = cleanComment(b.cmt); } catch (err) { return { ok: false, err: 'comment', msg: String(err && err.message || err) }; }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (isRemoved('cmt', c.id)) return { ok: true, removed: true };
    const sh = cmtSheet();
    const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, CHEAD.length).getValues() : [];
    const key = 'c:' + c.id;
    if (rows.some(r => r[0] === key)) return { ok: true, dup: true };
    const dayAgo = Date.now() - 864e5;
    if (rows.filter(r => r[2] === 'u:' + acct && +r[1] > dayAgo).length >= CONFIG.MAX_CMT_PER_DAY) return { ok: false, err: 'limit' };
    // the time comes from the script, so nobody can date a comment ahead to keep it on top; the author tag too,
    // so the star average counts one rating per account. The tag is keyed with the script's secret: nobody can
    // work it out from the account id that the hall of fame records carry, so comments and records stay unlinked
    c.at = new Date(Date.now()).toISOString().slice(0, 23).replace('T', ' ');
    c.by = hex(Utilities.computeHmacSha256Signature('cmt|' + acct, secret())).slice(0, 12);
    sh.appendRow([key, Date.now(), 'u:' + acct, JSON.stringify(c)]);
    CacheService.getScriptCache().remove('clist');
    return { ok: true, at: c.at, by: c.by };
  } finally { lock.releaseLock(); }
}
function cleanComment(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('ไม่ใช่ความคิดเห็น');
  if (typeof d.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(d.id)) throw new Error('รหัสความคิดเห็นไม่ถูกต้อง');
  const text = str(d.text, 280).trim();
  if (!text) throw new Error('ความคิดเห็นว่าง');
  const c = { id: d.id, leader: str(d.leader, 24) || 'ผู้เล่น', title: str(d.title, 32), state: str(d.state, 24), text, at: '', by: '' };
  if (Number.isInteger(d.stars) && d.stars >= 1 && d.stars <= 5) c.stars = d.stars;
  return c;
}
function listComments() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('clist');
  if (hit) return JSON.parse(hit);
  const sh = cmtSheet();
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, CHEAD.length).getValues() : [];
  const list = [];
  for (const r of rows) { try { const c = JSON.parse(r[3]); if (c && c.id) list.push(c); } catch (err) { /* a row edited by hand */ } }
  list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const top = list.slice(0, CONFIG.CMT_LIST);
  const text = JSON.stringify(top);
  if (text.length < 95000) cache.put('clist', text, 60);
  return top;
}

// ---------- the developer removes a record or a comment; every page hides it from then on ----------
function removeEntry(b) {
  const acct = checkTicket(b.session);
  if (!acct) return { ok: false, err: 'session' };
  if (acct !== 'dev') return { ok: false, err: 'forbidden' };
  const kind = b.kind === 'hof' || b.kind === 'cmt' ? b.kind : '';
  if (!kind || typeof b.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(b.id)) return { ok: false, err: 'id' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = kind === 'hof' ? sheet() : cmtSheet();
    const key = (kind === 'hof' ? 'r:' : 'c:') + b.id;
    let deleted = 0;
    const last = sh.getLastRow();
    if (last > 1) {
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = ids.length - 1; i >= 0; i--) if (ids[i][0] === key) { sh.deleteRow(i + 2); deleted++; }
    }
    if (!isRemoved(kind, b.id)) removedSheet().appendRow([kind, b.id, Date.now(), acct]);
    const cache = CacheService.getScriptCache();
    ['list', 'clist', 'rlist'].forEach(k => cache.remove(k));
    return { ok: true, deleted: deleted };
  } finally { lock.releaseLock(); }
}
function removedRows() {
  const sh = removedSheet();
  return sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, RHEAD.length).getValues() : [];
}
function isRemoved(kind, id) { return removedRows().some(r => r[0] === kind && r[1] === id); }
function listRemoved() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('rlist');
  if (hit) return JSON.parse(hit);
  const list = removedRows().slice(-CONFIG.REMOVED_LIST).map(r => ({ k: String(r[0]), id: String(r[1]) }));
  const text = JSON.stringify(list);
  if (text.length < 95000) cache.put('rlist', text, 60);
  return list;
}

// ---------- the list the game reads ----------
function listCached() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('list');
  if (hit) return JSON.parse(hit);
  const sh = sheet();
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues() : [];
  const list = [];
  for (const r of rows) { try { const rec = JSON.parse(r[5]); if (rec && rec.id) list.push(rec); } catch (err) { /* a row edited by hand */ } }
  list.sort((a, b) => b.score - a.score || b.margin - a.margin);
  const top = list.slice(0, CONFIG.LIST_SIZE);
  const text = JSON.stringify(top);
  if (text.length < 95000) cache.put('list', text, 60);
  return top;
}
// ---------- play statistics: visitors per day, games and their move logs, for the developer's eyes only ----------
// Visitors are counts per day and nothing else: a page sends one signal a day, the script adds one to that day's
// visitors (members and guests apart) and writes no list of visits; the browser id only keeps the same browser from
// being counted twice the same day, in the script cache for a few hours. Each game's start, end or quit is a row
// with its settings, its result and its move log (the seed and the human answers, enough to rebuild the whole game);
// a random id names the browser and a member's ticket adds the hashed account id. doGet serves none of this: only a
// ticket of the developer device reads it, through the actions stats and replay
const DSHEET = 'daily';
const DHEAD = ['day', 'visitors', 'members', 'guests', 'dev'];
const GSHEET = 'games';
const GHEAD = ['ts', 'day', 'gid', 'ev', 'vid', 'sid', 'who', 'acct', 'mode', 'rules', 'n', 'humans', 'level', 'round', 'minutes', 'result', 'cards', 'loglen', 'log1', 'log2', 'log3', 'log4'];
const GCOLS = 18;                // the columns read for the summary (everything before the log)
const LOG_COL = 19;              // the first log column
const LOG_CELL = 45000;          // a sheet cell holds up to 50,000 characters
const LOG_MAX = 4 * LOG_CELL;
const idOf = (x, lo, hi) => typeof x === 'string' && x.length >= lo && x.length <= hi && /^[a-z0-9]+$/.test(x) ? x : '';
const word = (x, n) => typeof x === 'string' && /^[0-9A-Za-z._-]{1,16}$/.test(x) ? x.slice(0, n) : '';
const numIn = (x, lo, hi) => typeof x === 'number' && isFinite(x) ? Math.round(Math.min(hi, Math.max(lo, x)) * 10) / 10 : 0;
// days are numbers like 20261110 in the developer's time zone (a text date would turn into a date cell)
const dayNum = t => +new Date(t + CONFIG.UTC_OFFSET * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
function addEvent(b) {
  if (!CONFIG.STATS) return { ok: true, off: true };
  const vid = idOf(b.vid, 8, 24), sid = idOf(b.sid, 6, 24);
  const kind = b.type === 'visit' ? 'v' : b.type === 'game' ? 'g' : '';
  if (!vid || !kind || (kind === 'g' && !sid)) return { ok: false, err: 'event' };
  // the server decides who sent it: a valid ticket makes a member (or the developer), anything else is a guest
  const t = b.session ? checkTicket(b.session) : null;
  const who = t === 'dev' ? 'dev' : t ? 'member' : 'guest', acct = t === 'dev' ? 'dev' : t ? 'u:' + t : '';
  const now = Date.now(), day = dayNum(now);
  if (kind === 'v') return countVisit(vid, who, day);
  let row;
  {
    const ev = ['start', 'end', 'quit'].indexOf(b.ev) >= 0 ? b.ev : '';
    const gid = idOf(b.gid, 6, 32), mode = ['solo', 'online', 'tutorial'].indexOf(b.mode) >= 0 ? b.mode : '';
    if (!ev || !gid || !mode) return { ok: false, err: 'event' };
    const log = ev === 'start' ? '' : cleanLog(b.log);
    row = [now, day, gid, ev, vid, sid, who, acct, mode, word(b.rules, 8), int(b.n, 3, 4) || '', int(b.humans, 0, 4), word(b.level, 8), int(b.round, 0, 30),
      numIn(b.minutes, 0, 1440), ev === 'start' ? '' : JSON.stringify(cleanResult(b.result)), ev === 'start' ? '' : JSON.stringify(cleanCards(b.cards)), log.length];
    // a leading mark keeps a cut of the log from being read as a number or a formula
    for (let i = 0; i < 4; i++) { const part = log.slice(i * LOG_CELL, (i + 1) * LOG_CELL); row.push(part ? '~' + part : ''); }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    // floods stop at a cap per browser and a cap for the whole site, per day (counted in the script cache, roughly)
    const cache = CacheService.getScriptCache();
    const k1 = 'g:' + day + ':' + vid, k2 = 'g:' + day;
    const n1 = +(cache.get(k1) || 0), n2 = +(cache.get(k2) || 0);
    if (n1 >= CONFIG.GAMES_PER_BROWSER || n2 >= CONFIG.GAMES_PER_DAY) return { ok: false, err: 'limit' };
    cache.put(k1, String(n1 + 1), 21600); cache.put(k2, String(n2 + 1), 21600);
    gameSheet().appendRow(row);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
// one more visitor today, counted once per browser: the day's row holds the totals and nothing names a visitor
function countVisit(vid, who, day) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cache = CacheService.getScriptCache(), seen = 'seen:' + day + ':' + vid;
    if (cache.get(seen)) return { ok: true, dup: true };
    const sh = dailySheet(), last = sh.getLastRow();
    let r = 0;
    if (last > 1 && +sh.getRange(last, 1, 1, 1).getValues()[0][0] === day) r = last;
    if (!r) { sh.appendRow([day, 0, 0, 0, 0]); r = sh.getLastRow(); }
    const c = sh.getRange(r, 1, 1, 5).getValues()[0].map(x => +x || 0);
    if (who !== 'dev' && c[1] >= CONFIG.VISITS_PER_DAY) return { ok: false, err: 'limit' };
    cache.put(seen, '1', 21600);
    sh.getRange(r, 1, 1, 5).setValues([[day, c[1] + (who === 'dev' ? 0 : 1), c[2] + (who === 'member' ? 1 : 0), c[3] + (who === 'guest' ? 1 : 0), c[4] + (who === 'dev' ? 1 : 0)]]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function cleanResult(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return {};
  const o = { won: r.won === true, rank: int(r.rank, 1, 4) };
  if (Array.isArray(r.scores)) o.scores = r.scores.slice(0, 4).map(x => {
    x = x && typeof x === 'object' ? x : {};
    return { state: str(x.state, 24), score: Number.isInteger(x.score) && Math.abs(x.score) < 500 ? x.score : 0, human: x.human === true, me: x.me === true, lvl: word(x.lvl, 8) };
  });
  return o;
}
// the cards the states of one game took: research cards (culture, innovation, buildings) and military cards recruited
// from the reform decks, each name with [taken by players, taken by AI]
function cleanCards(c) {
  const o = { r: {}, m: {} };
  if (!c || typeof c !== 'object') return o;
  for (const k of ['r', 'm']) {
    const src = c[k] && typeof c[k] === 'object' && !Array.isArray(c[k]) ? c[k] : {};
    for (const name of Object.keys(src).slice(0, 150)) {
      const v = src[name], n = str(name, 40).trim();
      if (!n || !Array.isArray(v)) continue;
      o[k][n] = [int(v[0], 0, 99), int(v[1], 0, 99)];
    }
  }
  return o;
}
// the move log: {v, cfg, log, takeover}, rebuilt so nothing else rides along; too long or broken leaves it out
function cleanLog(x) {
  if (typeof x !== 'string' || !x || x.length > LOG_MAX) return '';
  let o; try { o = JSON.parse(x); } catch (err) { return ''; }
  if (!o || typeof o !== 'object' || !o.cfg || typeof o.cfg !== 'object' || !Array.isArray(o.log)) return '';
  const s = JSON.stringify({ v: 1, cfg: o.cfg, log: o.log, takeover: o.takeover && typeof o.takeover === 'object' ? o.takeover : {} });
  return s.length <= LOG_MAX ? s : '';
}
function rowsOf(sh, cols) { const last = sh.getLastRow(); return last > 1 ? sh.getRange(2, 1, last - 1, cols).getValues() : []; }
// game rows older than KEEP_DAYS go when the developer opens the statistics (rows are in time order); the daily
// visitor totals name nobody and stay
function trimOld() {
  const cut = dayNum(Date.now() - CONFIG.KEEP_DAYS * 864e5);
  const sh = gameSheet(), last = sh.getLastRow(); if (last < 2) return;
  const days = sh.getRange(2, 2, last - 1, 1).getValues();
  let k = 0; while (k < days.length && +days[k][0] < cut) k++;
  if (k) sh.deleteRows(2, k);
}
function readStats(b) {
  if (checkTicket(b.session) !== 'dev') return { ok: false, err: 'forbidden' };
  const days = int(b.days, 1, 400) || 30;
  trimOld();
  const since = dayNum(Date.now() - (days - 1) * 864e5);
  const Dy = rowsOf(dailySheet(), 5).filter(r => +r[0] >= since);
  const Gm = rowsOf(gameSheet(), GCOLS).filter(r => +r[1] >= since);
  const byDay = {};
  const dayRow = d => byDay[d] || (byDay[d] = { day: d, visitors: 0, members: 0, guests: 0, starts: 0, ends: 0, quits: 0 });
  let devVisits = 0;
  for (const r of Dy) { const d = dayRow(+r[0]); d.visitors += +r[1] || 0; d.members += +r[2] || 0; d.guests += +r[3] || 0; devVisits += +r[4] || 0; }
  const modes = {}, rules = {}, started = {}, ended = {}, quit = {}, finM = {}, finG = {};
  let endMinutes = 0, endN = 0, wins = 0, devGames = 0;
  for (const r of Gm) {
    if (r[6] === 'dev') { devGames++; continue; }
    const ev = r[3], m = modes[r[8]] || (modes[r[8]] = { start: 0, end: 0, quit: 0, won: 0 });
    m[ev] = (m[ev] || 0) + 1;
    const d = dayRow(+r[1]); if (ev === 'start') d.starts++; else if (ev === 'end') d.ends++; else d.quits++;
    if (ev === 'start') started[r[2]] = 1;
    if (ev === 'quit') quit[r[2]] = 1;
    if (ev === 'end') {
      ended[r[2]] = 1; endMinutes += +r[14] || 0; endN++;
      if (r[6] === 'member') finM[r[7]] = 1; else finG[r[4]] = 1;   // who finished: accounts and guest browsers
      const k = String(r[9]); rules[k] = (rules[k] || 0) + 1;
      let res = {}; try { res = JSON.parse(r[15] || '{}'); } catch (err) { /* a row edited by hand */ }
      if (res.won) { wins++; m.won++; }
    }
  }
  const recent = Gm.slice(-150).reverse().map(r => {
    let res = null; try { res = r[15] ? JSON.parse(r[15]) : null; } catch (err) { /* a row edited by hand */ }
    return { ts: +r[0], gid: String(r[2]), ev: r[3], vid: String(r[4]).slice(0, 6), who: r[6], acct: String(r[7]).slice(0, 8), mode: r[8], rules: String(r[9]), n: +r[10] || 0,
      humans: +r[11] || 0, level: String(r[12]), round: +r[13] || 0, minutes: +r[14] || 0, result: res, log: +r[17] > 0 };
  });
  // the cards each patch's finished games used most: one report per game (an online game reported by several players
  // counts once), summed per rule set
  const lastOf = {};
  for (const r of Gm) if (r[6] !== 'dev' && r[3] === 'end') lastOf[r[2]] = r;
  const byRules = {};
  for (const r of Object.keys(lastOf).map(k => lastOf[k])) {
    let c = null; try { c = r[16] ? JSON.parse(r[16]) : null; } catch (err) { /* a row edited by hand */ }
    if (!c) continue;
    const k = String(r[9]), t = byRules[k] || (byRules[k] = { games: 0, r: {}, m: {} });
    t.games++;
    for (const kind of ['r', 'm']) for (const name of Object.keys(c[kind] || {})) {
      const v = c[kind][name], a = t[kind][name] || (t[kind][name] = [0, 0]);
      a[0] += +v[0] || 0; a[1] += +v[1] || 0;
    }
  }
  const topOf = o => Object.keys(o).map(n => [n, o[n][0], o[n][1]]).sort((x, y) => (y[1] + y[2]) - (x[1] + x[2]) || y[1] - x[1]).slice(0, CONFIG.TOP_CARDS);
  const cards = {};
  for (const k of Object.keys(byRules)) cards[k] = { games: byRules[k].games, research: topOf(byRules[k].r), military: topOf(byRules[k].m) };
  const finished = Object.keys(ended).length, begun = Object.keys(started).length;
  const list = Object.keys(byDay).sort().map(k => byDay[k]);
  const counted = list.filter(d => d.visitors > 0), today = byDay[dayNum(Date.now())];
  const top = counted.reduce((a, d) => (!a || d.visitors > a.visitors ? d : a), null);
  const total = counted.reduce((s, d) => s + d.visitors, 0);
  return {
    ok: true, days: days, since: since,
    visitors: { today: today ? today.visitors : 0, avg: counted.length ? Math.round(total / counted.length * 10) / 10 : 0, top: top ? top.visitors : 0, topDay: top ? top.day : 0,
      total: total, members: counted.reduce((s, d) => s + d.members, 0), guests: counted.reduce((s, d) => s + d.guests, 0), daysCounted: counted.length, dev: devVisits },
    games: { started: begun, ended: finished, quit: Object.keys(quit).filter(g => !ended[g]).length, finishRate: begun ? Math.round(Object.keys(started).filter(g => ended[g]).length / begun * 1000) / 1000 : 0,
      avgMinutes: endN ? Math.round(endMinutes / endN * 10) / 10 : 0, wins: wins, ends: endN, modes: modes, rules: rules, dev: devGames,
      finishers: { members: Object.keys(finM).length, guests: Object.keys(finG).length } },
    byDay: list,
    recent: recent,
    cards: cards,
  };
}
function readReplay(b) {
  if (checkTicket(b.session) !== 'dev') return { ok: false, err: 'forbidden' };
  const gid = idOf(b.gid, 6, 32), ts = Number(b.ts) || 0;
  const sh = gameSheet(), last = sh.getLastRow();
  if (!gid || last < 2) return { ok: false, err: 'id' };
  const keys = sh.getRange(2, 1, last - 1, 4).getValues();
  for (let i = keys.length - 1; i >= 0; i--) {
    if (String(keys[i][2]) !== gid || keys[i][3] === 'start' || (ts && +keys[i][0] !== ts)) continue;
    const cells = sh.getRange(i + 2, LOG_COL, 1, 4).getValues()[0];
    const log = cells.map(c => String(c || '').replace(/^~/, '')).join('');
    return log ? { ok: true, log: log } : { ok: false, err: 'nolog' };
  }
  return { ok: false, err: 'id' };
}
function dailySheet() { return sheetNamed(DSHEET, DHEAD); }
function gameSheet() { return sheetNamed(GSHEET, GHEAD); }
function sheetNamed(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}
function sheet() { return sheetNamed(SHEET, HEAD); }
function cmtSheet() { return sheetNamed(CSHEET, CHEAD); }
function removedSheet() { return sheetNamed(RSHEET, RHEAD); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sha256(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8); }
function hex(bytes) { return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join(''); }
