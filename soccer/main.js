// 퓨어데이 FC — 화면(처음·창단·구단 운영·전술·이적시장·경기·온라인)
import { makeWorld, ovr, fitOvr, marketValue, wageOf, money, FLAG, POS_KO, FORMATIONS, TACTIC_LABEL, DEFAULT_TACTIC, autoLineup, teamRating } from "./data.js";
import { Match, drawMatch, PW, PL } from "./engine.js";
import * as C from "./career.js";
import { connect, makeCode } from "./net.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const app = $("app");
const OPT = { diff: 1, halfSec: 150, sound: true };
try { Object.assign(OPT, JSON.parse(localStorage.getItem("pureday-fc-opt") || "{}")); } catch (e) {}
const saveOpt = () => { try { localStorage.setItem("pureday-fc-opt", JSON.stringify(OPT)); } catch (e) {} };
let S = C.load();            // 커리어 상태
let tab = "home";
const FACES = {};
["areum", "heim", "mia", "michael", "diego", "kwame", "d_dragon", "d_rahab", "d_apophis", "d_wolf", "d_lava", "d_wyvern"].forEach((k) => { const im = new Image(); im.src = `assets/faces/${k}_face.png`; FACES[k] = im; });
const faceImg = (p) => (p.face ? `<img class="face" src="assets/faces/${p.face}_face.png" alt="">` : "");
const posCls = (pos) => (pos === "GK" ? "GK" : ["CB", "LB", "RB"].includes(pos) ? "D" : ["DM", "CM", "AM"].includes(pos) ? "M" : "F");
const posTag = (pos) => `<span class="pos ${posCls(pos)}">${pos}</span>`;
const ovCol = (o) => (o >= 80 ? "#7fe07a" : o >= 72 ? "#c8f07a" : o >= 65 ? "#ffd34a" : o >= 58 ? "#ffb35a" : "#ff8a7a");
const ovTag = (o) => `<span class="ov" style="background:${ovCol(o)}">${o}</span>`;
const badge = (c, size = 46) => `<span class="badge" style="width:${size}px;height:${size}px;background:${c.c1};border-color:${c.c2};color:${lum(c.c1) > 0.6 ? "#111" : "#fff"};font-size:${Math.round(size / 3.6)}px">${esc(c.short)}</span>`;
function lum(hex) { const n = parseInt(hex.slice(1), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; }
let toastT = 0;
function toast(msg, ms = 2200) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); }
function modal(html) { const m = $("modal"); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; m.onclick = (e) => { if (e.target === m) closeModal(); }; return m; }
function closeModal() { $("modal").hidden = true; }
function persist() { if (S) C.save(S); }

// ---------------------------------------------------------------- 처음 화면
function title() {
  app.hidden = false; $("matchView").hidden = true;
  app.innerHTML = `<div class="title"><small>PUREDAY FOOTBALL</small><h1><b>퓨어데이</b> FC</h1>
    <p>뉴팀을 창단해 나만의 <b>마이 팀</b>으로 키워요. 전술을 짜고, 운영비로 여름·겨울·FA 이적시장에서 선수를 사고팔고 트레이드해요.</p></div>
    <div class="stack">
      ${S ? `<button class="big" id="bCont">▶ 커리어 이어하기<br><small style="font-weight:700">${esc(C.club(S, C.MY).name)} · ${C.seasonLabel(S)} · ${C.PHASE_KO[S.phase]}</small></button>` : ""}
      <button class="big ${S ? "alt" : ""}" id="bNew">🏟 뉴팀 창단 (새 커리어)</button>
      <button class="big green" id="bOnline">🌐 친구와 온라인 대전</button>
      <button class="big alt" id="bFriendly">⚽ 친선 경기 (컴퓨터 / 둘이서)</button>
      <div class="card"><div class="lbl" style="margin-top:0">컴퓨터 실력</div><div class="seg" id="sDiff">${["쉬움", "보통", "어려움"].map((n, i) => `<button class="sm ${OPT.diff === i ? "on" : ""}" data-v="${i}">${n}</button>`).join("")}</div>
        <div class="lbl">경기 시간</div><div class="seg" id="sTime">${[[90, "3분"], [150, "5분"], [240, "8분"]].map(([v, n]) => `<button class="sm ${OPT.halfSec === v ? "on" : ""}" data-v="${v}">${n}</button>`).join("")}</div></div>
      <button class="sm" id="bHow">하는 방법</button>
    </div>`;
  if (S) $("bCont").onclick = hub;
  $("bNew").onclick = () => (S ? confirmNew() : createTeam());
  $("bFriendly").onclick = friendly; $("bOnline").onclick = online; $("bHow").onclick = how;
  $("sDiff").querySelectorAll("button").forEach((b) => (b.onclick = () => { OPT.diff = +b.dataset.v; saveOpt(); title(); }));
  $("sTime").querySelectorAll("button").forEach((b) => (b.onclick = () => { OPT.halfSec = +b.dataset.v; saveOpt(); title(); }));
}
function confirmNew() {
  modal(`<h2>새 커리어를 시작할까요?</h2><p class="sub" style="margin-top:6px">지금 커리어(${esc(C.club(S, C.MY).name)})는 지워져요.</p><div class="row" style="margin-top:14px"><button class="big" id="mYes">새로 시작</button><button class="sm" id="mNo">취소</button></div>`);
  $("mYes").onclick = () => { closeModal(); createTeam(); }; $("mNo").onclick = closeModal;
}
function how() {
  modal(`<h2>하는 방법</h2>
    <div class="msg"><b>경기 조작(폰)</b> — 아래 왼쪽 칸을 누르고 끌면 노란 고리 선수가 움직여요. <b>패스</b>: 바라보는 쪽 동료에게(공이 없으면 선수 바꾸기), <b>슛</b>: 상대 골로(공이 없으면 태클), <b>질주</b>: 누르고 있는 동안 빨리.</div>
    <div class="msg"><b>키보드</b> — 1P: 방향키/WASD 이동 · J/Space 패스 · K/X 슛 · L/Shift 질주. 둘이서일 때 2P: 방향키 · M 패스 · , 슛 · . 질주 (1P 는 WASD · F 패스 · G 슛 · H 질주)</div>
    <div class="msg"><b>커리어</b> — 뉴팀은 낮은 능력의 선수 20명과 운영비 €40M 로 시작해요. 이적시장은 여름(시즌 전)·겨울(9라운드 뒤)·FA(시즌 끝)에 5일씩 열려요. 다른 구단 선수에게 이적료를 제안하거나 내 선수를 얹어 <b>트레이드</b>하고, 내 선수를 이적 명단에 올리면 제안이 와요. 주급은 2주마다, 홈 경기 수입·승리 수당·시즌 상금·스폰서로 운영비가 들어와요.</div>
    <div class="msg"><b>전술</b> — 포메이션 6가지, 공격 성향·압박·폭·패스 방식이 경기 움직임과 빠른 결과 모두에 반영돼요.</div>
    <button class="big" id="mOk" style="margin-top:12px;width:100%">알겠어요</button>`);
  $("mOk").onclick = closeModal;
}

