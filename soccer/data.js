// 퓨어데이 FC — 선수·구단·전술 기본 자료.
// v3(2026-10-25): 능력치는 50~120 (대표님 요청). 슈팅·스피드·피지컬·전술지능·체력·헤딩 등 10가지.
// 가상 리그(퓨어 리그)는 시드 난수로 만들고, 실제 리그는 realdata.js 가 트랜스퍼마켓 자료(leagues.json)로 만든다.

export const POS = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"];
export const POS_KO = { GK: "골키퍼", CB: "센터백", LB: "왼쪽 수비", RB: "오른쪽 수비", DM: "수비형 미드", CM: "중앙 미드", AM: "공격형 미드", LW: "왼쪽 윙", RW: "오른쪽 윙", ST: "스트라이커" };
export const AMIN = 50, AMAX = 120;
// 개인 능력치 (키, 이름, 경기에서 쓰이는 곳)
export const ATTRS = [
  ["pac", "스피드", "달리기 최고 속도"], ["sho", "슈팅", "슛 정확도·세기"], ["pas", "패스", "패스 정확도"], ["dri", "드리블", "공 지키기·첫 터치"],
  ["def", "수비", "태클·가로채기"], ["phy", "피지컬", "몸싸움(몸태클)"], ["hea", "헤딩", "공중볼 다툼·헤딩슛"], ["iq", "전술지능", "자리 잡기·판단"],
  ["sta", "체력", "후반 지치는 정도"], ["gk", "골키퍼", "선방"],
];
export const AKEYS = ATTRS.map((a) => a[0]);
const W = { // 포지션별 능력 가중치 → 종합(OVR, 50~120)
  GK: { gk: 0.8, iq: 0.1, phy: 0.05, pas: 0.05 },
  CB: { def: 0.4, phy: 0.2, hea: 0.15, iq: 0.1, pac: 0.1, pas: 0.05 },
  LB: { def: 0.3, pac: 0.25, sta: 0.15, pas: 0.15, iq: 0.1, dri: 0.05 }, RB: { def: 0.3, pac: 0.25, sta: 0.15, pas: 0.15, iq: 0.1, dri: 0.05 },
  DM: { def: 0.3, pas: 0.25, iq: 0.2, phy: 0.1, sta: 0.15 },
  CM: { pas: 0.3, iq: 0.2, dri: 0.15, sta: 0.15, sho: 0.1, def: 0.1 },
  AM: { pas: 0.3, dri: 0.25, sho: 0.2, iq: 0.15, pac: 0.1 },
  LW: { pac: 0.3, dri: 0.3, sho: 0.15, pas: 0.15, sta: 0.1 }, RW: { pac: 0.3, dri: 0.3, sho: 0.15, pas: 0.15, sta: 0.1 },
  ST: { sho: 0.4, pac: 0.15, hea: 0.15, dri: 0.1, phy: 0.1, iq: 0.1 },
};
export function ovr(p, pos = p.pos) { const w = W[pos] || W.CM; let s = 0; for (const k in w) s += (p[k] || 60) * w[k]; return Math.round(s); }
const NEAR = { GK: [], CB: ["DM"], LB: ["RB", "LW", "CB"], RB: ["LB", "RW", "CB"], DM: ["CB", "CM"], CM: ["DM", "AM"], AM: ["CM", "ST", "LW", "RW"], LW: ["RW", "AM", "LB"], RW: ["LW", "AM", "RB"], ST: ["AM", "LW", "RW"] };
export function fitOvr(p, slotPos) { if (p.pos === slotPos) return ovr(p); if (slotPos === "GK" || p.pos === "GK") return Math.round(AMIN + (ovr(p, slotPos) - AMIN) * 0.5); return Math.round(ovr(p, slotPos) * (NEAR[p.pos].includes(slotPos) ? 0.97 : 0.9)); }
export const clampA = (v) => Math.max(AMIN, Math.min(AMAX, Math.round(v)));
// 50~120 ↔ 경기 엔진 기준(20~97) 바꾸기
export const toOld = (v) => 20 + (v - AMIN) * (77 / (AMAX - AMIN));
export const fromOld = (v) => AMIN + (v - 20) * ((AMAX - AMIN) / 77);

