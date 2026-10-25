// 퓨어데이 FC — 선수·구단 데이터 (가상 리그). 시드 난수로 언제나 같은 리그가 만들어진다.
// 선수 형식(바꿔 끼울 수 있게 단순하게): {id,name,nat,age,pos,pac,sho,pas,dri,def,phy,gk,pot,club,contract,face?}
// 실제 선수·트랜스퍼마켓 자료를 쓰려면 makeWorld() 대신 같은 형식의 배열을 넣으면 된다(기획.md 참고).

export const POS = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"];
export const POS_KO = { GK: "골키퍼", CB: "센터백", LB: "왼쪽 수비", RB: "오른쪽 수비", DM: "수비형 미드", CM: "중앙 미드", AM: "공격형 미드", LW: "왼쪽 윙", RW: "오른쪽 윙", ST: "스트라이커" };
const W = { // 포지션별 능력 가중치 → 종합(OVR)
  GK: { gk: 0.85, phy: 0.1, pas: 0.05 },
  CB: { def: 0.5, phy: 0.25, pac: 0.1, pas: 0.1, dri: 0.05 },
  LB: { def: 0.35, pac: 0.3, pas: 0.2, phy: 0.1, dri: 0.05 }, RB: { def: 0.35, pac: 0.3, pas: 0.2, phy: 0.1, dri: 0.05 },
  DM: { def: 0.4, pas: 0.3, phy: 0.2, dri: 0.1 },
  CM: { pas: 0.4, dri: 0.2, def: 0.15, phy: 0.1, sho: 0.15 },
  AM: { pas: 0.35, dri: 0.3, sho: 0.25, pac: 0.1 },
  LW: { pac: 0.35, dri: 0.35, sho: 0.15, pas: 0.15 }, RW: { pac: 0.35, dri: 0.35, sho: 0.15, pas: 0.15 },
  ST: { sho: 0.5, pac: 0.2, dri: 0.15, phy: 0.15 },
};
export function ovr(p, pos = p.pos) { const w = W[pos]; let s = 0; for (const k in w) s += (p[k] || 40) * w[k]; return Math.round(s); }
// 비슷한 자리면 덜 깎인다
const NEAR = { GK: [], CB: ["DM"], LB: ["RB", "LW", "CB"], RB: ["LB", "RW", "CB"], DM: ["CB", "CM"], CM: ["DM", "AM"], AM: ["CM", "ST", "LW", "RW"], LW: ["RW", "AM", "LB"], RW: ["LW", "AM", "RB"], ST: ["AM", "LW", "RW"] };
export function fitOvr(p, slotPos) { if (p.pos === slotPos) return ovr(p); if (slotPos === "GK" || p.pos === "GK") return Math.round(ovr(p, slotPos) * 0.6); return Math.round(ovr(p, slotPos) * (NEAR[p.pos].includes(slotPos) ? 0.97 : 0.88)); }

// 시장 가치(유로) — 종합·나이·잠재력으로. 트랜스퍼마켓처럼 '€12.5M' 로 보여 준다
export function marketValue(p) {
  const o = ovr(p); let v = 0.45e6 * Math.exp(0.135 * (o - 55));
  const a = p.age; v *= a <= 20 ? 1.5 : a <= 23 ? 1.3 : a <= 27 ? 1.1 : a <= 29 ? 1 : a <= 31 ? 0.7 : a <= 33 ? 0.45 : 0.25;
  v *= 1 + Math.max(0, (p.pot || o) - o) * 0.02;
  return Math.max(25e3, Math.round(v / 25e3) * 25e3);
}
export const wageOf = (p) => Math.max(3e3, Math.round(marketValue(p) * 0.003 / 500) * 500);   // 주급(유로)
export const money = (v) => (Math.abs(v) >= 1e6 ? `€${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M` : `€${Math.round(v / 1e3)}K`);
export const FLAG = { KR: "🇰🇷", EN: "🏴", ES: "🇪🇸", BR: "🇧🇷", FR: "🇫🇷", DE: "🇩🇪", IT: "🇮🇹", NL: "🇳🇱", NG: "🇳🇬", GH: "🇬🇭", JP: "🇯🇵", AR: "🇦🇷", PT: "🇵🇹", US: "🇺🇸", PE: "🇵🇪", MX: "🇲🇽" };