// ---------------------------------------------------------------- 뉴팀 창단
const KITS = [["#ffd34a", "#1b2a4a"], ["#e63946", "#ffffff"], ["#1d4ed8", "#ffffff"], ["#16a34a", "#fef08a"], ["#7c3aed", "#f5f5f5"], ["#0f172a", "#ffd34a"], ["#ffffff", "#e63946"], ["#f97316", "#111111"]];
function createTeam() {
  let kit = 0;
  const draw = () => {
    app.innerHTML = `<div class="title" style="padding-top:12px"><small>NEW TEAM</small><h1>뉴팀 <b>창단</b></h1><p>이름과 색을 정하면 낮은 능력의 선수 20명과 운영비 <b>€40M</b>로 시작해요. 이적시장에서 키워 마이 팀을 만들어요.</p></div>
      <div class="card"><div class="lbl" style="margin-top:0">팀 이름</div><input type="text" id="iName" maxlength="16" value="뉴팀 FC">
      <div class="lbl">약칭 (영문 3자)</div><input type="text" id="iShort" maxlength="3" value="NEW">
      <div class="lbl">유니폼 색</div><div class="swatches">${KITS.map((k, i) => `<button class="sw ${i === kit ? "on" : ""}" data-k="${i}" style="background:${k[0]}"><i style="background:${k[1]}"></i></button>`).join("")}</div></div>
      <div class="stack"><button class="big" id="bGo">창단하고 시작</button><button class="sm" id="bBack">처음으로</button></div>`;
    app.querySelectorAll(".sw").forEach((b) => (b.onclick = () => { const n = $("iName").value, s = $("iShort").value; kit = +b.dataset.k; draw(); $("iName").value = n; $("iShort").value = s; }));
    $("bGo").onclick = () => { S = C.newCareer({ name: $("iName").value.trim() || "뉴팀 FC", short: $("iShort").value.trim() || "NEW", c1: KITS[kit][0], c2: KITS[kit][1] }); persist(); tab = "home"; hub(); toast("창단 완료! 여름 이적시장에서 선수를 보강해 보세요."); };
    $("bBack").onclick = title;
  };
  draw();
}

// ---------------------------------------------------------------- 구단 운영(허브)
function hub() {
  app.hidden = false; $("matchView").hidden = true;
  const me = C.club(S, C.MY);
  const tabs = [["home", "홈"], ["squad", "선수단"], ["tactic", "전술"], ["market", "이적시장"], ["table", "순위"], ["news", "소식·재정"]];
  app.innerHTML = `<div class="hub-top">${badge(me)}<div class="nm"><b>${esc(me.name)}<span class="tag">MY TEAM</span></b><span class="sub">${C.seasonLabel(S)} 시즌 · 종합 ${C.rating(S, C.MY)} · 평판 ${Math.round(me.rep)}</span></div>
      <div class="money"><span class="sub">운영비</span><b>${money(me.budget)}</b></div></div>
    <div class="tabs">${tabs.map(([k, n]) => `<button class="${tab === k ? "on" : ""}" data-t="${k}">${n}${k === "market" && S.offers.length ? ` (${S.offers.length})` : ""}</button>`).join("")}</div>
    <div id="tabBody"></div>`;
  app.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { tab = b.dataset.t; hub(); }));
  ({ home: tabHome, squad: tabSquad, tactic: tabTactic, market: tabMarket, table: tabTable, news: tabNews })[tab]($("tabBody"));
}
function phaseBox() {
  const w = C.windowOpen(S);
  return `<div class="phase"><span>${w ? "🔓" : "⚽"} <b>${C.PHASE_KO[S.phase]}</b><br><span class="sub">${C.phaseInfo(S)}</span></span>
    ${w ? `<button class="sm on" id="bDay">하루 넘기기 ▶</button>` : ""}</div>`;
}
function bindDay() { const b = $("bDay"); if (b) b.onclick = () => { const was = S.phase; C.advanceDay(S); persist(); if (S.phase !== was) toast(`${C.PHASE_KO[was]}이 닫혔어요 → ${C.PHASE_KO[S.phase]}`); hub(); }; }
function tabHome(el) {
  const f = C.nextFixture(S);
  let next = "";
  if (f) {
    const h = C.club(S, f.h), a = C.club(S, f.a);
    next = `<div class="card"><h3>다음 경기 · ${S.md + 1}라운드 ${f.h === C.MY ? "(홈)" : "(원정)"}</h3>
      <div class="vs"><div class="t">${badge(h)}<b>${esc(h.name)}</b><span class="sub">종합 ${C.rating(S, h.id)}</span></div><div class="x">VS</div><div class="t">${badge(a)}<b>${esc(a.name)}</b><span class="sub">종합 ${C.rating(S, a.id)}</span></div></div>
      <div class="row c" style="margin-top:8px"><button class="big" id="bPlay">⚽ 직접 뛰기</button><button class="big alt" id="bSim">⏩ 빠른 결과</button></div></div>`;
  }
  const offers = S.offers.length ? `<div class="card"><h3>📨 받은 제안 ${S.offers.length}건</h3>${offersHTML()}</div>` : "";
  const tb = C.standings(S), myRank = tb.findIndex((r) => r.c.id === C.MY) + 1;
  el.innerHTML = phaseBox() + next + offers +
    `<div class="card"><h3>시즌 현황</h3><div class="kv"><span>순위</span><b>${myRank}위 / ${tb.length}</b></div><div class="kv"><span>승점</span><b>${S.table[C.MY].pts}</b></div>
      <div class="kv"><span>선수단</span><b>${C.squad(S, C.MY).length}명 · 주급 합계 ${money(C.payroll(S, C.MY))}</b></div>
      ${S.history.length ? `<div class="kv"><span>지난 시즌</span><b>${S.history[0].myRank}위 (우승 ${esc(S.history[0].champion)})</b></div>` : ""}</div>
    <div class="card"><h3>최근 소식</h3>${S.news.slice(0, 5).map((n) => `<div class="newsl ${n.kind}">${esc(n.text)}</div>`).join("")}</div>
    <div class="row c" style="margin-top:12px"><button class="sm" id="bHome">처음 화면</button></div>`;
  bindDay(); bindOffers();
  if (f) { $("bPlay").onclick = () => playCareerMatch(); $("bSim").onclick = () => { const res = C.playMatchday(S); persist(); showResults(res); }; }
  $("bHome").onclick = title;
}
function showResults(res, myLine) {
  if (!res) return hub();
  const rows = res.map((r) => { const h = C.club(S, r.h), a = C.club(S, r.a); return `<tr class="${r.mine ? "me" : ""}"><td>${esc(h.name)}</td><td class="n"><b>${r.score[0]} : ${r.score[1]}</b></td><td>${esc(a.name)}</td></tr>`; }).join("");
  modal(`<h2>${S.md}라운드 결과</h2>${myLine ? `<div class="msg ok">${myLine}</div>` : ""}<table style="margin-top:8px">${rows}</table>
    ${S.phase === "winter" ? `<div class="msg ct">❄ 겨울 이적시장이 열렸어요!</div>` : S.phase === "fa" ? `<div class="msg ct">🏆 시즌이 끝났어요 — ${esc(S.history[0].champion)} 우승, 우리 팀 ${S.history[0].myRank}위. FA 이적시장이 열렸어요.</div>` : ""}
    <button class="big" id="mOk" style="width:100%;margin-top:12px">확인</button>`);
  $("mOk").onclick = () => { closeModal(); hub(); };
}
function offersHTML() {
  return S.offers.map((o, k) => { const p = C.player(S, o.pid), c = C.club(S, o.from); return p ? `<div class="offer"><span>${esc(c.name)} → <b>${esc(p.name)}</b> ${money(o.fee)}<br><span class="sub">시장 가치 ${money(marketValue(p))}</span></span><span class="row"><button class="sm green" data-acc="${k}">수락</button><button class="sm red" data-dec="${k}">거절</button></span></div>` : ""; }).join("");
}
function bindOffers() {
  app.querySelectorAll("[data-acc]").forEach((b) => (b.onclick = () => { const r = C.acceptOffer(S, +b.dataset.acc); persist(); if (r) toast(r.msg); hub(); }));
  app.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = () => { C.declineOffer(S, +b.dataset.dec); persist(); hub(); }));
}