// 시장 가치(유로): 실제 자료면 그 값(p.value), 아니면 종합·나이·잠재력 공식
export function ageMult(a) { return a <= 20 ? 1.5 : a <= 23 ? 1.3 : a <= 27 ? 1.1 : a <= 29 ? 1 : a <= 31 ? 0.7 : a <= 33 ? 0.45 : 0.25; }
export function formulaValue(p) {
  const o = toOld(ovr(p)); let v = 0.45e6 * Math.exp(0.135 * (o - 55)) * ageMult(p.age);
  v *= 1 + Math.max(0, toOld(p.pot || ovr(p)) - o) * 0.02;
  return Math.max(25e3, Math.round(v / 25e3) * 25e3);
}
export function marketValue(p) { return p.value != null ? p.value : formulaValue(p); }
export const wageOf = (p) => Math.max(1000, Math.round(marketValue(p) * 0.003 / 250) * 250);   // 주급(유로)
export const money = (v) => (Math.abs(v) >= 1e9 ? `€${(v / 1e9).toFixed(2)}bn` : Math.abs(v) >= 1e6 ? `€${(v / 1e6).toFixed(Math.abs(v) >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M` : `€${Math.round(v / 1e3)}K`);
export const FLAG = { KR: "🇰🇷", EN: "🏴", ES: "🇪🇸", BR: "🇧🇷", FR: "🇫🇷", DE: "🇩🇪", IT: "🇮🇹", NL: "🇳🇱", NG: "🇳🇬", GH: "🇬🇭", JP: "🇯🇵", AR: "🇦🇷", PT: "🇵🇹", US: "🇺🇸", PE: "🇵🇪", MX: "🇲🇽" };

