/* สหพันธรัฐแห่งคีรันนา · หอเกียรติยศอัตโนมัติ (Google Apps Script)
 *
 * วางโค้ดนี้ใน Apps Script ของ Google Sheet หนึ่งไฟล์ แล้วเผยแพร่เป็น Web app (Execute as: Me, Who has access: Anyone)
 * ผู้ชนะที่ลงชื่อเข้าใช้ Google (หรือเครื่องผู้พัฒนา) จะถูกบันทึกลงชีต "hof" เองตอนจบเกม หน้าเกมอ่านรายชื่อจากที่นี่
 * ลบแถวในชีตเพื่อเอาบันทึกที่ไม่ต้องการออกได้ทันที
 *
 * สิ่งที่สคริปต์เก็บ: บันทึกเกมแบบเดียวกับไฟล์ data/hall-of-fame.json และแฮชของรหัสบัญชี ไม่เก็บอีเมล
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
};
const SHEET = 'hof';
const HEAD = ['id', 'ts', 'by', 'score', 'margin', 'json'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.list === 'hof') return out(listCached());
  return out({ ok: true, app: 'kirana-federation-hof', v: 1, count: Math.max(0, sheet().getLastRow() - 1) });
}

function doPost(e) {
  let b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ ok: false, err: 'json' }); }
  if (!b || typeof b !== 'object') return out({ ok: false, err: 'json' });
  if (b.action === 'session') return out(session(b));
  if (b.action === 'hof') return out(addRecord(b));
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
function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(HEAD); sh.setFrozenRows(1); }
  return sh;
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sha256(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8); }
function hex(bytes) { return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join(''); }