// ---------------------------------------------------------------- 선수단
let squadSort = "pos";
const POS_ORDER = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"];
function playerRow(p, extra = "") {
  return `<tr class="click" data-p="${p.id}"><td>${posTag(p.pos)}</td><td><div class="pname">${faceImg(p)}<span>${esc(p.name)}</span>${S.listed.includes(p.id) ? `<span class="listed">명단</span>` : ""}</div></td>
    <td class="n">${p.age}</td><td class="n">${ovTag(ovr(p))}</td><td class="n">${money(marketValue(p))}</td>${extra}</tr>`;
}
function tabSquad(el) {
  const sq = C.squad(S, C.MY).slice();
  const sorters = { pos: (a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || ovr(b) - ovr(a), ovr: (a, b) => ovr(b) - ovr(a), value: (a, b) => marketValue(b) - marketValue(a), age: (a, b) => a.age - b.age };
  sq.sort(sorters[squadSort]);
  el.innerHTML = phaseBox() + `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">선수단 ${sq.length}명</h3>
      <div class="seg">${[["pos", "포지션"], ["ovr", "종합"], ["value", "가치"], ["age", "나이"]].map(([k, n]) => `<button class="sm ${squadSort === k ? "on" : ""}" data-s="${k}">${n}</button>`).join("")}</div></div>
    <table style="margin-top:8px"><tr><th>자리</th><th>이름</th><th class="n">나이</th><th class="n">종합</th><th class="n">가치</th><th class="n">계약</th></tr>
    ${sq.map((p) => playerRow(p, `<td class="n">${p.contract}년</td>`)).join("")}</table>
    <p class="sub" style="margin-top:8px">선수를 누르면 이적 명단 올리기·재계약·방출을 할 수 있어요. 주급 합계 ${money(C.payroll(S, C.MY))}/주</p></div>`;
  bindDay();
  el.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { squadSort = b.dataset.s; hub(); }));
  el.querySelectorAll("tr[data-p]").forEach((tr) => (tr.onclick = () => myPlayerModal(tr.dataset.p)));
}
function attrsHTML(p) {
  const A = p.pos === "GK" ? [["골키퍼", p.gk], ["피지컬", p.phy], ["패스", p.pas], ["속도", p.pac]] : [["속도", p.pac], ["슛", p.sho], ["패스", p.pas], ["드리블", p.dri], ["수비", p.def], ["피지컬", p.phy], ["종합", ovr(p)], ["잠재력", p.pot]];
  return `<div class="attrs">${A.map(([n, v]) => `<div><b style="color:${ovCol(v)}">${v}</b>${n}</div>`).join("")}</div>`;
}
function playerHead(p) {
  const c = p.club ? C.club(S, p.club) : null;
  return `<div class="row" style="gap:10px">${p.face ? `<img src="assets/faces/${p.face}_face.png" style="width:56px;height:56px;border-radius:50%;object-fit:cover" alt="">` : `<span class="badge" style="width:56px;height:56px;background:#223;border-color:#445">${p.pos}</span>`}
    <div><h2>${esc(p.name)} ${ovTag(ovr(p))}</h2><span class="sub">${FLAG[p.nat] || "🏳"} ${POS_KO[p.pos]} · ${p.age}세 · ${c ? esc(c.name) : "자유 계약(FA)"}</span></div></div>
    ${attrsHTML(p)}
    <div class="kv" style="margin-top:8px"><span>시장 가치</span><b>${money(marketValue(p))}</b></div>
    <div class="kv"><span>주급</span><b>${money(p.wage || wageOf(p))}</b></div><div class="kv"><span>남은 계약</span><b>${p.club ? p.contract + "시즌" : "-"}</b></div>
    <div class="kv"><span>이번 시즌</span><b>${p.apps || 0}경기 ${p.sg || 0}골</b></div>`;
}
function myPlayerModal(pid) {
  const p = C.player(S, pid), listed = S.listed.includes(pid);
  modal(playerHead(p) + `<div class="row" style="margin-top:12px"><button class="sm ${listed ? "on" : ""}" id="mList">${listed ? "이적 명단에서 내리기" : "이적 명단 올리기"}</button><button class="sm green" id="mExt">재계약 (+2시즌)</button><button class="sm red" id="mRel">방출</button><button class="sm" id="mClose">닫기</button></div>
    <p class="sub" style="margin-top:8px">이적 명단에 올리면 이적시장 기간에 다른 구단의 제안이 와요.</p>`);
  $("mList").onclick = () => { C.toggleList(S, pid); persist(); closeModal(); hub(); toast(S.listed.includes(pid) ? `${p.name}을(를) 이적 명단에 올렸어요` : "명단에서 내렸어요"); };
  $("mExt").onclick = () => { const r = C.extend(S, pid); persist(); closeModal(); hub(); toast(r.msg); };
  $("mRel").onclick = () => { const r = C.release(S, pid); persist(); closeModal(); hub(); if (r) toast(r.msg); };
  $("mClose").onclick = closeModal;
}

