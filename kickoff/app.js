(function () {
  "use strict";
  var D = window.KO, app = document.getElementById("app");
  var TAGS = {
    rumor: ["🔥", "루머"], gossip: ["💬", "주변 이야기"], news: ["📰", "소식"],
    interview: ["🎙", "인터뷰"], official: ["✅", "공식"], story: ["📖", "스토리"]
  };
  var TIERS = ["공식", "1등급", "2등급", "3등급"];

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s).toLowerCase().replace(/[\s\-·.]/g, ""); }
  function store(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null");
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { return null; }
  }
  var follows = store("ko_follows") || ["son", "lee_ki", "kim_mj"];

  function avatar(pid, cls) {
    var p = D.players[pid], t = D.teams[p.team];
    return '<span class="avatar ' + (cls || "") + '" style="background:' + t.color + '">' + p.init + "</span>";
  }
  function teamAvatar(tid, cls) {
    var t = D.teams[tid];
    return '<span class="avatar ' + (cls || "") + '" style="background:' + t.color + '">' + esc(t.name.slice(0, 2)) + "</span>";
  }

  function card(f) {
    var tg = TAGS[f.type];
    var h = '<article class="card"><div class="card-top"><span class="tag tag-' + f.type + '">' + tg[0] + " " + tg[1] + "</span>";
    if (f.tier !== undefined) h += '<span class="tier tier-' + f.tier + '">신뢰도 ' + TIERS[f.tier] + "</span>";
    h += '<span class="time">' + esc(f.time) + "</span></div>";
    h += "<h3>" + esc(f.title) + "</h3><p>" + esc(f.sum) + "</p>";
    h += '<div class="who">' + f.players.map(function (id) {
      return '<a href="#/player/' + id + '">' + avatar(id, "sm") + esc(D.players[id].name) + "</a>";
    }).join("") + "</div>";
    if (f.timeline) {
      h += '<details class="tl"><summary>루머 타임라인 보기</summary><ol>' + f.timeline.map(function (t) {
        return "<li><b>" + esc(t[0]) + "</b>" + esc(t[1]) + "</li>";
      }).join("") + "</ol></details>";
    }
    h += '<div class="src">' + esc(f.src) + ' <span class="pill">샘플</span>' +
      (f.count > 1 ? "<span>매체 " + f.count + "곳 보도</span>" : "") +
      '<span class="orig" title="실서비스에서는 원문 기사로 연결됩니다">원문 ↗</span></div></article>';
    return h;
  }
  function feedHtml(items) {
    return items.length ? '<div class="feed">' + items.map(card).join("") + "</div>" : '<p class="empty">아직 소식이 없습니다.</p>';
  }
  function tabsHtml(list, cur, attr) {
    return '<div class="tabs">' + list.map(function (t) {
      return '<button type="button" data-' + attr + '="' + t[0] + '" class="' + (t[0] === cur ? "on" : "") + '">' + t[1] + "</button>";
    }).join("") + "</div>";
  }
  function chips(ids) {
    return '<div class="chips">' + ids.map(function (id) {
      var p = D.players[id];
      return '<a class="chip" href="#/player/' + id + '">' + avatar(id) + "<span>" + esc(p.name) + "<small>" + esc(D.teams[p.team].name) + "</small></span></a>";
    }).join("") + "</div>";
  }

  /* ---------- 홈 ---------- */
  var homeFilter = "all";
  function home() {
    var items = D.feed.filter(function (f) { return homeFilter === "all" || f.type === homeFilter; });
    var hot = D.feed.filter(function (f) { return f.type === "rumor"; }).slice(0, 5);
    var next = D.matches.filter(function (m) { return m.score === "예정"; });
    app.innerHTML =
      '<h2 class="h">팔로우한 선수 <a class="more" href="#/players">선수 전체 →</a></h2>' +
      (follows.length ? chips(follows) : '<p class="empty">선수 페이지에서 ★ 팔로우를 눌러 보세요.</p>') +
      '<div class="grid two"><section>' +
      '<h2 class="h">오늘의 핫 루머 <a class="more" href="#/rumors">루머 보드 →</a></h2>' +
      '<div class="hot">' + hot.map(function (f) {
        return '<a href="#/player/' + f.players[0] + '"><b>' + esc(f.title) + "</b><small>" + TIERS[f.tier] + "</small></a>";
      }).join("") + "</div>" +
      '<h2 class="h">지금 뜨는 이야기</h2>' +
      tabsHtml([["all", "전체"], ["rumor", "루머"], ["gossip", "주변 이야기"], ["news", "소식"], ["interview", "인터뷰"]], homeFilter, "hf") +
      feedHtml(items) +
      '</section><aside class="side"><div class="side-box"><h2>다가오는 경기 (한국 시간)</h2>' +
      next.map(function (m) {
        return '<div class="mini"><span>' + esc(m.home) + " vs " + esc(m.away) + "</span><small>" + esc(m.date.slice(0, 5)) + " " + m.time + "</small></div>";
      }).join("") +
      '<a class="btn" href="#/stats">경기·스탯 센터 →</a></div>' +
      '<div class="side-box"><h2>루머 신뢰도 등급</h2>' +
      '<div class="mini"><span>공식</span><small>구단·리그 발표</small></div>' +
      '<div class="mini"><span>1등급</span><small>정확도가 검증된 기자</small></div>' +
      '<div class="mini"><span>2등급</span><small>주요 일간지</small></div>' +
      '<div class="mini"><span>3등급</span><small>출처가 불분명</small></div></div></aside></div>';
    app.querySelectorAll("[data-hf]").forEach(function (b) {
      b.onclick = function () { homeFilter = b.dataset.hf; home(); };
    });
  }

  /* ---------- 루머 보드 ---------- */
  var rumorTier = "all";
  function rumors() {
    var items = D.feed.filter(function (f) {
      return (f.type === "rumor" || f.type === "official") && (rumorTier === "all" || String(f.tier) === rumorTier);
    });
    app.innerHTML = '<h2 class="h">이적 루머 보드 <small>신뢰도 등급으로 걸러 보기</small></h2>' +
      tabsHtml([["all", "전체"], ["0", "공식"], ["1", "1등급"], ["2", "2등급"], ["3", "3등급"]], rumorTier, "rt") + feedHtml(items);
    app.querySelectorAll("[data-rt]").forEach(function (b) {
      b.onclick = function () { rumorTier = b.dataset.rt; rumors(); };
    });
  }

  /* ---------- 선수 목록 ---------- */
  function players() {
    app.innerHTML = '<h2 class="h">선수 <small>이름을 누르면 선수 페이지로 갑니다</small></h2><div class="feed">' +
      Object.keys(D.players).map(function (id) {
        var p = D.players[id], t = D.teams[p.team];
        return '<a class="hero" href="#/player/' + id + '">' + avatar(id, "big") + "<div><h1>" + esc(p.name) + "<small>" + esc(p.en) + '</small></h1><p class="meta">' +
          esc(t.full) + " · " + esc(p.pos) + " · " + esc(p.role.title) + "</p></div></a>";
      }).join("") + "</div>";
  }

  /* ---------- 선수 페이지 ---------- */
  var pTab = "rumor";
  function player(id) {
    var p = D.players[id];
    if (!p) return notFound();
    var t = D.teams[p.team];
    var mine = D.feed.filter(function (f) { return f.players.indexOf(id) >= 0; });
    var clubNews = mine.filter(function (f) { return f.club; });
    var rest = mine.filter(function (f) { return !f.club; });
    var isF = follows.indexOf(id) >= 0;

    var h = '<section class="hero">' + avatar(id, "big") +
      "<div><h1>" + esc(p.name) + "<small>" + esc(p.en) + '</small></h1><p class="meta"><a href="#/team/' + p.team + '">' + esc(t.full) + "</a> · " +
      esc(t.league) + " · " + esc(p.pos) + (p.num ? " · 등번호 " + p.num : "") + "</p></div>" +
      '<div class="acts"><button type="button" class="btn ' + (isF ? "on" : "") + '" id="fol">' + (isF ? "★ 팔로우 중" : "☆ 팔로우") + "</button></div></section>";

    // 1. 소속팀에서
    h += '<h2 class="h">' + esc(t.name) + '에서의 역할 <small>편집 정리</small></h2>' +
      '<div class="card"><h3>' + esc(p.role.title) + "</h3><p>" + esc(p.role.desc) + '</p><ul class="pts">' +
      p.role.points.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";

    h += '<h2 class="h">팀 기여도 <small>이번 시즌 · <span class="pill">샘플</span></small></h2><div class="card bars">' +
      p.contrib.map(function (c) {
        return '<div class="bar"><div class="bar-top"><b>' + esc(c[0]) + "</b><span>" + c[1] + '%</span></div><div class="track"><i style="width:' + c[1] + '%"></i></div><small>' + esc(c[2]) + "</small></div>";
      }).join("") + "</div>";

    h += '<h2 class="h">소속팀 관련 최신 소식 <small>' + clubNews.length + "건</small></h2>" + feedHtml(clubNews);

    h += '<div id="wdc"></div>';

    // 2. 자료·경력
    h += '<h2 class="h">선수 자료</h2><div class="card"><dl class="kv">' +
      p.profile.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl></div>";
    h += '<h2 class="h">경력</h2><div class="card"><ol class="career">' +
      p.careerDetail.slice().reverse().map(function (c) {
        return "<li><b>" + esc(c[0]) + "</b><h3>" + esc(c[1]) + "</h3><p>" + esc(c[2]) + "</p></li>";
      }).join("") + "</ol></div>";
    h += '<h2 class="h">수상과 기록</h2><div class="card"><ul class="pts">' +
      p.honors.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";

    // 3. 그 밖의 이야기
    var tabs = [["rumor", "루머"], ["gossip", "주변 이야기"], ["interview", "인터뷰"], ["story", "스토리"]];
    h += '<h2 class="h">그 밖의 이야기</h2>' + tabsHtml(tabs, pTab, "pt");
    if (pTab === "story") {
      h += '<div class="feed">' + p.stories.map(function (s) {
        return '<article class="card storycard"><div class="card-top"><span class="tag tag-story">📖 스토리</span></div><h3>' + esc(s[0]) + "</h3><p>" + esc(s[1]) + "</p></article>";
      }).join("") + "</div>";
    } else {
      h += feedHtml(rest.filter(function (f) { return f.type === pTab; }));
    }

    h += '<a class="statlink" href="#/stats/players/' + id + '"><span>📊 ' + esc(p.name) + '의 스탯과 경기 기록<small>이번 시즌과 지난 시즌 비교는 경기·스탯 센터에 있습니다</small></span><b>보기 →</b></a>';
    app.innerHTML = h;

    window.KOWD.career(document.getElementById("wdc"), window.KOWD.QID[id]);
    document.getElementById("fol").onclick = function () {
      var i = follows.indexOf(id);
      if (i >= 0) follows.splice(i, 1); else follows.push(id);
      store("ko_follows", follows); player(id);
    };
    app.querySelectorAll("[data-pt]").forEach(function (b) {
      b.onclick = function () { pTab = b.dataset.pt; var y = window.scrollY; player(id); window.scrollTo(0, y); };
    });
  }

  /* ---------- 팀 페이지 ---------- */
  function team(id) {
    var t = D.teams[id];
    if (!t) return notFound();
    var squad = Object.keys(D.players).filter(function (pid) { return D.players[pid].team === id; });
    var news = D.feed.filter(function (f) { return f.players.some(function (pid) { return squad.indexOf(pid) >= 0; }); });
    app.innerHTML = '<section class="hero">' + teamAvatar(id, "big") + "<div><h1>" + esc(t.full) + '</h1><p class="meta">' + esc(t.league) + "</p></div></section>" +
      '<div id="wtl"></div><h2 class="h">한국 선수</h2>' + chips(squad) +
      '<h2 class="h">구단 정보</h2><div class="card"><dl class="kv">' + t.facts.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl></div>" +
      '<h2 class="h">팀 이야기</h2><div class="feed">' + t.story.map(function (s) {
        return '<article class="card storycard"><div class="card-top"><span class="tag tag-story">📖 스토리</span></div><h3>' + esc(s[0]) + "</h3><p>" + esc(s[1]) + "</p></article>";
      }).join("") + "</div>" +
      '<h2 class="h">팀 관련 소식</h2>' + feedHtml(news) + '<h2 class="h">소속 선수 전체</h2><div id="wsq"></div>';
    window.KOWD.teamLinks(document.getElementById("wtl"), window.KOWD.TEAMQ[id]);
    window.KOWD.squad(document.getElementById("wsq"), window.KOWD.TEAMQ[id]);
  }

  /* ---------- 경기·스탯 센터 ---------- */
  var krOnly = false, league = Object.keys(D.tables)[0];
  function stats(tab, pid) {
    tab = tab || "fixtures";
    var h = '<h2 class="h">경기·스탯 센터 <small>모든 시간은 한국 시간 · <span class="pill">샘플</span></small></h2>' +
      '<div class="tabs"><a href="#/stats" class="' + (tab === "fixtures" ? "on" : "") + '">일정·결과</a><a href="#/stats/table" class="' + (tab === "table" ? "on" : "") +
      '">순위표</a><a href="#/stats/players" class="' + (tab === "players" ? "on" : "") + '">선수 스탯</a></div>';

    if (tab === "fixtures") {
      h += '<div class="row"><label><input type="checkbox" id="kr"' + (krOnly ? " checked" : "") + "> 한국 선수가 뛴 경기에 기록 표시</label></div><div class=\"tblwrap\">";
      var last = "";
      D.matches.forEach(function (m) {
        if (m.date !== last) { h += '<div class="dayh">' + esc(m.date) + "</div>"; last = m.date; }
        h += '<div class="match"><span class="t">' + m.time + "<br>" + esc(m.league) + '</span><span class="vs">' + esc(m.home) + " vs " + esc(m.away) +
          '</span><span class="sc' + (m.score === "예정" ? " pre" : "") + '">' + esc(m.score) + "</span>" +
          (krOnly && m.note ? '<span class="n">' + esc(m.note) + "</span>" : "") + "</div>";
      });
      h += "</div>";
    } else if (tab === "table") {
      h += '<div class="row"><select id="lg" aria-label="리그">' + Object.keys(D.tables).map(function (k) {
        return "<option" + (k === league ? " selected" : "") + ">" + esc(k) + "</option>";
      }).join("") + '</select></div><div class="tblwrap"><table><tr><th>팀</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>승점</th></tr>' +
        D.tables[league].map(function (r, i) {
          return '<tr class="' + (r[6] ? "me" : "") + '"><td>' + (i + 1) + ". " + esc(r[0]) + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td><td>" + r[4] + "</td><td>" + r[5] + "</td></tr>";
        }).join("") + "</table></div>";
    } else {
      pid = D.players[pid] ? pid : "son";
      var s = D.stats[pid], p = D.players[pid];
      h += '<div class="row"><select id="ps" aria-label="선수">' + Object.keys(D.players).map(function (k) {
        return '<option value="' + k + '"' + (k === pid ? " selected" : "") + ">" + esc(D.players[k].name) + "</option>";
      }).join("") + '</select><a class="more" href="#/player/' + pid + '">' + esc(p.name) + " 소식 보기 →</a></div>" +
        '<div class="tblwrap"><table><tr><th>시즌</th><th>경기</th><th>골</th><th>도움</th><th>출전(분)</th><th>평균 평점</th></tr>' +
        [s.cur, s.prev].map(function (r, i) {
          return '<tr class="' + (i === 0 ? "me" : "") + '"><td>' + r[0] + (i === 0 ? " (이번 시즌)" : " (지난 시즌)") + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td><td>" + r[4].toLocaleString() + "</td><td>" + r[5].toFixed(1) + "</td></tr>";
        }).join("") + "</table></div>";
    }
    app.innerHTML = h;
    var kr = document.getElementById("kr"), lg = document.getElementById("lg"), ps = document.getElementById("ps");
    if (kr) kr.onchange = function () { krOnly = kr.checked; stats("fixtures"); };
    if (lg) lg.onchange = function () { league = lg.value; stats("table"); };
    if (ps) ps.onchange = function () { location.hash = "#/stats/players/" + ps.value; };
  }

  /* ---------- 검색 ---------- */
  function find(q) {
    var n = norm(q), out = [];
    if (!n) return out;
    Object.keys(D.players).forEach(function (id) {
      var p = D.players[id];
      if (p.aliases.concat([p.name, p.en]).some(function (a) { return norm(a).indexOf(n) >= 0; }))
        out.push({ kind: "선수", id: id, href: "#/player/" + id, name: p.name, sub: D.teams[p.team].name + " · " + p.pos, av: avatar(id) });
    });
    Object.keys(D.teams).forEach(function (id) {
      var t = D.teams[id];
      if (t.aliases.concat([t.name, t.full]).some(function (a) { return norm(a).indexOf(n) >= 0; }))
        out.push({ kind: "팀", id: id, href: "#/team/" + id, name: t.full, sub: t.league, av: teamAvatar(id) });
    });
    return out;
  }
  function search(q) {
    var hits = find(q), n = norm(q);
    var arts = D.feed.filter(function (f) { return n && norm(f.title + f.sum).indexOf(n) >= 0; });
    app.innerHTML = '<h2 class="h">"' + esc(q) + '" 검색 결과</h2>' +
      (hits.length ? '<div class="feed">' + hits.map(function (x) {
        return '<a class="hero" href="' + x.href + '">' + x.av + "<div><h1 style=\"font-size:18px\">" + esc(x.name) + '</h1><p class="meta">' + x.kind + " · " + esc(x.sub) + "</p></div></a>";
      }).join("") + "</div>" : "") +
      (arts.length ? '<h2 class="h">관련 소식</h2>' + feedHtml(arts) : "") +
      '<div id="wds"></div>';
    window.KOWD.search(document.getElementById("wds"), q);
  }
  var q = document.getElementById("q"), ac = document.getElementById("ac");
  q.addEventListener("input", function () {
    var hits = find(q.value).slice(0, 6);
    var qv = q.value.trim();
    ac.hidden = !qv;
    ac.innerHTML = hits.map(function (x) {
      return '<a href="' + x.href + '">' + x.av + "<span>" + esc(x.name) + "<br><small>" + esc(x.sub) + '</small></span><span class="kind">' + x.kind + "</span></a>";
    }).join("") + '<a href="#/search/' + encodeURIComponent(qv) + '"><span>🌍 전 세계 팀과 선수에서 "' + esc(qv) + '" 찾기</span></a>';
  });
  ac.addEventListener("click", function () { ac.hidden = true; q.value = ""; });
  document.addEventListener("click", function (e) { if (!e.target.closest(".search")) ac.hidden = true; });
  document.getElementById("searchForm").addEventListener("submit", function (e) {
    e.preventDefault(); ac.hidden = true;
    var v = q.value.trim(); if (!v) return;
    var hits = find(v);
    location.hash = hits.length === 1 ? hits[0].href : "#/search/" + encodeURIComponent(v);
    q.blur();
  });

  /* ---------- 화면 모드 ---------- */
  var th = store("ko_theme");
  if (th) document.documentElement.dataset.theme = th;
  document.getElementById("theme").onclick = function () {
    var cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var nx = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nx; store("ko_theme", nx);
  };

  /* ---------- 라우터 ---------- */
  function notFound() { app.innerHTML = '<p class="empty">페이지를 찾을 수 없습니다. <a class="more" href="#/">홈으로</a></p>'; }
  function route() {
    var parts = location.hash.replace(/^#\/?/, "").split("/"), r = parts[0] || "home";
    var nav = { home: "home", rumors: "rumors", players: "players", player: "players", team: "players", wteam: "players", wplayer: "players", stats: "stats", search: "home" }[r];
    document.querySelectorAll("[data-nav]").forEach(function (a) { a.classList.toggle("on", a.dataset.nav === nav); });
    if (r === "home") home();
    else if (r === "rumors") rumors();
    else if (r === "players") players();
    else if (r === "player") { pTab = "rumor"; player(parts[1]); }
    else if (r === "team") team(parts[1]);
    else if (r === "wteam") window.KOWD.teamPage(app, parts[1]);
    else if (r === "wplayer") window.KOWD.playerPage(app, parts[1]);
    else if (r === "stats") stats(parts[1], parts[2]);
    else if (r === "search") search(decodeURIComponent(parts[1] || ""));
    else notFound();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  route();
})();