// ---------------------------------------------------------------- 시드 난수
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 이름(가상) — 나라별 이름 조각을 섞는다. 실제 선수와 겹치지 않게 흔한 조각만 쓴다
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

// 포지션별 능력 모양
const SHAPE = {
  GK: { gk: 1, phy: 0.6, pas: 0.5, pac: 0.4, sho: 0.15, dri: 0.3, def: 0.3 },
  CB: { def: 1, phy: 0.95, pac: 0.65, pas: 0.6, dri: 0.45, sho: 0.35, gk: 0.1 },
  LB: { def: 0.85, pac: 0.95, pas: 0.75, phy: 0.75, dri: 0.7, sho: 0.45, gk: 0.1 }, RB: { def: 0.85, pac: 0.95, pas: 0.75, phy: 0.75, dri: 0.7, sho: 0.45, gk: 0.1 },
  DM: { def: 0.92, pas: 0.85, phy: 0.88, dri: 0.7, pac: 0.7, sho: 0.55, gk: 0.1 },
  CM: { pas: 1, dri: 0.85, def: 0.72, phy: 0.75, sho: 0.72, pac: 0.75, gk: 0.1 },
  AM: { pas: 0.95, dri: 0.98, sho: 0.88, pac: 0.8, phy: 0.6, def: 0.45, gk: 0.1 },
  LW: { pac: 1, dri: 0.98, sho: 0.82, pas: 0.8, phy: 0.6, def: 0.4, gk: 0.1 }, RW: { pac: 1, dri: 0.98, sho: 0.82, pas: 0.8, phy: 0.6, def: 0.4, gk: 0.1 },
  ST: { sho: 1, pac: 0.9, dri: 0.85, phy: 0.85, pas: 0.68, def: 0.35, gk: 0.1 },
};
let NEXT_ID = 1;
export function makePlayer(r, pos, target, extra = {}) {
  const nat = extra.nat || NATS[Math.floor(r() * NATS.length)];
  const age = extra.age || Math.round(18 + r() * 15);
  const p = { id: extra.id || "p" + NEXT_ID++, name: extra.name || makeName(r, nat), nat, age, pos };
  // 목표 종합에 맞춰 능력을 만들고 한 번 보정
  const sh = SHAPE[pos];
  for (const k of ["pac", "sho", "pas", "dri", "def", "phy", "gk"]) p[k] = Math.round(Math.min(97, Math.max(20, target * (0.62 + 0.42 * sh[k]) + (r() - 0.5) * 10)));
  const d = target - ovr(p); for (const k in W[pos]) p[k] = Math.min(97, Math.max(20, p[k] + d));
  p.pot = Math.min(95, ovr(p) + Math.max(0, Math.round((24 - age) * (1.2 + r() * 1.6))));
  p.contract = extra.contract || 1 + Math.floor(r() * 4);   // 남은 시즌 수
  Object.assign(p, extra.keep || {});
  return p;
}

// ---------------------------------------------------------------- 구단 (가상)
export const CLUB_DEFS = [
  { id: "light", name: "빛 진영 FC", short: "LIG", c1: "#f4f1e6", c2: "#1f9a6a", tier: 74, rep: 82 },
  { id: "dragon", name: "드래곤 FC", short: "DRG", c1: "#b3202c", c2: "#1a1a1a", tier: 73, rep: 80 },
  { id: "north", name: "노던 스타즈", short: "NOR", c1: "#1d3f8f", c2: "#ffffff", tier: 72, rep: 76 },
  { id: "sunset", name: "선셋 시티", short: "SUN", c1: "#f08a24", c2: "#2b1b4a", tier: 70, rep: 72 },
  { id: "ocean", name: "블루오션 FC", short: "OCE", c1: "#38a3e8", c2: "#0b2a4a", tier: 68, rep: 68 },
  { id: "green", name: "그린밸리 유나이티드", short: "GVU", c1: "#2f8f3a", c2: "#f5e08a", tier: 66, rep: 64 },
  { id: "castle", name: "레드캐슬 FC", short: "RCF", c1: "#8f1d3a", c2: "#f3c242", tier: 65, rep: 62 },
  { id: "river", name: "실버리버 로버스", short: "SRR", c1: "#9aa3ad", c2: "#22313f", tier: 63, rep: 58 },
  { id: "eagle", name: "골든이글스", short: "GEA", c1: "#e8c23a", c2: "#202020", tier: 61, rep: 55 },
];
const SQUAD = ["GK", "GK", "CB", "CB", "CB", "CB", "LB", "RB", "LB", "RB", "DM", "DM", "CM", "CM", "CM", "AM", "LW", "RW", "LW", "RW", "ST", "ST", "ST"];