// ---------------------------------------------------------------- 전술
let selSlot = -1;
function tabTactic(el) {
  const t = S.tactics[C.MY], lu = C.fixLineup(S, C.MY), slots = FORMATIONS[t.formation], sq = C.squad(S, C.MY), me = C.club(S, C.MY);
  const seg = (k) => `<div class="lbl">${{ mentality: "공격 성향", press: "압박", width: "폭", passing: "패스 방식" }[k]}</div><div class="seg">${TACTIC_LABEL[k].map((n, i) => `<button class="sm ${t[k] === i ? "on" : ""}" data-k="${k}" data-v="${i}">${n}</button>`).join("")}</div>`;
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">포메이션 · 종합 ${C.rating(S, C.MY)}</h3><button class="sm on" id="bAuto">자동 배치</button></div>
      <div class="seg" style="margin-top:8px">${Object.keys(FORMATIONS).map((f) => `<button class="sm ${t.formation === f ? "on" : ""}" data-f="${f}">${f}</button>`).join("")}</div>
      <div class="board" id="board">${slots.map(([pos, ax, ay], i) => { const p = sq.find((q) => q.id === lu.xi[i]); const fo = p ? fitOvr(p, pos) : 0;
        return `<div class="slot ${selSlot === i ? "sel" : ""}" data-i="${i}" style="left:${ax * 100}%;top:${(1 - ay / 0.78) * 88 + 6}%"><div class="dot" style="background:${me.c1};color:${lum(me.c1) > 0.6 ? "#111" : "#fff"}">${p && p.face ? `<img src="assets/faces/${p.face}_face.png" alt="">` : fo}</div><span class="nm">${p ? esc(p.name) : "비어 있음"}</span><span class="pp">${pos} ${p ? fo : ""}</span></div>`; }).join("")}</div>
      <p class="sub" style="margin-top:6px">자리를 누르면 그 자리에 설 선수를 고를 수 있어요. 숫자는 그 자리에서의 능력이에요.</p></div>
    <div class="card"><h3>팀 지시</h3>${seg("mentality")}${seg("press")}${seg("width")}${seg("passing")}</div>
    <div class="card"><h3>벤치</h3>${lu.bench.map((id) => { const p = C.player(S, id); return p ? `<div class="kv"><span>${posTag(p.pos)} ${esc(p.name)}</span><b>${ovr(p)}</b></div>` : ""; }).join("") || `<p class="sub">벤치가 비어 있어요</p>`}</div>`;
  el.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { t.formation = b.dataset.f; S.lineups[C.MY] = null; C.fixLineup(S, C.MY); persist(); hub(); }));
  el.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { t[b.dataset.k] = +b.dataset.v; persist(); hub(); }));
  $("bAuto").onclick = () => { S.lineups[C.MY] = null; C.fixLineup(S, C.MY); persist(); hub(); toast("가장 좋은 11명으로 배치했어요"); };
  el.querySelectorAll(".slot").forEach((d) => (d.onclick = () => pickForSlot(+d.dataset.i)));
}
function pickForSlot(i) {
  const t = S.tactics[C.MY], lu = C.fixLineup(S, C.MY), pos = FORMATIONS[t.formation][i][0];
  const sq = C.squad(S, C.MY).slice().sort((a, b) => fitOvr(b, pos) - fitOvr(a, pos));
  modal(`<h2>${pos} 자리 (${POS_KO[pos]})</h2><table style="margin-top:8px"><tr><th>자리</th><th>이름</th><th class="n">이 자리</th><th class="n">종합</th><th></th></tr>
    ${sq.map((p) => { const where = lu.xi.indexOf(p.id); return `<tr class="click" data-p="${p.id}"><td>${posTag(p.pos)}</td><td><div class="pname">${faceImg(p)}<span>${esc(p.name)}</span></div></td><td class="n">${ovTag(fitOvr(p, pos))}</td><td class="n">${ovr(p)}</td><td class="sub">${where === i ? "지금" : where >= 0 ? "선발" : lu.bench.includes(p.id) ? "벤치" : ""}</td></tr>`; }).join("")}</table>`);
  $("modal").querySelectorAll("tr[data-p]").forEach((tr) => (tr.onclick = () => {
    const id = tr.dataset.p, old = lu.xi[i], j = lu.xi.indexOf(id);
    if (j >= 0) lu.xi[j] = old; else { lu.bench = lu.bench.filter((x) => x !== id); if (old) lu.bench.unshift(old); lu.bench = lu.bench.slice(0, 7); }
    lu.xi[i] = id; persist(); closeModal(); hub();
  }));
}

// ---------------------------------------------------------------- 이적시장
const MK = { view: "clubs", pos: "ALL", sort: "value", max: 0 };
function tabMarket(el) {
  const open = C.windowOpen(S), me = C.club(S, C.MY);
  let list = S.players.filter((p) => p.club !== C.MY && (MK.view === "fa" ? !p.club : !!p.club));
  if (MK.pos !== "ALL") list = list.filter((p) => p.pos === MK.pos);
  if (MK.max) list = list.filter((p) => marketValue(p) <= MK.max);
  const so = { value: (a, b) => marketValue(b) - marketValue(a), ovr: (a, b) => ovr(b) - ovr(a), age: (a, b) => a.age - b.age, pot: (a, b) => (b.pot || 0) - (a.pot || 0) };
  list.sort(so[MK.sort]); const shown = list.slice(0, 80);
  el.innerHTML = phaseBox() + (S.offers.length ? `<div class="card"><h3>📨 받은 제안</h3>${offersHTML()}</div>` : "") +
    `<div class="card">${open ? "" : `<div class="msg ct" style="margin-top:0">이적시장이 닫혀 있어요. 둘러볼 수는 있고, 제안은 ${S.md < 9 ? "겨울 이적시장(9라운드 뒤)" : "시즌 끝 FA·여름 이적시장"}에 할 수 있어요.</div>`}
      <div class="seg"><button class="sm ${MK.view === "clubs" ? "on" : ""}" data-v="clubs">구단 선수 (이적·트레이드)</button><button class="sm ${MK.view === "fa" ? "on" : ""}" data-v="fa">자유 계약 FA</button></div>
      <div class="row" style="margin-top:8px"><select id="fPos"><option value="ALL">모든 자리</option>${POS_ORDER.map((p) => `<option ${MK.pos === p ? "selected" : ""} value="${p}">${p} ${POS_KO[p]}</option>`).join("")}</select>
        <select id="fSort">${[["value", "가치 높은 순"], ["ovr", "종합 높은 순"], ["pot", "잠재력 순"], ["age", "어린 순"]].map(([k, n]) => `<option ${MK.sort === k ? "selected" : ""} value="${k}">${n}</option>`).join("")}</select>
        <select id="fMax"><option value="0">가격 제한 없음</option>${[2e6, 5e6, 10e6, 20e6, 40e6].map((v) => `<option ${MK.max === v ? "selected" : ""} value="${v}">${money(v)} 이하</option>`).join("")}</select></div>
      <table style="margin-top:8px"><tr><th>자리</th><th>이름</th><th class="n">나이</th><th class="n">종합</th><th class="n">가치</th><th>구단</th></tr>
      ${shown.map((p) => playerRow(p, `<td class="sub">${p.club ? esc(C.club(S, p.club).short) : "FA"}</td>`)).join("")}</table>
      <p class="sub" style="margin-top:6px">${list.length}명 중 ${shown.length}명 · 운영비 ${money(me.budget)}</p></div>`;
  bindDay(); bindOffers();
  el.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => { MK.view = b.dataset.v; hub(); }));
  $("fPos").onchange = (e) => { MK.pos = e.target.value; hub(); }; $("fSort").onchange = (e) => { MK.sort = e.target.value; hub(); }; $("fMax").onchange = (e) => { MK.max = +e.target.value; hub(); };
  el.querySelectorAll("tr[data-p]").forEach((tr) => (tr.onclick = () => offerModal(tr.dataset.p)));
}
function offerModal(pid, preset) {
  const p = C.player(S, pid), me = C.club(S, C.MY), open = C.windowOpen(S);
  if (!p.club) {   // FA
    const bonus = Math.round(marketValue(p) * 0.12 / 25e3) * 25e3;
    modal(playerHead(p) + `<div class="kv"><span>계약금</span><b>${money(bonus)}</b></div><div class="kv"><span>원하는 주급</span><b>${money(C.wageDemand(S, p))}</b></div>
      <div class="row" style="margin-top:12px"><button class="big" id="mSign" ${open ? "" : "disabled"}>✍ 자유 계약 영입</button><button class="sm" id="mClose">닫기</button></div><div id="mMsg"></div>`);
    $("mSign").onclick = () => { const r = C.signFA(S, pid); persist(); $("mMsg").innerHTML = `<div class="msg ${r.ok ? "ok" : "no"}">${esc(r.msg)}</div>`; if (r.ok) setTimeout(() => { closeModal(); hub(); }, 900); };
    $("mClose").onclick = closeModal; return;
  }
  const val = marketValue(p), step = val > 20e6 ? 1e6 : val > 4e6 ? 250e3 : 50e3;
  let fee = preset?.fee ?? Math.min(me.budget, Math.round(val / step) * step); const swaps = new Set(preset?.swaps || []);
  const mine = C.squad(S, C.MY).sort((a, b) => marketValue(b) - marketValue(a));
  const render = () => {
    const swapVal = [...swaps].reduce((s, id) => s + marketValue(C.player(S, id)), 0);
    modal(playerHead(p) + `<div class="kv"><span>원하는 주급</span><b>${money(C.wageDemand(S, p))}</b></div>
      <div class="lbl">이적료 제안: <b style="color:var(--gold);font-size:16px" id="fv">${money(fee)}</b> <span class="sub">(운영비 ${money(me.budget)})</span></div>
      <input type="range" id="fee" min="0" max="${Math.max(step, Math.floor(me.budget / step) * step)}" step="${step}" value="${fee}">
      <div class="lbl">트레이드 — 함께 보낼 내 선수 (최대 2명, 선택 가치 ${money(swapVal)})</div>
      <div style="max-height:170px;overflow:auto">${mine.map((q) => `<label class="chk"><input type="checkbox" data-sw="${q.id}" ${swaps.has(q.id) ? "checked" : ""}> ${posTag(q.pos)} ${esc(q.name)} <span class="sub">${ovr(q)} · ${money(marketValue(q))}</span></label>`).join("")}</div>
      <div class="row" style="margin-top:12px"><button class="big" id="mOffer" ${open ? "" : "disabled"}>📨 제안하기</button><button class="sm" id="mClose">닫기</button></div><div id="mMsg">${open ? "" : `<div class="msg ct">이적시장이 열리면 제안할 수 있어요.</div>`}</div>`);
    $("fee").oninput = (e) => { fee = +e.target.value; $("fv").textContent = money(fee); };
    $("modal").querySelectorAll("[data-sw]").forEach((c) => (c.onchange = () => { if (c.checked) { if (swaps.size >= 2) { c.checked = false; return toast("트레이드 선수는 2명까지"); } swaps.add(c.dataset.sw); } else swaps.delete(c.dataset.sw); render(); }));
    $("mOffer").onclick = () => {
      const r = C.makeOffer(S, pid, fee, [...swaps]); persist();
      const cls = r.result === "accept" ? "ok" : r.result === "counter" ? "ct" : "no";
      $("mMsg").innerHTML = `<div class="msg ${cls}">${esc(r.msg)}</div>` + (r.result === "counter" && r.counter <= me.budget ? `<button class="big green" id="mCounter" style="width:100%;margin-top:8px">역제안 받아들이기 (${money(r.counter)})</button>` : "");
      if (r.result === "accept") setTimeout(() => { closeModal(); hub(); }, 1100);
      const cb = $("mCounter"); if (cb) cb.onclick = () => { const r2 = C.makeOffer(S, pid, r.counter, [...swaps]); persist(); $("mMsg").innerHTML = `<div class="msg ${r2.ok ? "ok" : "no"}">${esc(r2.msg)}</div>`; if (r2.ok) setTimeout(() => { closeModal(); hub(); }, 1100); };
    };
    $("mClose").onclick = closeModal;
  };
  render();
}

// ---------------------------------------------------------------- 순위·소식
function tabTable(el) {
  const tb = C.standings(S);
  const scorers = S.players.filter((p) => p.club && p.sg).sort((a, b) => b.sg - a.sg).slice(0, 8);
  const md = S.fixtures[Math.min(S.md, S.fixtures.length - 1)];
  el.innerHTML = phaseBox() + `<div class="card"><h3>${C.seasonLabel(S)} 퓨어 리그</h3><table><tr><th>#</th><th>구단</th><th class="n">경기</th><th class="n">승</th><th class="n">무</th><th class="n">패</th><th class="n">득실</th><th class="n">승점</th></tr>
    ${tb.map((r, i) => `<tr class="${r.c.id === C.MY ? "me" : ""}"><td>${i + 1}</td><td>${esc(r.c.name)}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gf - r.ga}</td><td class="n"><b>${r.pts}</b></td></tr>`).join("")}</table></div>
    <div class="card"><h3>득점 순위</h3>${scorers.map((p, i) => `<div class="kv"><span>${i + 1}. ${faceImg(p)} ${esc(p.name)} <span class="sub">${esc(C.club(S, p.club).short)}</span></span><b>${p.sg}골</b></div>`).join("") || `<p class="sub">아직 골이 없어요</p>`}</div>
    ${S.phase === "league" && md ? `<div class="card"><h3>${S.md + 1}라운드 대진</h3>${md.map((f) => `<div class="kv"><span>${esc(C.club(S, f.h).name)} vs ${esc(C.club(S, f.a).name)}</span></div>`).join("")}</div>` : ""}
    ${S.history.length ? `<div class="card"><h3>지난 시즌</h3>${S.history.map((h) => `<div class="kv"><span>${h.season} 우승 ${esc(h.champion)} · 득점왕 ${esc(h.topScorer)}</span><b>우리 ${h.myRank}위</b></div>`).join("")}</div>` : ""}`;
  bindDay();
}
function tabNews(el) {
  el.innerHTML = phaseBox() + `<div class="card"><h3>재정</h3><div class="kv"><span>운영비</span><b>${money(C.club(S, C.MY).budget)}</b></div><div class="kv"><span>주급 합계</span><b>${money(C.payroll(S, C.MY))} / 주</b></div>
      ${S.fin.slice(0, 14).map((f) => `<div class="kv"><span class="sub">${esc(f.what)}</span><b style="color:${f.amount >= 0 ? "var(--green)" : "var(--red)"}">${f.amount >= 0 ? "+" : ""}${money(f.amount)}</b></div>`).join("")}</div>
    <div class="card"><h3>소식</h3>${S.news.slice(0, 40).map((n) => `<div class="newsl ${n.kind}">${esc(n.text)}</div>`).join("")}</div>`;
  bindDay();
}

// ---------------------------------------------------------------- 경기
let G = null;   // 지금 경기 { m, mode:"career"|"friendly"|"host"|"guest", me, ... }
function teamFromClub(clubObj, players, lineup, tactic) {
  const xi = lineup.xi.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  return { name: clubObj.name, short: clubObj.short, c1: clubObj.c1, c2: clubObj.c2, formation: tactic.formation, tactic: { ...tactic }, players: xi };
}
function playCareerMatch() {
  const f = C.nextFixture(S); if (!f) return;
  const oppId = f.h === C.MY ? f.a : f.h;
  for (const id of [C.MY, oppId]) C.fixLineup(S, id);
  const A = teamFromClub(C.club(S, C.MY), C.squad(S, C.MY), S.lineups[C.MY], S.tactics[C.MY]);
  const B = fixKits(A, teamFromClub(C.club(S, oppId), C.squad(S, oppId), S.lineups[oppId], S.tactics[oppId]));
  if (A.players.length < 11 || B.players.length < 11) return toast("선발 11명이 모자라요 — 전술에서 자동 배치를 눌러 주세요");
  startMatch({ teams: [A, B], human: [true, false], mode: "career", fixture: f });
}
function friendly() {
  const w = S ? { clubs: S.clubs, players: S.players } : makeWorld();
  let a = 0, b = 1, vs = "cpu";
  const draw = () => {
    app.innerHTML = `<div class="title" style="padding-top:10px"><small>FRIENDLY</small><h1>친선 경기</h1><p>두 구단을 고르세요. 둘이서는 PC 키보드로(1P WASD·F·G·H, 2P 방향키·M·,·.)</p></div>
      <div class="card"><div class="seg"><button class="sm ${vs === "cpu" ? "on" : ""}" data-vs="cpu">컴퓨터와</button><button class="sm ${vs === "2p" ? "on" : ""}" data-vs="2p">둘이서 (키보드)</button></div>
      <div class="lbl">내 팀 (아래쪽)</div><select id="sa" style="width:100%">${w.clubs.map((c, i) => `<option value="${i}" ${i === a ? "selected" : ""}>${esc(c.name)}${c.my ? " (MY TEAM)" : ""}</option>`).join("")}</select>
      <div class="lbl">상대 팀 (위쪽)</div><select id="sb" style="width:100%">${w.clubs.map((c, i) => `<option value="${i}" ${i === b ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      <div class="stack"><button class="big" id="bGo">킥오프</button><button class="sm" id="bBack">처음으로</button></div>`;
    app.querySelectorAll("[data-vs]").forEach((x) => (x.onclick = () => { vs = x.dataset.vs; draw(); }));
    $("sa").onchange = (e) => (a = +e.target.value); $("sb").onchange = (e) => (b = +e.target.value);
    $("bGo").onclick = () => {
      if (a === b) return toast("서로 다른 구단을 골라 주세요");
      const mk = (c) => { const sq = w.players.filter((p) => p.club === c.id); const tac = S && S.tactics[c.id] ? S.tactics[c.id] : DEFAULT_TACTIC; const lu = c.my && S ? C.fixLineup(S, c.id) : autoLineup(sq, tac.formation); return teamFromClub(c, sq, lu, tac); };
      const A = mk(w.clubs[a]); startMatch({ teams: [A, fixKits(A, mk(w.clubs[b]))], human: [true, vs === "2p"], mode: "friendly", local2p: vs === "2p" });
    };
    $("bBack").onclick = title;
  };
  draw();
}
const cv = $("cv"), ctx = cv.getContext("2d");
function sizeCanvas() { const r = $("pitch").getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); return { w: r.width, h: r.height, d }; }
function startMatch(o) {
  app.hidden = true; $("matchView").hidden = false; closeModal();
  const m = o.m || new Match({ teams: o.teams, human: o.human, halfSec: o.halfSec || OPT.halfSec, diff: OPT.diff, onEvent: (e) => onEvent(e) });
  G = { m, mode: o.mode, me: o.me ?? 0, fixture: o.fixture, local2p: !!o.local2p, net: o.net || null, flip: !!o.flip, acc: 0, last: performance.now(), sendT: 0, paused: false, ended: false };
  $("tA").textContent = m.teams[0].short || m.teams[0].name; $("tB").textContent = m.teams[1].short || m.teams[1].name;
  $("tA").style.background = m.teams[0].c1; $("tA").style.color = lum(m.teams[0].c1) > 0.6 ? "#111" : "#fff";
  $("tB").style.background = m.teams[1].c1; $("tB").style.color = lum(m.teams[1].c1) > 0.6 ? "#111" : "#fff";
  $("ctrl").style.display = G.local2p ? "none" : "";
  banner("킥오프!", `${m.teams[0].name} vs ${m.teams[1].name}`);
  requestAnimationFrame(loop);
}
let bannerT = 0;
function banner(big, small = "") { const b = $("banner"); b.innerHTML = `${esc(big)}<small>${esc(small)}</small>`; b.hidden = false; b.style.animation = "none"; void b.offsetWidth; b.style.animation = ""; clearTimeout(bannerT); bannerT = setTimeout(() => (b.hidden = true), 1800); }
function onEvent(e) {
  if (G && G.net && G.mode === "host") G.net.send({ k: "ev", e: { type: e.type, text: e.text, team: e.team } });
  if (e.type === "goal") banner("⚽ 골!", e.name ? `${e.name} (${e.t}')` : "");
  else if (e.type === "save") banner("🧤 " + e.text);
  else if (e.type === "half") banner("전반 끝", "곧 후반이 시작돼요");
  else if (e.type === "corner" || e.type === "goalkick") { /* 조용히 */ }
}
function loop(now) {
  if (!G) return;
  const dt = Math.min(0.05, (now - G.last) / 1000); G.last = now;
  const m = G.m;
  if (!G.paused && !G.ended) {
    if (G.mode === "guest") { m.smooth(dt); sendGuestInput(dt); }
    else {
      applyLocalInput();
      G.acc += dt; while (G.acc >= 1 / 60) { m.step(1 / 60); G.acc -= 1 / 60; }
      if (G.net && G.mode === "host") { G.sendT += dt; if (G.sendT > 0.05) { G.sendT = 0; G.net.send({ k: "s", a: m.snap() }); } }
    }
    if (m.phase === "end" && !G.ended) { G.ended = true; setTimeout(endMatch, 900); }
  }
  const { w, h, d } = sizeCanvas(); ctx.setTransform(d, 0, 0, d, 0, 0);
  drawMatch(ctx, m, { w, h, flip: G.flip, faces: FACES, me: G.me, scale: Math.min(w / 44, h / 60) });
  $("sA").textContent = m.score[0]; $("sB").textContent = m.score[1]; $("clock").textContent = `${m.minute()}'`;
  requestAnimationFrame(loop);
}
// ---- 입력: 터치 조이스틱 + 버튼 + 키보드
const IN = { mx: 0, my: 0, sprint: false, pass: false, shoot: false };
const IN2 = { mx: 0, my: 0, sprint: false, pass: false, shoot: false };
const keys = new Set();
let joy = null;
$("joyzone").addEventListener("pointerdown", (e) => { e.preventDefault(); const r = $("pitch").getBoundingClientRect(); joy = { id: e.pointerId, x: e.clientX, y: e.clientY }; const j = $("joy"); j.hidden = false; j.style.left = (e.clientX - r.left) + "px"; j.style.top = Math.min(r.height - 60, e.clientY - r.top) + "px"; try { $("joyzone").setPointerCapture(e.pointerId); } catch (_) {} });
$("joyzone").addEventListener("pointermove", (e) => { if (!joy || joy.id !== e.pointerId) return; let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const L = Math.hypot(dx, dy), k = Math.min(1, L / 50); if (L > 0) { IN.mx = dx / L * k; IN.my = dy / L * k; } $("joy").firstElementChild.style.transform = `translate(${Math.max(-32, Math.min(32, dx))}px,${Math.max(-32, Math.min(32, dy))}px)`; });
const joyEnd = (e) => { if (!joy || joy.id !== e.pointerId) return; joy = null; IN.mx = IN.my = 0; $("joy").hidden = true; $("joy").firstElementChild.style.transform = ""; };
$("joyzone").addEventListener("pointerup", joyEnd); $("joyzone").addEventListener("pointercancel", joyEnd);
const hold = (id, key) => { const b = $(id); const on = (e) => { e.preventDefault(); b.classList.add("down"); if (key === "sprint") IN.sprint = true; else IN[key] = true; }; const off = () => { b.classList.remove("down"); if (key === "sprint") IN.sprint = false; };
  b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off); };
