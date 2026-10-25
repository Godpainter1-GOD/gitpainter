// 실제 리그 세계 만들기 — tools/tm_scrape.py 가 트랜스퍼마켓에서 받은 game/leagues.json 을 게임 자료로 바꾼다.
// 종합(50~120)은 시장가치·나이로 거꾸로 계산하고, 개인 능력치는 포지션·키·나이로 나눈다(트랜스퍼마켓에는 능력치가 없음).
import { makePlayer, rng, toOld, fromOld, ageMult, clampA, PUREDAY, setNextId } from "./data.js?v=5";

export const COUNTRY = { KR: { name: "대한민국", flag: "🇰🇷" }, DE: { name: "독일", flag: "🇩🇪" }, EN: { name: "잉글랜드", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" }, ES: { name: "스페인", flag: "🇪🇸" } };
// 승강: [1↔2부 팀 수, 2↔3부 팀 수]
export const PROMO = { KR: [2, 2], DE: [3, 3], EN: [3, 3], ES: [3, 4] };
const POSMAP = { "Goalkeeper": "GK", "Centre-Back": "CB", "Left-Back": "LB", "Right-Back": "RB", "Defensive Midfield": "DM", "Central Midfield": "CM", "Attacking Midfield": "AM", "Left Midfield": "LW", "Right Midfield": "RW", "Left Winger": "LW", "Right Winger": "RW", "Second Striker": "ST", "Centre-Forward": "ST", "Defender": "CB", "Midfield": "CM", "Attack": "ST", "Sweeper": "CB", "Forward": "ST" };
const ISO = { "Korea, South": "KR", "Germany": "DE", "England": "GB-ENG", "Spain": "ES", "France": "FR", "Brazil": "BR", "Argentina": "AR", "Portugal": "PT", "Netherlands": "NL", "Belgium": "BE", "Italy": "IT", "Japan": "JP", "United States": "US", "Nigeria": "NG", "Ghana": "GH", "Senegal": "SN", "Cote d'Ivoire": "CI", "Cameroon": "CM", "Morocco": "MA", "Algeria": "DZ", "Tunisia": "TN", "Egypt": "EG", "Croatia": "HR", "Serbia": "RS", "Poland": "PL", "Austria": "AT", "Switzerland": "CH", "Denmark": "DK", "Sweden": "SE", "Norway": "NO", "Finland": "FI", "Iceland": "IS", "Scotland": "GB-SCT", "Wales": "GB-WLS", "Ireland": "IE", "Northern Ireland": "GB-NIR", "Uruguay": "UY", "Colombia": "CO", "Mexico": "MX", "Peru": "PE", "Chile": "CL", "Ecuador": "EC", "Paraguay": "PY", "Venezuela": "VE", "Australia": "AU", "Türkiye": "TR", "Turkey": "TR", "Ukraine": "UA", "Czech Republic": "CZ", "Slovakia": "SK", "Slovenia": "SI", "Hungary": "HU", "Greece": "GR", "Romania": "RO", "Bulgaria": "BG", "Albania": "AL", "Kosovo": "XK", "North Macedonia": "MK", "Bosnia-Herzegovina": "BA", "Montenegro": "ME", "Mali": "ML", "Guinea": "GN", "DR Congo": "CD", "Congo": "CG", "Jamaica": "JM", "Canada": "CA", "China": "CN", "Iran": "IR", "Iraq": "IQ", "Saudi Arabia": "SA", "Qatar": "QA", "Uzbekistan": "UZ", "Georgia": "GE", "Armenia": "AM", "Russia": "RU", "Belarus": "BY", "Lithuania": "LT", "Latvia": "LV", "Estonia": "EE", "Luxembourg": "LU", "Cyprus": "CY", "Israel": "IL", "Gambia": "GM", "Burkina Faso": "BF", "Togo": "TG", "Benin": "BJ", "Angola": "AO", "Zambia": "ZM", "Zimbabwe": "ZW", "South Africa": "ZA", "Kenya": "KE", "Cape Verde": "CV", "Guinea-Bissau": "GW", "Equatorial Guinea": "GQ", "Gabon": "GA", "Sierra Leone": "SL", "Liberia": "LR", "Mozambique": "MZ", "Costa Rica": "CR", "Honduras": "HN", "Panama": "PA", "Haiti": "HT", "Cuba": "CU", "Dominican Republic": "DO", "Suriname": "SR", "Curacao": "CW", "New Zealand": "NZ", "Philippines": "PH", "Thailand": "TH", "Vietnam": "VN", "Indonesia": "ID", "Malaysia": "MY", "Andorra": "AD", "Malta": "MT", "Faroe Islands": "FO", "Moldova": "MD", "Azerbaijan": "AZ", "Kazakhstan": "KZ", "Syria": "SY", "Lebanon": "LB", "Jordan": "JO", "Palestine": "PS", "Bolivia": "BO", "Guadeloupe": "GP", "Martinique": "MQ", "French Guiana": "GF", "Comoros": "KM", "Madagascar": "MG", "Mauritania": "MR", "Burundi": "BI", "Rwanda": "RW", "Uganda": "UG", "Tanzania": "TZ", "Sudan": "SD", "Libya": "LY", "Chad": "TD", "Niger": "NE", "Central African Republic": "CF", "Eritrea": "ER", "Ethiopia": "ET", "Grenada": "GD", "Trinidad and Tobago": "TT", "Bermuda": "BM", "Montserrat": "MS", "St. Kitts & Nevis": "KN", "Antigua and Barbuda": "AG", "Guyana": "GY", "Hong Kong": "HK", "Chinese Taipei": "TW", "Korea, North": "KP", "Mongolia": "MN" };
export function flagOf(nat) {
  if (!nat) return "🏳"; if (nat.length === 2 && /^[A-Z]{2}$/.test(nat)) return ({ EN: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" })[nat] || String.fromCodePoint(...[...nat].map((c) => 127397 + c.charCodeAt(0)));
  const iso = ISO[nat]; if (!iso) return "🏳";
  if (iso === "GB-ENG") return "🏴󠁧󠁢󠁥󠁮󠁧󠁿"; if (iso === "GB-SCT") return "🏴󠁧󠁢󠁳󠁣󠁴󠁿"; if (iso === "GB-WLS") return "🏴󠁧󠁢󠁷󠁬󠁳󠁿"; if (iso === "GB-NIR") return "🇬🇧"; if (iso === "XK") return "🇽🇰";
  return String.fromCodePoint(...[...iso].map((c) => 127397 + c.charCodeAt(0)));
}
// K리그 구단 한국어 이름(영문 이름에 들어 있는 낱말로 찾음)
const KO_CLUB = [["Jeonbuk", "전북 현대"], ["Ulsan HD", "울산 HD"], ["Ulsan Citizen", "울산 시민"], ["Daejeon Hana", "대전 하나시티즌"], ["Daejeon Korail", "대전 코레일"], ["Gimcheon", "김천 상무"], ["Gangwon", "강원 FC"], ["FC Seoul", "FC 서울"], ["Seoul E-Land", "서울 이랜드"], ["Anyang", "FC 안양"], ["Jeju", "제주 SK"], ["Incheon", "인천 유나이티드"], ["Bucheon", "부천 FC 1995"], ["Gwangju", "광주 FC"], ["Pohang", "포항 스틸러스"], ["Suwon Samsung", "수원 삼성"], ["Suwon FC", "수원 FC"], ["Daegu", "대구 FC"], ["Busan IPark", "부산 아이파크"], ["Busan Transportation", "부산 교통공사"], ["Jeonnam", "전남 드래곤즈"], ["Seongnam", "성남 FC"], ["Gyeongnam", "경남 FC"], ["Chungnam Asan", "충남 아산"], ["Asan", "충남 아산"], ["Ansan", "안산 그리너스"], ["Cheonan", "천안 시티"], ["Chungbuk Cheongju", "충북 청주"], ["Cheongju", "충북 청주"], ["Hwaseong", "화성 FC"], ["Gimpo", "김포 FC"], ["Paju", "파주 프런티어"], ["Gimhae", "김해 FC"], ["Yongin", "용인 FC"], ["Gyeongju", "경주 한수원"], ["Changwon", "창원 FC"], ["Siheung", "시흥 시민"], ["Pocheon", "포천 시민"], ["Mokpo", "목포 FC"], ["Yangpyeong", "양평 FC"], ["Gangneung", "강릉 시민"], ["Dangjin", "당진 시민"], ["Yeoju", "여주 FC"], ["Chuncheon", "춘천 시민"], ["Pyeongchang", "평창 유나이티드"], ["Geoje", "거제 시민"], ["Jinju", "진주 시민"], ["Hwaseong", "화성 FC"], ["Seosan", "서산 시민"], ["Jeonbuk Hyundai Motors B", "전북 현대 B"]];
function koName(en) { const hit = KO_CLUB.filter(([k]) => en.includes(k)).sort((a, b) => b[0].length - a[0].length)[0]; if (!hit) return en; return hit[1] + (/ (II|B|U23|Reserves)$/.test(en) && !hit[1].endsWith(" B") ? " B" : ""); }
const KITS = [["#c8102e", "#ffffff"], ["#003399", "#ffffff"], ["#0b6e3a", "#ffffff"], ["#111111", "#ffd34a"], ["#ffffff", "#c8102e"], ["#6cabdd", "#1c2c5b"], ["#ffd200", "#0b2a4a"], ["#7a263a", "#94bee5"], ["#f58220", "#111111"], ["#5a2d82", "#ffffff"], ["#e30613", "#111111"], ["#00843d", "#fdb913"], ["#004b8d", "#e30613"], ["#ffffff", "#003399"], ["#a50044", "#004d98"], ["#1b458f", "#c4122e"]];
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function short(name) { const w = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter((x) => x && !["FC", "CF", "SC", "AFC", "CD", "UD", "SD", "RC", "CA", "1.", "SV", "VfB", "VfL", "TSG", "FSV", "SpVgg", "SSV", "Real", "Club", "de", "the", "City", "United", "Hotspur"].includes(x)); const s = (w[0] || name).toUpperCase(); return s.slice(0, 3); }

// 시장가치 → 종합(50~120). 값이 없으면 그 리그 보통 수준
export function ovrFromValue(value, age, fallback) {
  if (!value) return fallback;
  const o = 55 + Math.log(value / (0.45e6 * ageMult(age || 26))) / 0.158;   // 완만하게: 최상위 약 114, 3부 약 65
  return clampA(fromOld(Math.max(28, Math.min(98, o))));
}
const SQUAD_MAX = 28;
export function buildRealWorld(J, seed = 20261025) {
  const r = rng(seed); setNextId(1);
  const clubs = [], players = [], leagues = [];
  for (const L of J.leagues) {
    const lg = { id: L.code, name: L.name, tmName: L.tmName, country: L.country, tier: L.tier, clubs: [] };
    const vals = L.clubs.flatMap((c) => c.players.map((p) => p.value)).filter((v) => v > 0).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length * 0.35)] || 50e3;
    const fallbackOvr = ovrFromValue(median * 0.6, 26, 60);
    for (const c of L.clubs) {
      const id = "t" + c.tm, kit = KITS[hash(c.name) % KITS.length];
      let ps = c.players.filter((p) => p.name).slice();
      ps.sort((a, b) => b.value - a.value);
      const gks = ps.filter((p) => POSMAP[p.pos] === "GK").slice(0, 3);
      ps = [...gks, ...ps.filter((p) => POSMAP[p.pos] !== "GK").slice(0, SQUAD_MAX - gks.length)];
      const sqVal = ps.reduce((s, p) => s + (p.value || 0), 0);
      const club = { id, tm: c.tm, name: L.country === "KR" ? koName(c.name) : c.name, en: c.name, short: short(c.name), c1: kit[0], c2: kit[1], league: L.code, rep: 0, budget: 0, sqVal };
      clubs.push(club); lg.clubs.push(id);
      for (const t of ps) {
        const pos = POSMAP[t.pos] || "CM", age = t.age || 26;
        const target = ovrFromValue(t.value, age, fallbackOvr - 3 + Math.round(r() * 4));
        const contractYears = t.contract ? Math.max(1, Math.min(6, +t.contract.slice(0, 4) - 2026 + (+t.contract.slice(5, 7) >= 7 ? 0 : 0))) : 1 + Math.floor(r() * 2);
        const p = makePlayer(r, pos, target, { id: "m" + t.tm, name: t.name, nat: t.nat, age, height: t.height, contract: contractYears });
        p.value = t.value || Math.round(median * 0.5 / 25e3) * 25e3 || 25e3; p.tm = t.tm; p.club = id; if (t.num && /^\d+$/.test(t.num)) p.num = t.num; if (t.foot) p.foot = t.foot;
        players.push(p);
      }
    }
    leagues.push(lg);
  }
  // 평판·운영비: 리그 단계와 선수단 가치로
  for (const lg of leagues) {
    const cs = clubs.filter((c) => c.league === lg.id), avg = cs.reduce((s, c) => s + c.sqVal, 0) / Math.max(1, cs.length);
    lg.econ = avg;   // 리그 경제 규모(구단 평균 선수단 가치)
    for (const c of cs) { c.rep = Math.round(Math.max(20, Math.min(98, 40 + Math.log10(Math.max(1e5, c.sqVal)) * 6 - (lg.tier - 1) * 4 + (c.sqVal / avg - 1) * 8))); c.budget = Math.round(Math.max(0.3e6, c.sqVal * 0.12 + avg * 0.04) / 1e4) * 1e4; }
  }
  // FA: 트랜스퍼마켓 소속 없는 선수 + 퓨어데이 인물
  for (const t of J.fa || []) {
    const pos = POSMAP[t.pos] || "CM", age = t.age || 28;
    const p = makePlayer(r, pos, ovrFromValue(t.value, age, 68), { id: "m" + t.tm, name: t.name, nat: t.nat, age, height: t.height, contract: 0 });
    p.value = t.value || 25e3; p.tm = t.tm; p.club = null; p.lastClub = t.lastClub || ""; players.push(p);
  }
  for (const s of PUREDAY) { const p = makePlayer(r, s.pos, s.t, { id: "pd_" + s.face, name: s.name, nat: s.nat, age: s.age, keep: { ...(s.keep || {}), face: s.face }, contract: 0 }); p.club = null; players.push(p); }
  return { clubs, players, leagues, fetched: J.fetched, source: J.source };
}
let CACHE = null;
export async function loadReal() { if (CACHE) return CACHE; const r = await fetch("leagues.json?v=1"); CACHE = await r.json(); return CACHE; }