// 퓨어데이 인물(빛 진영 FC) · 드래곤 군단(드래곤 FC) — 얼굴 그림이 있는 특별 선수
const PUREDAY = [
  { club: "light", pos: "ST", t: 82, name: "조아름", nat: "KR", age: 22, face: "areum", keep: { sho: 86, pac: 84 } },
  { club: "light", pos: "AM", t: 78, name: "조하임", nat: "KR", age: 20, face: "heim", keep: { pas: 84 } },
  { club: "light", pos: "GK", t: 80, name: "김미아", nat: "US", age: 27, face: "mia" },
  { club: "light", pos: "RW", t: 79, name: "마이클 하트", nat: "US", age: 26, face: "michael", keep: { pac: 92 } },
  { club: "light", pos: "LW", t: 79, name: "디에고 라미레스", nat: "PE", age: 25, face: "diego" },
  { club: "light", pos: "CM", t: 78, name: "콰메 아산테", nat: "GH", age: 27, face: "kwame", keep: { phy: 88 } },
  { club: "dragon", pos: "GK", t: 79, name: "대왕용", nat: "-", age: 33, face: "d_dragon" },
  { club: "dragon", pos: "ST", t: 80, name: "라합", nat: "-", age: 29, face: "d_rahab" },
  { club: "dragon", pos: "AM", t: 78, name: "아포피스", nat: "-", age: 28, face: "d_apophis" },
  { club: "dragon", pos: "RW", t: 77, name: "늑대개 우두머리", nat: "-", age: 24, face: "d_wolf", keep: { pac: 93 } },
  { club: "dragon", pos: "CB", t: 78, name: "용암 짐승", nat: "-", age: 30, face: "d_lava", keep: { phy: 93 } },
  { club: "dragon", pos: "LW", t: 77, name: "비룡대 대장", nat: "-", age: 26, face: "d_wyvern" },
];

export function makeWorld(seed = 20261025) {
  const r = rng(seed); NEXT_ID = 1;
  const clubs = CLUB_DEFS.map((c) => ({ ...c, budget: Math.round((15 + c.rep * 0.6) * 1e6), players: [] }));
  const players = [];
  for (const c of clubs) {
    const special = PUREDAY.filter((s) => s.club === c.id);
    const need = SQUAD.slice();
    for (const s of special) { const i = need.indexOf(s.pos); if (i >= 0) need.splice(i, 1); const p = makePlayer(r, s.pos, s.t, { name: s.name, nat: s.nat, age: s.age, keep: { ...(s.keep || {}), face: s.face }, contract: 4 }); p.club = c.id; players.push(p); }
    need.forEach((pos, i) => { const t = Math.round(c.tier - 6 + r() * 12 - (i > 14 ? 4 : 0)); const p = makePlayer(r, pos, t); p.club = c.id; players.push(p); });
  }
  // 자유 계약(FA) 선수 풀
  for (let i = 0; i < 40; i++) { const pos = POS[Math.floor(r() * POS.length)]; const p = makePlayer(r, pos, Math.round(55 + r() * 18), { age: Math.round(20 + r() * 14), contract: 0 }); p.club = null; players.push(p); }
  return { clubs, players, nextId: NEXT_ID };
}
// 새 팀(뉴팀)의 처음 선수단 — 낮은 종합, 운영비로 키워 '마이 팀'을 만든다
export function makeStarterSquad(seed, nextId) {
  const r = rng(seed); NEXT_ID = nextId; const out = [];
  // 20명, 자리마다 고르게(스트라이커 포함)
  ["GK", "GK", "CB", "CB", "CB", "CB", "LB", "RB", "DM", "DM", "CM", "CM", "CM", "AM", "LW", "LW", "RW", "RW", "ST", "ST"].forEach((pos) => { const p = makePlayer(r, pos, Math.round(56 + r() * 8), { age: Math.round(18 + r() * 12), contract: 2 }); out.push(p); });
  return { players: out, nextId: NEXT_ID };
}

