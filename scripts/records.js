// รันโดย GitHub Action เมื่อมี issue ใหม่ที่ชื่อขึ้นต้นด้วย [HOF] หรือ [COMMENT]
// อ่าน JSON จากเนื้อ issue ตรวจทุกช่องแบบเข้มงวด แล้วรวมเข้า data/*.json (ไม่รันโค้ดใด ๆ จาก issue)
const fs = require('fs');
const title = process.env.ISSUE_TITLE || '', body = process.env.ISSUE_BODY || '', author = process.env.ISSUE_AUTHOR || '';
const done = msg => { fs.writeFileSync('result.txt', msg); console.log(msg); process.exit(0); };
const m = body.match(/```json\s*([\s\S]*?)```/);
if (!m) done('ไม่พบบล็อก JSON ในข้อความ จึงไม่ได้บันทึก');
let d; try { d = JSON.parse(m[1]); } catch (e) { done('JSON อ่านไม่ได้ จึงไม่ได้บันทึก'); }
if (!d || typeof d !== 'object' || Array.isArray(d)) done('ข้อมูลไม่ใช่รายการเดียว จึงไม่ได้บันทึก');
const str = (x, n) => (typeof x === 'string' ? x : '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi ? x : 0;
const okImg = (x, n) => typeof x === 'string' && x.length < n && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(x);
const read = f => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(j) ? j : []; } catch (e) { return []; } };
const write = (f, list) => fs.writeFileSync(f, JSON.stringify(list, null, 1) + '\n');

if (title.startsWith('[HOF]')) {
  if (typeof d.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(d.id)) done('รหัสบันทึกไม่ถูกต้อง');
  if (!Number.isInteger(d.score) || Math.abs(d.score) > 300) done('คะแนนไม่ถูกต้อง');
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
    by: str(d.by, 16), gh: str(author, 40),
  };
  const file = 'data/hall-of-fame.json';
  const list = read(file);
  if (list.some(x => x.id === rec.id)) done(`บันทึกนี้อยู่ในหอเกียรติยศแล้ว (${rec.state} ${rec.score} คะแนน)`);
  list.push(rec);
  list.sort((a, b) => b.score - a.score || b.margin - a.margin);
  write(file, list.slice(0, 100));
  const rank = list.findIndex(x => x.id === rec.id) + 1;
  done(`บันทึก ${rec.state} ของ ${(rec.title ? rec.title + ' ' : '') + rec.leader} (${rec.score} คะแนน) เข้าหอเกียรติยศแล้ว อันดับ ${rank} หน้าเกมจะเห็นภายในไม่กี่นาที`);
}
if (title.startsWith('[COMMENT]')) {
  const text = str(d.text, 280).trim();
  if (!text || typeof d.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(d.id)) done('ความคิดเห็นว่างหรือรหัสไม่ถูกต้อง');
  const c = { id: d.id, leader: str(d.leader, 24) || 'ผู้เล่น', title: str(d.title, 32), state: str(d.state, 24), text, at: str(d.at, 16), by: str(d.by, 16), gh: str(author, 40) };
  const file = 'data/comments.json';
  const list = read(file);
  if (list.some(x => x.id === c.id)) done('ความคิดเห็นนี้บันทึกไว้แล้ว');
  list.unshift(c);
  write(file, list.slice(0, 300));
  done(`บันทึกความคิดเห็นของ ${(c.title ? c.title + ' ' : '') + c.leader} แล้ว`);
}
done('ชื่อ issue ไม่ได้ขึ้นต้นด้วย [HOF] หรือ [COMMENT]');