hold("bPass", "pass"); hold("bShoot", "shoot"); hold("bSprint", "sprint");
addEventListener("keydown", (e) => {
  if (!G) return; const k = e.key.toLowerCase(); if (keys.has(k)) return; keys.add(k);
  if (G.local2p) { if (k === "f") IN.pass = true; if (k === "g") IN.shoot = true; if (k === "m") IN2.pass = true; if (k === ",") IN2.shoot = true; }
  else { if (k === "j" || k === " ") IN.pass = true; if (k === "k" || k === "x") IN.shoot = true; }
  if (k === "escape" || k === "p") togglePause();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
function keyVec(up, down, left, right) { let x = 0, y = 0; if (keys.has(left)) x--; if (keys.has(right)) x++; if (keys.has(up)) y--; if (keys.has(down)) y++; const L = Math.hypot(x, y); return L ? [x / L, y / L] : [0, 0]; }
function readInput() {   // 화면 기준 입력 → 1P(·2P)
  let a = [IN.mx, IN.my], s1 = IN.sprint;
  if (G.local2p) { const v = keyVec("w", "s", "a", "d"); if (v[0] || v[1]) a = v; s1 = s1 || keys.has("h"); }
  else { const v1 = keyVec("arrowup", "arrowdown", "arrowleft", "arrowright"), v2 = keyVec("w", "s", "a", "d"); const v = v1[0] || v1[1] ? v1 : v2; if (v[0] || v[1]) a = v; s1 = s1 || keys.has("shift") || keys.has("l"); }
  const out = [{ mx: a[0], my: a[1], sprint: s1, pass: IN.pass, shoot: IN.shoot }]; IN.pass = IN.shoot = false;
  if (G.local2p) { const v = keyVec("arrowup", "arrowdown", "arrowleft", "arrowright"); out.push({ mx: v[0], my: v[1], sprint: keys.has("."), pass: IN2.pass, shoot: IN2.shoot }); IN2.pass = IN2.shoot = false; }
  return out;
}
function feed(inp, src, flip) {
  const f = flip ? -1 : 1; inp.mx = src.mx * f; inp.my = src.my * f; inp.moving = Math.hypot(src.mx, src.my) > 0.15; inp.sprint = !!src.sprint;
  if (src.pass) inp.passQ = true; if (src.shoot) inp.shootQ = true;
}
function applyLocalInput() {
  const r = readInput(); feed(G.m.input[0], r[0], false);
  if (G.local2p && r[1]) feed(G.m.input[1], r[1], false);
}
let guestSeqT = 0;
function sendGuestInput(dt) {
  guestSeqT += dt; const r = readInput()[0];
  if (r.pass || r.shoot || guestSeqT > 0.05) { guestSeqT = 0; G.net.send({ k: "in", mx: +r.mx.toFixed(2), my: +r.my.toFixed(2), sp: r.sprint ? 1 : 0, p: r.pass ? 1 : 0, s: r.shoot ? 1 : 0 }); }
}
$("btnPause").onclick = () => togglePause();
function togglePause() {
  if (!G || G.ended) return;
  if (G.net) { modal(`<h2>온라인 경기</h2><p class="sub">온라인 경기는 멈출 수 없어요.</p><div class="row" style="margin-top:12px"><button class="sm red" id="mQuit">경기 나가기</button><button class="sm" id="mBack">계속</button></div>`); $("mQuit").onclick = () => { closeModal(); quitMatch(); }; $("mBack").onclick = closeModal; return; }
  G.paused = true;
  modal(`<h2>잠깐 멈춤</h2><div class="kv"><span>점수</span><b>${G.m.score[0]} : ${G.m.score[1]}</b></div><div class="kv"><span>슛</span><b>${G.m.stats.shots[0]} : ${G.m.stats.shots[1]}</b></div>
    <div class="row" style="margin-top:12px"><button class="big" id="mRes">계속</button><button class="sm red" id="mQuit">${G.mode === "career" ? "나가기(빠른 결과로 처리)" : "나가기"}</button></div>`);
  $("mRes").onclick = () => { closeModal(); G.paused = false; G.last = performance.now(); };
  $("mQuit").onclick = () => { closeModal(); if (G.mode === "career") { G = null; const res = C.playMatchday(S); persist(); showResults(res); } else quitMatch(); };
}
function quitMatch() { if (G && G.net) G.net.close(); G = null; $("matchView").hidden = true; if (S && false) hub(); title(); }
function endMatch() {
  const m = G.m, mode = G.mode;
  const poss = m.stats.poss, pt = poss[0] + poss[1] || 1;
  const stat = `<div class="kv"><span>슛 (유효)</span><b>${m.stats.shots[0]}(${m.stats.onTarget[0]}) : ${m.stats.shots[1]}(${m.stats.onTarget[1]})</b></div><div class="kv"><span>점유율</span><b>${Math.round(poss[0] / pt * 100)}% : ${Math.round(poss[1] / pt * 100)}%</b></div><div class="kv"><span>패스</span><b>${m.stats.passes[0]} : ${m.stats.passes[1]}</b></div>`;
  const goals = m.events.filter((e) => e.type === "goal").map((e) => `${e.t}' ${e.team === 0 ? "◀" : "▶"} ${esc(e.name || "")}`).join("<br>");
  if (mode === "career") {
    const f = G.fixture, home = f.h === C.MY;
    const score = home ? [m.score[0], m.score[1]] : [m.score[1], m.score[0]];
    const scorers = m.events.filter((e) => e.type === "goal" && e.scorer).map((e) => e.scorer);
    G = null; const res = C.playMatchday(S, { score, scorers }); persist();
    const gf = m.score[0], ga = m.score[1];
    $("matchView").hidden = true; app.hidden = false; hub();
    showResults(res, `${gf > ga ? "🟢 승리!" : gf < ga ? "🔴 패배" : "⚪ 무승부"} ${m.teams[0].name} ${gf} : ${ga} ${m.teams[1].name}<br>${goals}<br>${stat}`);
    return;
  }
  if (G.net && G.mode === "host") G.net.send({ k: "end", score: m.score });
  const net = G.net; G = null; if (net) setTimeout(() => net.close(), 500);
  $("matchView").hidden = true; app.hidden = false; title();
  modal(`<h2>경기 끝 ${m.score[0]} : ${m.score[1]}</h2><p class="sub">${esc(m.teams[0].name)} vs ${esc(m.teams[1].name)}</p><div class="msg">${goals || "골 없음"}</div>${stat}<button class="big" id="mOk" style="width:100%;margin-top:12px">확인</button>`);
  $("mOk").onclick = closeModal;
}

// ---------------------------------------------------------------- 온라인 1:1
// 색이 겹치면 원정 유니폼(두 번째 팀만 바꿈)
const AWAY = [["#1d4ed8", "#ffffff"], ["#ffffff", "#e63946"], ["#111827", "#ffd34a"], ["#16a34a", "#ffffff"]];
function colorDist(a, b) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.abs((x >> 16) - (y >> 16)) + Math.abs(((x >> 8) & 255) - ((y >> 8) & 255)) + Math.abs((x & 255) - (y & 255)); }
function fixKits(A, B) {
  if (colorDist(A.c1, B.c1) > 160) return B;
  const alt = AWAY.find(([c]) => colorDist(c, A.c1) > 200) || AWAY[0];
  return { ...B, c1: alt[0], c2: alt[1], name: A.name === B.name ? B.name + " (원정)" : B.name };
}
let onlinePick = "my";
function myOnlineTeam() {
  if (S && onlinePick === "my") { const c = C.club(S, C.MY); C.fixLineup(S, C.MY); return teamFromClub(c, C.squad(S, C.MY), S.lineups[C.MY], S.tactics[C.MY]); }
  const w = makeWorld(); const c = w.clubs.find((x) => x.id === onlinePick) || w.clubs[0]; const sq = w.players.filter((p) => p.club === c.id); return teamFromClub(c, sq, autoLineup(sq, DEFAULT_TACTIC.formation), DEFAULT_TACTIC);
}
function online() {
  if (!S && onlinePick === "my") onlinePick = "light";
  const t = myOnlineTeam(), w = makeWorld();
  app.innerHTML = `<div class="title" style="padding-top:10px"><small>ONLINE</small><h1>친구와 <b>온라인 대전</b></h1><p>한 사람이 방을 만들고 코드를 알려 주면, 다른 사람이 코드로 들어와요. 둘 다 화면을 켜 둔 채로 해 주세요.</p></div>
    <div class="card"><div class="lbl" style="margin-top:0">내 팀</div><select id="oTeam" style="width:100%">${S ? `<option value="my" ${onlinePick === "my" ? "selected" : ""}>${esc(C.club(S, C.MY).name)} (커리어 MY TEAM · 종합 ${C.rating(S, C.MY)})</option>` : ""}${w.clubs.map((c) => `<option value="${c.id}" ${onlinePick === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
    <div class="stack"><button class="big green" id="bHost">방 만들기</button>
      <div class="card"><div class="lbl" style="margin-top:0">방 코드로 참가</div><div class="row"><input type="text" id="iCode" maxlength="6" placeholder="예: K7PQ2" style="flex:1;text-transform:uppercase"><button class="big alt" id="bJoin">참가</button></div></div>
      <button class="sm" id="bBack">처음으로</button></div><div id="onMsg"></div>`;
  $("bBack").onclick = title;
  $("oTeam").onchange = (e) => { onlinePick = e.target.value; online(); };
  $("bHost").onclick = () => hostRoom(t);
  $("bJoin").onclick = () => { const code = $("iCode").value.trim().toUpperCase(); if (code.length < 4) return toast("코드를 넣어 주세요"); joinRoom(code, t); };
}
function hostRoom(myTeam) {
  const code = makeCode(); let guestTeam = null;
  app.innerHTML = `<div class="title"><small>ONLINE · 방장</small><h1>방 코드</h1></div><div class="code">${code}</div><p class="sub" style="text-align:center">친구에게 이 코드를 알려 주세요. 들어오면 바로 시작해요.</p><div class="stack"><button class="sm" id="bBack">취소</button></div><div class="msg" id="st">서버에 연결하는 중…</div>`;
  const net = connect(code, "host", {
    open: () => ($("st").textContent = "친구를 기다리는 중…"),
    msg: (mm) => {
      if (mm.k === "peer") net.send({ k: "hello", team: myTeam });
      if (mm.k === "hello") { guestTeam = mm.team; net.send({ k: "hello", team: myTeam }); beginHost(); }
      if (mm.k === "in" && G && G.mode === "host") { feed(G.m.input[1], { mx: mm.mx, my: mm.my, sprint: mm.sp, pass: mm.p, shoot: mm.s }, true); }
      if (mm.k === "left" && G) { toast("친구가 나갔어요"); G.ended = true; setTimeout(quitMatch, 1500); }
    },
    close: () => { if (!G) { const s = $("st"); if (s) s.textContent = "연결이 끊겼어요."; } },
    error: () => { const s = $("st"); if (s) s.textContent = "서버에 연결하지 못했어요."; },
  });
  let started = false;
  function beginHost() {
    if (started || !guestTeam) return; started = true;
    const seed = Math.floor(Math.random() * 1e9);
    guestTeam = fixKits(myTeam, guestTeam);
    net.send({ k: "start", teams: [myTeam, guestTeam], halfSec: OPT.halfSec, seed });
    startMatch({ teams: [myTeam, guestTeam], human: [true, true], mode: "host", net, me: 0 });
  }
  $("bBack").onclick = () => { net.close(); online(); };
}
function joinRoom(code, myTeam) {
  app.innerHTML = `<div class="title"><small>ONLINE · 참가</small><h1>${code}</h1></div><div class="msg" id="st">연결하는 중…</div><div class="stack"><button class="sm" id="bBack">취소</button></div>`;
  const net = connect(code, "guest", {
    open: () => { $("st").textContent = "방장을 기다리는 중…"; net.send({ k: "hello", team: myTeam }); },
    msg: (mm) => {
      if (mm.k === "peer") net.send({ k: "hello", team: myTeam });
      if (mm.k === "start") {
        const m = new Match({ teams: mm.teams, human: [true, true], halfSec: mm.halfSec, diff: 1 });
        startMatch({ m, mode: "guest", net, me: 1, flip: true });
      }
      if (mm.k === "s" && G && G.mode === "guest") G.m.applySnap(mm.a);
      if (mm.k === "ev" && G) onEvent({ ...mm.e, t: G.m.minute() });
      if (mm.k === "end" && G) { G.m.phase = "end"; }
      if (mm.k === "left" && G) { toast("방장이 나갔어요"); G.ended = true; setTimeout(quitMatch, 1500); }
    },
    close: () => { if (!G) { const s = $("st"); if (s) s.textContent = "연결이 끊겼어요. 코드를 확인해 주세요."; } },
    error: () => { const s = $("st"); if (s) s.textContent = "서버에 연결하지 못했어요."; },
  });
  $("bBack").onclick = () => { net.close(); online(); };
}

// ---------------------------------------------------------------- 시작
const hp = new URLSearchParams(location.hash.slice(1));
if (hp.has("demo")) {   // 개발: #demo 컴퓨터끼리 경기 화면 · #demo&human
  const w = makeWorld(); const mk = (c) => { const sq = w.players.filter((p) => p.club === c.id); return teamFromClub(c, sq, autoLineup(sq, "4-3-3"), DEFAULT_TACTIC); };
  OPT.halfSec = Number(hp.get("half")) || OPT.halfSec;
  startMatch({ teams: [mk(w.clubs[0]), mk(w.clubs[1])], human: [hp.has("human"), false], mode: "friendly" });
} else title();
window.__fc = { get S() { return S; }, get G() { return G; }, C };