// ---------------------------------------------------------------- 전술
// 자리: [포지션, ax(0=팀 왼쪽,1=오른쪽), ay(0=우리 골,1=상대 골)]
export const FORMATIONS = {
  "4-4-2": [["GK", .5, .03], ["LB", .12, .22], ["CB", .37, .18], ["CB", .63, .18], ["RB", .88, .22], ["LW", .12, .45], ["CM", .38, .40], ["CM", .62, .40], ["RW", .88, .45], ["ST", .38, .64], ["ST", .62, .64]],
  "4-3-3": [["GK", .5, .03], ["LB", .12, .22], ["CB", .37, .18], ["CB", .63, .18], ["RB", .88, .22], ["CM", .3, .40], ["DM", .5, .33], ["CM", .7, .40], ["LW", .15, .6], ["ST", .5, .66], ["RW", .85, .6]],
  "4-2-3-1": [["GK", .5, .03], ["LB", .12, .22], ["CB", .37, .18], ["CB", .63, .18], ["RB", .88, .22], ["DM", .38, .34], ["DM", .62, .34], ["LW", .15, .52], ["AM", .5, .52], ["RW", .85, .52], ["ST", .5, .67]],
  "3-5-2": [["GK", .5, .03], ["CB", .28, .18], ["CB", .5, .16], ["CB", .72, .18], ["LW", .08, .42], ["CM", .33, .40], ["DM", .5, .33], ["CM", .67, .40], ["RW", .92, .42], ["ST", .38, .65], ["ST", .62, .65]],
  "5-3-2": [["GK", .5, .03], ["LB", .08, .26], ["CB", .28, .18], ["CB", .5, .16], ["CB", .72, .18], ["RB", .92, .26], ["CM", .3, .4], ["CM", .5, .37], ["CM", .7, .4], ["ST", .38, .63], ["ST", .62, .63]],
  "3-4-3": [["GK", .5, .03], ["CB", .28, .18], ["CB", .5, .16], ["CB", .72, .18], ["LW", .1, .42], ["CM", .38, .38], ["CM", .62, .38], ["RW", .9, .42], ["LW", .2, .62], ["ST", .5, .67], ["RW", .8, .62]],
};
export const DEFAULT_TACTIC = { formation: "4-3-3", mentality: 1, press: 1, width: 1, passing: 1 };   // 각 값 0·1·2, 1 = 보통
export const TACTIC_LABEL = {
  mentality: ["수비적", "균형", "공격적"], press: ["낮은 압박", "보통 압박", "강한 압박"], width: ["좁게", "보통", "넓게"], passing: ["짧은 패스", "섞어서", "롱볼"],
};
// 가장 좋은 11명 + 벤치 7명
export function autoLineup(squad, formation) {
  const slots = FORMATIONS[formation], used = new Set(), xi = new Array(11).fill(null);
  // GK 먼저, 그다음 각 자리에 맞는 가장 높은 선수
  const order = slots.map((s, i) => i).sort((a, b) => (slots[a][0] === "GK" ? -1 : slots[b][0] === "GK" ? 1 : 0));
  for (const i of order) { let best = null, bv = -1; for (const p of squad) { if (used.has(p.id) || p.injured) continue; const v = fitOvr(p, slots[i][0]); if (v > bv) { bv = v; best = p; } } if (best) { xi[i] = best.id; used.add(best.id); } }
  const bench = squad.filter((p) => !used.has(p.id)).sort((a, b) => ovr(b) - ovr(a)).slice(0, 7).map((p) => p.id);
  return { xi, bench };
}
export function teamRating(squad, lineup, formation) {
  const slots = FORMATIONS[formation]; let a = 0, d = 0, m = 0, n = 0;
  lineup.xi.forEach((id, i) => { const p = squad.find((q) => q.id === id); if (!p) return; const v = fitOvr(p, slots[i][0]); n++; const pos = slots[i][0];
    if (["ST", "LW", "RW", "AM"].includes(pos)) a += v; else if (["CM", "DM"].includes(pos)) m += v; else d += v; });
  const all = lineup.xi.map((id, i) => { const p = squad.find((q) => q.id === id); return p ? fitOvr(p, slots[i][0]) : 30; });
  return { ovr: Math.round(all.reduce((s, v) => s + v, 0) / 11), n };
}