// ---------------------------------------------------------------- 시드 난수
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 이름(가상)
const NAMES = {
  KR: [["민준", "서준", "도윤", "하준", "지호", "준우", "현우", "지훈", "승민", "태윤", "건우", "시우"], ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오"]],
  EN: [["Jack", "Oliver", "Harry", "George", "Leo", "Alfie", "Charlie", "Theo", "Oscar", "Archie"], ["Walker", "Hughes", "Turner", "Carter", "Bennett", "Fletcher", "Morris", "Ward", "Cooper", "Hayes"]],
  ES: [["Pablo", "Álvaro", "Hugo", "Mario", "Diego", "Adrián", "Iker", "Marco", "Raúl", "Sergio"], ["Navarro", "Romero", "Vidal", "Moreno", "Castillo", "Ortega", "Molina", "Serrano", "Rubio", "Blanco"]],
  BR: [["Gabriel", "Lucas", "Mateus", "Rafael", "Thiago", "Bruno", "Caio", "Davi", "Igor", "Renan"], ["Souza", "Lima", "Costa", "Rocha", "Alves", "Barbosa", "Ribeiro", "Teixeira", "Moura", "Freitas"]],
  FR: [["Hugo", "Louis", "Nathan", "Enzo", "Théo", "Mathis", "Noah", "Ethan", "Clément", "Yanis"], ["Martin", "Bernard", "Lefèvre", "Girard", "Moreau", "Laurent", "Fournier", "Mercier", "Dupont", "Roux"]],
  DE: [["Lukas", "Finn", "Jonas", "Leon", "Felix", "Paul", "Elias", "Moritz", "Niklas", "Tim"], ["Müller", "Schmidt", "Fischer", "Weber", "Wagner", "Becker", "Hoffmann", "Koch", "Richter", "Klein"]],
  IT: [["Lorenzo", "Matteo", "Andrea", "Riccardo", "Tommaso", "Davide", "Federico", "Luca", "Simone", "Marco"], ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Greco", "Bruno"]],
  NL: [["Daan", "Sem", "Lars", "Bram", "Jesse", "Thijs", "Ruben", "Stijn", "Milan", "Luuk"], ["de Jong", "Bakker", "Visser", "Smit", "Meijer", "de Boer", "Mulder", "Bos", "Vos", "Peters"]],
  NG: [["Chidi", "Emeka", "Tunde", "Ayo", "Femi", "Ike", "Kelechi", "Obi", "Samuel", "Victor"], ["Okafor", "Adeyemi", "Balogun", "Eze", "Nwosu", "Ogunleye", "Okoro", "Uche", "Bello", "Afolabi"]],
  GH: [["Kwabena", "Kofi", "Yaw", "Kojo", "Ebo", "Nana", "Kweku", "Fiifi", "Atta", "Paa"], ["Mensah", "Boateng", "Owusu", "Asante", "Darko", "Appiah", "Ofori", "Agyeman", "Frimpong", "Amoah"]],
  JP: [["Haruto", "Sota", "Yuto", "Riku", "Kaito", "Ren", "Hinata", "Daiki", "Takumi", "Shun"], ["Sato", "Suzuki", "Takahashi", "Tanaka", "Ito", "Watanabe", "Yamamoto", "Nakamura", "Kobayashi", "Kato"]],
  AR: [["Santiago", "Mateo", "Benjamín", "Joaquín", "Tomás", "Facundo", "Lautaro", "Nicolás", "Agustín", "Bautista"], ["Fernández", "Gómez", "Díaz", "Pereyra", "Sosa", "Acosta", "Medina", "Herrera", "Suárez", "Aguirre"]],
  PT: [["João", "Tiago", "Rodrigo", "Duarte", "Gonçalo", "Afonso", "Rúben", "Diogo", "Miguel", "Nuno"], ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Carvalho", "Gomes", "Martins", "Lopes", "Marques"]],
};
const NATS = Object.keys(NAMES);
function makeName(r, nat) { const [f, l] = NAMES[nat]; const a = f[Math.floor(r() * f.length)], b = l[Math.floor(r() * l.length)]; return nat === "KR" ? b + a : nat === "JP" ? `${b} ${a}` : `${a} ${b}`; }

// 포지션별 능력 모양(1 = 그 자리의 핵심 능력)
const SHAPE = {
  GK: { gk: 1, phy: 0.6, pas: 0.5, pac: 0.4, sho: 0.15, dri: 0.3, def: 0.3, hea: 0.4, iq: 0.75, sta: 0.5 },
  CB: { def: 1, phy: 0.95, pac: 0.65, pas: 0.6, dri: 0.45, sho: 0.35, hea: 0.95, iq: 0.8, sta: 0.7, gk: 0.1 },
  LB: { def: 0.85, pac: 0.95, pas: 0.75, phy: 0.75, dri: 0.7, sho: 0.45, hea: 0.55, iq: 0.7, sta: 0.95, gk: 0.1 }, RB: { def: 0.85, pac: 0.95, pas: 0.75, phy: 0.75, dri: 0.7, sho: 0.45, hea: 0.55, iq: 0.7, sta: 0.95, gk: 0.1 },
  DM: { def: 0.92, pas: 0.85, phy: 0.88, dri: 0.7, pac: 0.7, sho: 0.55, hea: 0.75, iq: 0.92, sta: 0.92, gk: 0.1 },
  CM: { pas: 1, dri: 0.85, def: 0.72, phy: 0.75, sho: 0.72, pac: 0.75, hea: 0.6, iq: 0.95, sta: 0.95, gk: 0.1 },
  AM: { pas: 0.95, dri: 0.98, sho: 0.88, pac: 0.8, phy: 0.6, def: 0.45, hea: 0.55, iq: 0.92, sta: 0.8, gk: 0.1 },
  LW: { pac: 1, dri: 0.98, sho: 0.82, pas: 0.8, phy: 0.6, def: 0.4, hea: 0.5, iq: 0.75, sta: 0.88, gk: 0.1 }, RW: { pac: 1, dri: 0.98, sho: 0.82, pas: 0.8, phy: 0.6, def: 0.4, hea: 0.5, iq: 0.75, sta: 0.88, gk: 0.1 },
  ST: { sho: 1, pac: 0.9, dri: 0.85, phy: 0.85, pas: 0.68, def: 0.35, hea: 0.9, iq: 0.8, sta: 0.8, gk: 0.1 },
};
let NEXT_ID = 1;
export const setNextId = (n) => (NEXT_ID = n);
export const getNextId = () => NEXT_ID;
// target = 종합(50~120). extra.height(m) 가 있으면 헤딩·스피드에 반영, 나이는 전술지능·체력에
export function makePlayer(r, pos, target, extra = {}) {
  const nat = extra.nat || NATS[Math.floor(r() * NATS.length)];
  const age = extra.age || Math.round(18 + r() * 15);
  const p = { id: extra.id || "p" + NEXT_ID++, name: extra.name || makeName(r, nat), nat, age, pos };
  const sh = SHAPE[pos] || SHAPE.CM, t = toOld(target);
  for (const k of AKEYS) p[k] = t * (0.62 + 0.42 * (sh[k] ?? 0.5)) + (r() - 0.5) * 10;
  if (extra.height) { const d = (extra.height - 1.82) * 100; p.hea += d * 0.6; p.pac -= d * 0.25; p.phy += d * 0.3; }
  p.iq += (age - 25) * 0.6; p.sta -= Math.max(0, age - 30) * 1.2; p.pac -= Math.max(0, age - 30) * 1.0;
  for (const k of AKEYS) p[k] = clampA(fromOld(Math.max(20, Math.min(99, p[k]))));
  const d = target - ovr(p); for (const k in W[pos]) p[k] = clampA(p[k] + d);   // 종합을 목표에 맞춤
  p.pot = clampA(ovr(p) + Math.max(0, Math.round((24 - age) * (1.4 + r() * 1.8))));
  p.contract = extra.contract ?? 1 + Math.floor(r() * 4);
  Object.assign(p, extra.keep || {});
  return p;
}

// ---------------------------------------------------------------- 가상 리그(퓨어 리그)
export const CLUB_DEFS = [
  { id: "light", name: "빛 진영 FC", short: "LIG", c1: "#f4f1e6", c2: "#1f9a6a", tier: 92, rep: 82 },
  { id: "dragon", name: "드래곤 FC", short: "DRG", c1: "#b3202c", c2: "#1a1a1a", tier: 91, rep: 80 },
  { id: "north", name: "노던 스타즈", short: "NOR", c1: "#1d3f8f", c2: "#ffffff", tier: 89, rep: 76 },
  { id: "sunset", name: "선셋 시티", short: "SUN", c1: "#f08a24", c2: "#2b1b4a", tier: 87, rep: 72 },
  { id: "ocean", name: "블루오션 FC", short: "OCE", c1: "#38a3e8", c2: "#0b2a4a", tier: 85, rep: 68 },
  { id: "green", name: "그린밸리 유나이티드", short: "GVU", c1: "#2f8f3a", c2: "#f5e08a", tier: 83, rep: 64 },
  { id: "castle", name: "레드캐슬 FC", short: "RCF", c1: "#8f1d3a", c2: "#f3c242", tier: 82, rep: 62 },
  { id: "river", name: "실버리버 로버스", short: "SRR", c1: "#9aa3ad", c2: "#22313f", tier: 80, rep: 58 },
  { id: "eagle", name: "골든이글스", short: "GEA", c1: "#e8c23a", c2: "#202020", tier: 78, rep: 55 },
];
export const SQUAD = ["GK", "GK", "CB", "CB", "CB", "CB", "LB", "RB", "LB", "RB", "DM", "DM", "CM", "CM", "CM", "AM", "LW", "RW", "LW", "RW", "ST", "ST", "ST"];
// 퓨어데이 인물 — 얼굴 그림이 있는 특별 선수(가상 리그에선 빛 진영 FC·드래곤 FC, 실제 리그에선 FA)
export const PUREDAY = [
  { club: "light", pos: "ST", t: 100, name: "조아름", nat: "KR", age: 22, face: "areum", keep: { sho: 106, pac: 104 } },
  { club: "light", pos: "AM", t: 96, name: "조하임", nat: "KR", age: 20, face: "heim", keep: { pas: 104, iq: 108 } },
  { club: "light", pos: "GK", t: 98, name: "김미아", nat: "US", age: 27, face: "mia" },
  { club: "light", pos: "RW", t: 97, name: "마이클 하트", nat: "US", age: 26, face: "michael", keep: { pac: 114, sta: 108 } },
  { club: "light", pos: "LW", t: 97, name: "디에고 라미레스", nat: "PE", age: 25, face: "diego" },
  { club: "light", pos: "CM", t: 96, name: "콰메 아산테", nat: "GH", age: 27, face: "kwame", keep: { phy: 110 } },
  { club: "dragon", pos: "GK", t: 97, name: "대왕용", nat: "-", age: 33, face: "d_dragon" },
  { club: "dragon", pos: "ST", t: 98, name: "라합", nat: "-", age: 29, face: "d_rahab", keep: { hea: 110 } },
  { club: "dragon", pos: "AM", t: 96, name: "아포피스", nat: "-", age: 28, face: "d_apophis", keep: { iq: 110 } },
  { club: "dragon", pos: "RW", t: 95, name: "늑대개 우두머리", nat: "-", age: 24, face: "d_wolf", keep: { pac: 116 } },
  { club: "dragon", pos: "CB", t: 96, name: "용암 짐승", nat: "-", age: 30, face: "d_lava", keep: { phy: 116, hea: 108 } },
  { club: "dragon", pos: "LW", t: 95, name: "비룡대 대장", nat: "-", age: 26, face: "d_wyvern" },
];
export function makeWorld(seed = 20261025) {
  const r = rng(seed); NEXT_ID = 1;
  const clubs = CLUB_DEFS.map((c) => ({ ...c, league: "pure", budget: Math.round((15 + c.rep * 0.6) * 1e6) }));
  const players = [];
  for (const c of clubs) {
    const special = PUREDAY.filter((s) => s.club === c.id), need = SQUAD.slice();
    for (const s of special) { const i = need.indexOf(s.pos); if (i >= 0) need.splice(i, 1); const p = makePlayer(r, s.pos, s.t, { name: s.name, nat: s.nat, age: s.age, keep: { ...(s.keep || {}), face: s.face }, contract: 4 }); p.club = c.id; players.push(p); }
    need.forEach((pos, i) => { const t = Math.round(c.tier - 7 + r() * 14 - (i > 14 ? 5 : 0)); const p = makePlayer(r, pos, t); p.club = c.id; players.push(p); });
  }
  for (let i = 0; i < 40; i++) { const pos = POS[Math.floor(r() * POS.length)]; const p = makePlayer(r, pos, Math.round(70 + r() * 20), { age: Math.round(20 + r() * 14), contract: 0 }); p.club = null; players.push(p); }
  return { clubs, players, nextId: NEXT_ID, leagues: [{ id: "pure", name: "퓨어 리그", country: "PURE", tier: 1, clubs: clubs.map((c) => c.id) }] };
}
// 새 팀(뉴팀) 처음 선수단 — 그 리그 수준보다 조금 낮게
export function makeStarterSquad(seed, nextId, level = 72) {
  const r = rng(seed); NEXT_ID = nextId; const out = [];
  // 20명, 자리마다 고르게(스트라이커 포함)
  ["GK", "GK", "CB", "CB", "CB", "CB", "LB", "RB", "DM", "DM", "CM", "CM", "CM", "AM", "LW", "LW", "RW", "RW", "ST", "ST"].forEach((pos) => { out.push(makePlayer(r, pos, Math.round(level - 4 + r() * 8), { age: Math.round(18 + r() * 12), contract: 2 })); });
  return { players: out, nextId: NEXT_ID };
}

// ---------------------------------------------------------------- 전술
// 자리: [포지션, ax(0=팀 왼쪽,1=오른쪽), ay(0=우리 골,1=상대 골)]
export const FORMATIONS = {
  "4-4-2": [["GK", .5, .03], ["LB", .12, .22], ["CB", .37, .18], ["CB", .63, .18], ["RB", .88, .22], ["LW", .12, .45], ["CM", .38, .40], ["CM", .62, .40], ["RW", .88, .45], ["ST", .38, .64], ["ST", .62, .64]],
  "4-3-3": [["GK", .5, .03], ["LB", .12, .22], ["CB", .37, .18], ["CB", .63, .18], ["RB", .88, .22], ["CM", .3, .40], ["DM", .5, .33], ["CM", .7, .40], ["LW", .15, .6], ["ST", .5, .66], ["RW", .85, .6]],
  "4-5-1": [["GK", .5, .03], ["LB", .12, .22], ["CB", .37, .18], ["CB", .63, .18], ["RB", .88, .22], ["LW", .1, .44], ["CM", .32, .40], ["DM", .5, .34], ["CM", .68, .40], ["RW", .9, .44], ["ST", .5, .64]],
  "4-2-3-1": [["GK", .5, .03], ["LB", .12, .22], ["CB", .37, .18], ["CB", .63, .18], ["RB", .88, .22], ["DM", .38, .34], ["DM", .62, .34], ["LW", .15, .52], ["AM", .5, .52], ["RW", .85, .52], ["ST", .5, .67]],
  "4-1-4-1": [["GK", .5, .03], ["LB", .12, .22], ["CB", .37, .18], ["CB", .63, .18], ["RB", .88, .22], ["DM", .5, .31], ["LW", .12, .46], ["CM", .37, .43], ["CM", .63, .43], ["RW", .88, .46], ["ST", .5, .65]],
  "4-4-1-1": [["GK", .5, .03], ["LB", .12, .22], ["CB", .37, .18], ["CB", .63, .18], ["RB", .88, .22], ["LW", .12, .44], ["CM", .38, .40], ["CM", .62, .40], ["RW", .88, .44], ["AM", .5, .55], ["ST", .5, .67]],
  "4-1-2-1-2": [["GK", .5, .03], ["LB", .12, .22], ["CB", .37, .18], ["CB", .63, .18], ["RB", .88, .22], ["DM", .5, .31], ["CM", .3, .41], ["CM", .7, .41], ["AM", .5, .52], ["ST", .38, .65], ["ST", .62, .65]],
  "3-5-2": [["GK", .5, .03], ["CB", .28, .18], ["CB", .5, .16], ["CB", .72, .18], ["LW", .08, .42], ["CM", .33, .40], ["DM", .5, .33], ["CM", .67, .40], ["RW", .92, .42], ["ST", .38, .65], ["ST", .62, .65]],
  "3-4-3": [["GK", .5, .03], ["CB", .28, .18], ["CB", .5, .16], ["CB", .72, .18], ["LW", .1, .42], ["CM", .38, .38], ["CM", .62, .38], ["RW", .9, .42], ["LW", .2, .62], ["ST", .5, .67], ["RW", .8, .62]],
  "3-4-2-1": [["GK", .5, .03], ["CB", .28, .18], ["CB", .5, .16], ["CB", .72, .18], ["LW", .1, .42], ["CM", .38, .38], ["CM", .62, .38], ["RW", .9, .42], ["AM", .35, .56], ["AM", .65, .56], ["ST", .5, .67]],
  "5-3-2": [["GK", .5, .03], ["LB", .08, .26], ["CB", .28, .18], ["CB", .5, .16], ["CB", .72, .18], ["RB", .92, .26], ["CM", .3, .4], ["CM", .5, .37], ["CM", .7, .4], ["ST", .38, .63], ["ST", .62, .63]],
  "5-4-1": [["GK", .5, .03], ["LB", .08, .25], ["CB", .28, .17], ["CB", .5, .15], ["CB", .72, .17], ["RB", .92, .25], ["LW", .14, .43], ["CM", .38, .39], ["CM", .62, .39], ["RW", .86, .43], ["ST", .5, .62]],
};
// 팀 지시(0~100, 50 = 보통)
export const TACTIC_ITEMS = [
  ["mentality", "공격 성향", "수비적", "공격적"], ["press", "압박 강도", "물러서기", "전방 압박"], ["line", "수비 라인", "깊게", "높게"],
  ["width", "공격 폭", "좁게", "넓게"], ["passing", "패스 길이", "짧은 패스", "롱볼"], ["tempo", "템포", "느리게", "빠르게"],
];
export const DEFAULT_TACTIC = { formation: "4-3-3", mentality: 50, press: 50, line: 50, width: 50, passing: 50, tempo: 50, slots: null, preset: "balanced" };
export const PRESETS = {
  balanced: { name: "균형", v: { mentality: 50, press: 50, line: 50, width: 50, passing: 50, tempo: 50 } },
  tiki: { name: "점유율(티키타카)", v: { mentality: 60, press: 60, line: 65, width: 55, passing: 10, tempo: 30 } },
  gegen: { name: "게겐프레싱", v: { mentality: 75, press: 95, line: 80, width: 55, passing: 40, tempo: 85 } },
  counter: { name: "역습", v: { mentality: 35, press: 30, line: 25, width: 60, passing: 75, tempo: 90 } },
  longball: { name: "롱볼", v: { mentality: 55, press: 45, line: 45, width: 70, passing: 95, tempo: 70 } },
  park: { name: "밀집 수비", v: { mentality: 10, press: 20, line: 10, width: 25, passing: 60, tempo: 35 } },
  wing: { name: "측면 공격", v: { mentality: 65, press: 55, line: 55, width: 95, passing: 60, tempo: 65 } },
};
// 옛 저장(0·1·2) → 0~100
export function migrateTactic(t) {
  const o = { ...DEFAULT_TACTIC, ...t };
  for (const [k] of TACTIC_ITEMS) if (o[k] != null && o[k] <= 2 && Number.isInteger(o[k]) && (t.v3 !== true)) o[k] = o[k] * 50;
  o.v3 = true; if (!FORMATIONS[o.formation] && !o.slots) o.formation = "4-3-3";
  return o;
}
export const slotsOf = (t) => (t.slots && t.slots.length === 11 ? t.slots : FORMATIONS[t.formation] || FORMATIONS["4-3-3"]);
// 경기 엔진이 쓰는 값: -1~1
export function tacN(t) { const n = (k) => ((t[k] ?? 50) - 50) / 50; return { ment: n("mentality"), press: n("press"), line: n("line"), width: n("width"), pass: n("passing"), tempo: n("tempo") }; }

export function autoLineup(squad, tactic) {
  const slots = typeof tactic === "string" ? FORMATIONS[tactic] : slotsOf(tactic), used = new Set(), xi = new Array(11).fill(null);
  const order = slots.map((s, i) => i).sort((a, b) => (slots[a][0] === "GK" ? -1 : slots[b][0] === "GK" ? 1 : 0));
  for (const i of order) { let best = null, bv = -1; for (const p of squad) { if (used.has(p.id) || p.injured) continue; const v = fitOvr(p, slots[i][0]); if (v > bv) { bv = v; best = p; } } if (best) { xi[i] = best.id; used.add(best.id); } }
  const bench = squad.filter((p) => !used.has(p.id)).sort((a, b) => ovr(b) - ovr(a)).slice(0, 9).map((p) => p.id);
  return { xi, bench };
}
export function teamRating(squad, lineup, tactic) {
  const slots = typeof tactic === "string" ? FORMATIONS[tactic] : slotsOf(tactic);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const all = lineup.xi.map((id, i) => { const p = byId.get(id); return p ? fitOvr(p, slots[i][0]) : AMIN; });
  return { ovr: Math.round(all.reduce((s, v) => s + v, 0) / 11) };
}
// 경기 엔진용 선수 복사본: 능력치를 20~97 기준으로
export function toEngine(p) { const d = { ...p }; for (const k of AKEYS) d[k] = toOld(p[k] ?? 70); return d; }
