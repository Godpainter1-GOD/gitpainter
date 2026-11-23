// 전 세계 팀·선수 연결: 위키데이터(CC0 공개 데이터)를 브라우저에서 실시간으로 조회한다.
// 팀: 홈페이지, 인스타그램, 유튜브, 트랜스퍼마켓 원본 링크, 소속 선수
// 선수: 인스타그램, 유튜브, 경력(이적 지도), 트랜스퍼마켓 원본 링크
(function () {
  "use strict";
  var EP = "https://query.wikidata.org/sparql";
  var LBL = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "ko,en". }';
  var cache = {};

  // 프로토타입 선수·팀과 위키데이터 ID 연결
  var QID = { son: "Q439722", lee_ki: "Q16174734", kim_mj: "Q28699707", hwang: "Q18551518", lee_js: "Q16234741" };
  var TEAMQ = { lafc: "Q18380286", atletico: "Q8701", bayern: "Q15789", schalke: "Q32494", mainz: "Q105254" };
  // 이적료: 당시 언론 보도 기준. 정확한 금액은 원본 링크에서 확인한다.
  var FEES = {
    Q439722: { Q51974: "유소년팀에서 승격", Q104761: "약 1,000만 유로 (보도)", Q18741: "약 3,000만 유로 (보도)", Q18380286: "약 2,600만 달러, MLS 역대 최고액 (보도)" },
    Q16174734: { Q8835: "자유 이적", Q483020: "약 2,200만 유로 (보도)", Q8701: "금액 미확인, 5년 계약" },
    Q28699707: { Q6601875: "약 300만 유로 (보도)", Q2641: "약 1,800만 유로 (보도)", Q15789: "약 5,000만 유로, 바이아웃 (보도)" },
    Q18551518: { Q51974: "임대", Q19500: "임대 후 완전 이적, 약 1,670만 유로 (보도)", Q32494: "임대, 완전 이적 옵션" },
    Q16234741: { Q105254: "자유 이적" }
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function okQ(q) { return /^Q\d+$/.test(q); }
  function qid(uri) { return uri ? uri.replace(/.*\//, "") : ""; }
  function v(r, k) { return r[k] ? r[k].value : ""; }
  function run(sparql) {
    if (cache[sparql]) return Promise.resolve(cache[sparql]);
    return fetch(EP + "?format=json&query=" + encodeURIComponent(sparql), { headers: { Accept: "application/sparql-results+json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) { cache[sparql] = j.results.bindings; return cache[sparql]; });
  }
  function uniq(rows, key) {
    var seen = {}, out = [];
    rows.forEach(function (r) { var k = key(r); if (!seen[k]) { seen[k] = 1; out.push(r); } });
    return out;
  }
  function year(d) { return d ? d.slice(0, 4) : ""; }
  function coord(r) {
    var c = v(r, "c1") || v(r, "c2") || v(r, "c3"), m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(c);
    return m ? [parseFloat(m[2]), parseFloat(m[1])] : null;
  }
  function loading(el, msg) { el.innerHTML = '<p class="empty">' + esc(msg || "불러오는 중입니다…") + "</p>"; }
  function fail(el, e) { el.innerHTML = '<p class="empty">위키데이터에서 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. (' + esc(e.message) + ")</p>"; }

  function linkRow(o) {
    var h = '<div class="links">';
    if (o.site) h += '<a class="lk" target="_blank" rel="noopener" href="' + esc(o.site) + '">🌐 공식 홈페이지</a>';
    if (o.ig) h += '<a class="lk ig" target="_blank" rel="noopener" href="https://www.instagram.com/' + encodeURIComponent(o.ig) + '/">📷 인스타그램 @' + esc(o.ig) + "</a>";
    if (o.yt) h += '<a class="lk yt" target="_blank" rel="noopener" href="https://www.youtube.com/channel/' + encodeURIComponent(o.yt) + '">▶ 유튜브 채널</a>';
    if (o.tm) h += '<a class="lk" target="_blank" rel="noopener" href="' + esc(o.tm) + '">💶 트랜스퍼마켓 원본</a>';
    if (o.wd) h += '<a class="lk" target="_blank" rel="noopener" href="https://www.wikidata.org/wiki/' + esc(o.wd) + '">📚 위키데이터 원본</a>';
    if (!o.ig && !o.yt) h += '<span class="lk off">공개된 인스타그램·유튜브 기록 없음</span>';
    return h + "</div>";
  }
  function tmPlayer(id) { return id ? "https://www.transfermarkt.com/-/transfers/spieler/" + encodeURIComponent(id) : ""; }
  function tmTeam(id) { return id ? "https://www.transfermarkt.com/-/startseite/verein/" + encodeURIComponent(id) : ""; }

  // 트랜스퍼마켓에 등록된 선수를 먼저 보여준다 (원래 순서는 유지)
  function tmFirst(rows) {
    return rows.filter(function (r) { return v(r, "tm"); }).concat(rows.filter(function (r) { return !v(r, "tm"); }));
  }
  function tmBadge(r) { return v(r, "tm") ? ' <span class="tmb" title="트랜스퍼마켓 등록 선수">TM</span>' : ""; }

  /* ---------- 검색 ---------- */
  // 전체 텍스트 검색: 이름 일부(예: 음바페)로도 찾는다. kind 는 'P106=Q937857'(축구 선수) 또는 'P31=Q476028'(축구 클럽)
  function searchSvc(q, kind) {
    var s = q.replace(/[\\"]/g, " ");
    return 'SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "Search"; mwapi:srsearch "' + s +
      ' haswbstatement:' + kind + '". ?item wikibase:apiOutputItem mwapi:title. ?ord wikibase:apiOrdinal true. }';
  }
  function search(el, q) {
    loading(el, "전 세계 팀과 선수를 찾는 중입니다…");
    var tq = "SELECT ?item ?itemLabel ?site ?ig ?yt ?countryLabel ?leagueLabel ?ord WHERE { " + searchSvc(q, "P31=Q476028") +
      " OPTIONAL{?item wdt:P856 ?site} OPTIONAL{?item wdt:P2003 ?ig} OPTIONAL{?item wdt:P2397 ?yt} OPTIONAL{?item wdt:P17 ?country} OPTIONAL{?item wdt:P118 ?league} " + LBL + " } ORDER BY ?ord LIMIT 60";
    var pq = "SELECT ?item ?itemLabel ?ig ?yt ?tm ?natLabel ?birth ?ord WHERE { " + searchSvc(q, "P106=Q937857") +
      " OPTIONAL{?item wdt:P2003 ?ig} OPTIONAL{?item wdt:P2397 ?yt} OPTIONAL{?item wdt:P2446 ?tm} OPTIONAL{?item wdt:P27 ?nat} OPTIONAL{?item wdt:P569 ?birth} " + LBL + " } ORDER BY ?ord LIMIT 60";
    Promise.all([run(tq), run(pq)]).then(function (res) {
      var teams = uniq(res[0], function (r) { return v(r, "item"); }).slice(0, 12);
      var pls = tmFirst(uniq(res[1], function (r) { return v(r, "item"); })).slice(0, 12);
      var h = "";
      if (teams.length) {
        h += '<h2 class="h">전 세계 팀 <small>' + teams.length + "곳</small></h2><div class=\"feed\">" + teams.map(function (r) {
          var id = qid(v(r, "item"));
          return '<div class="card"><h3><a href="#/wteam/' + id + '">' + esc(v(r, "itemLabel")) + '</a></h3><p>' + esc([v(r, "countryLabel"), v(r, "leagueLabel")].filter(Boolean).join(" · ")) + "</p>" +
            linkRow({ site: v(r, "site"), ig: v(r, "ig"), yt: v(r, "yt") }) + '<a class="btn" href="#/wteam/' + id + '">팀 페이지와 소속 선수 →</a></div>';
        }).join("") + "</div>";
      }
      if (pls.length) {
        h += '<h2 class="h">전 세계 선수 <small>' + pls.length + "명</small></h2><div class=\"feed\">" + pls.map(function (r) {
          var id = qid(v(r, "item"));
          return '<div class="card"><h3><a href="#/wplayer/' + id + '">' + esc(v(r, "itemLabel")) + '</a>' + tmBadge(r) + '</h3><p>' + esc([v(r, "natLabel"), year(v(r, "birth")) && year(v(r, "birth")) + "년생"].filter(Boolean).join(" · ")) + "</p>" +
            linkRow({ ig: v(r, "ig"), yt: v(r, "yt"), tm: tmPlayer(v(r, "tm")) }) + '<a class="btn" href="#/wplayer/' + id + '">경력과 이적 지도 →</a></div>';
        }).join("") + "</div>";
      }
      el.innerHTML = h || '<p class="empty">전 세계 검색에서도 찾지 못했습니다. 영어 이름으로 다시 검색해 보세요.</p>';
    }).catch(function (e) { fail(el, e); });
  }

  /* ---------- 팀 ---------- */
  function teamLinks(el, id, withHead) {
    if (!okQ(id)) return;
    loading(el);
    var q = "SELECT ?tLabel ?site ?ig ?yt ?tm ?countryLabel ?leagueLabel ?venueLabel ?inc WHERE { BIND(wd:" + id + " AS ?t) OPTIONAL{?t wdt:P856 ?site} OPTIONAL{?t wdt:P2003 ?ig} OPTIONAL{?t wdt:P2397 ?yt} OPTIONAL{?t wdt:P7223 ?tm} OPTIONAL{?t wdt:P17 ?country} OPTIONAL{?t wdt:P118 ?league} OPTIONAL{?t wdt:P115 ?venue} OPTIONAL{?t wdt:P571 ?inc} " + LBL + " } LIMIT 20";
    return run(q).then(function (rows) {
      var r = rows[0] || {};
      var h = "";
      if (withHead) {
        h += '<section class="hero"><span class="avatar big" style="background:#0f8a4d">' + esc(v(r, "tLabel").slice(0, 2)) + "</span><div><h1>" + esc(v(r, "tLabel")) + '</h1><p class="meta">' +
          esc([v(r, "countryLabel"), v(r, "leagueLabel"), v(r, "venueLabel"), year(v(r, "inc")) && year(v(r, "inc")) + "년 창단"].filter(Boolean).join(" · ")) + "</p></div></section>";
      }
      h += '<h2 class="h">공식 채널 <small>위키데이터 실시간 조회</small></h2><div class="card">' +
        linkRow({ site: v(r, "site"), ig: v(r, "ig"), yt: v(r, "yt"), tm: tmTeam(v(r, "tm")), wd: id }) + "</div>";
      el.innerHTML = h;
    }).catch(function (e) { fail(el, e); });
  }
  function squad(el, id) {
    if (!okQ(id)) return;
    loading(el, "소속 선수를 불러오는 중입니다…");
    var q = "SELECT ?p ?pLabel ?ig ?yt ?tm ?s ?posLabel WHERE { ?p p:P54 ?st. ?st ps:P54 wd:" + id + ". FILTER NOT EXISTS{?st pq:P582 ?e} OPTIONAL{?st pq:P580 ?s} ?p wdt:P569 ?b. FILTER(YEAR(?b) >= 1986) OPTIONAL{?p wdt:P2003 ?ig} OPTIONAL{?p wdt:P2397 ?yt} OPTIONAL{?p wdt:P2446 ?tm} OPTIONAL{?p wdt:P413 ?pos} " + LBL + " } ORDER BY DESC(?s) LIMIT 400";
    run(q).then(function (rows) {
      var ps = tmFirst(uniq(rows, function (r) { return v(r, "p"); }).filter(function (r) { var y = year(v(r, "s")); return !y || +y >= 2019; })).slice(0, 60);
      if (!ps.length) { el.innerHTML = '<p class="empty">위키데이터에 등록된 현재 소속 선수가 없습니다.</p>'; return; }
      el.innerHTML = '<div class="tblwrap"><table class="sq"><tr><th>선수</th><th>포지션</th><th>입단</th><th>인스타그램</th><th>유튜브</th></tr>' + ps.map(function (r) {
        var ig = v(r, "ig"), yt = v(r, "yt");
        return '<tr><td><a class="pl" href="#/wplayer/' + qid(v(r, "p")) + '">' + esc(v(r, "pLabel")) + "</a>" + tmBadge(r) + "</td><td>" + esc(v(r, "posLabel")) + "</td><td>" + year(v(r, "s")) + "</td><td>" +
          (ig ? '<a class="pl" target="_blank" rel="noopener" href="https://www.instagram.com/' + encodeURIComponent(ig) + '/">@' + esc(ig) + "</a>" : "–") + "</td><td>" +
          (yt ? '<a class="pl" target="_blank" rel="noopener" href="https://www.youtube.com/channel/' + encodeURIComponent(yt) + '">채널 ↗</a>' : "–") + "</td></tr>";
      }).join("") + '</table></div><p class="note">트랜스퍼마켓에 등록된 선수(TM 표시)를 먼저 보여줍니다. 위키데이터에 퇴단 날짜가 없고 2019년 이후 입단했거나 입단 연도가 기록되지 않은 선수입니다. 최근 이적이 반영되지 않았거나 빠진 선수가 있을 수 있습니다. 선수 이름을 누르면 경력과 이적 지도가 나옵니다.</p>';
    }).catch(function (e) { fail(el, e); });
  }
  function teamPage(el, id) {
    if (!okQ(id)) { el.innerHTML = '<p class="empty">페이지를 찾을 수 없습니다.</p>'; return; }
    el.innerHTML = '<div id="wtl"></div><h2 class="h">소속 선수</h2><div id="wsq"></div>';
    teamLinks(document.getElementById("wtl"), id, true);
    squad(document.getElementById("wsq"), id);
  }

  /* ---------- 선수 경력·이적 지도 ---------- */
  var map;
  function career(el, id, withHead) {
    if (!okQ(id)) return;
    loading(el, "경력과 이적 지도를 불러오는 중입니다…");
    var q = "SELECT ?pLabel ?ig ?yt ?tm ?birth ?natLabel ?posLabel ?team ?teamLabel ?teamEn ?art ?s ?e ?c1 ?c2 ?c3 ?isNat WHERE { BIND(wd:" + id + " AS ?p) OPTIONAL{?art schema:about ?p; schema:isPartOf <https://en.wikipedia.org/>} OPTIONAL{?p wdt:P2003 ?ig} OPTIONAL{?p wdt:P2397 ?yt} OPTIONAL{?p wdt:P2446 ?tm} OPTIONAL{?p wdt:P569 ?birth} OPTIONAL{?p wdt:P27 ?nat} OPTIONAL{?p wdt:P413 ?pos} " +
      "OPTIONAL { ?p p:P54 ?st. ?st ps:P54 ?team. OPTIONAL{?st pq:P580 ?s} OPTIONAL{?st pq:P582 ?e} OPTIONAL{?team rdfs:label ?teamEn. FILTER(LANG(?teamEn) = \"en\")} OPTIONAL{?team wdt:P115/wdt:P625 ?c1} OPTIONAL{?team wdt:P159/wdt:P625 ?c2} OPTIONAL{?team wdt:P625 ?c3} BIND(EXISTS{?team wdt:P31/wdt:P279* wd:Q1194951} AS ?isNat) } " + LBL + " } LIMIT 500";
    run(q).then(function (rows) {
      var r0 = rows[0] || {}, tm = tmPlayer(v(r0, "tm"));
      var sts = uniq(rows.filter(function (r) { return v(r, "team"); }), function (r) { return v(r, "team") + v(r, "s"); })
        .sort(function (a, b) { return (v(a, "s") || "9999") < (v(b, "s") || "9999") ? -1 : 1; });
      var isNat = function (r) { return v(r, "isNat") === "true" || /국가대표|national/i.test(v(r, "teamLabel")); };
      var clubs = sts.filter(function (r) { return !isNat(r); }), nats = sts.filter(isNat);
      var fees = FEES[id] || {};
      var h = "";
      if (withHead) {
        var poss = uniq(rows, function (r) { return v(r, "posLabel"); }).map(function (r) { return v(r, "posLabel"); }).filter(Boolean).join(", ");
        h += '<section class="hero"><span class="avatar big" style="background:#0f8a4d">' + esc(v(r0, "pLabel").slice(0, 2)) + "</span><div><h1>" + esc(v(r0, "pLabel")) + '</h1><p class="meta">' +
          esc([v(r0, "natLabel"), poss, year(v(r0, "birth")) && year(v(r0, "birth")) + "년생"].filter(Boolean).join(" · ")) + "</p></div></section>";
      }
      h += '<h2 class="h">공식 채널과 원본 <small>위키데이터 실시간 조회</small></h2><div class="card">' + linkRow({ ig: v(r0, "ig"), yt: v(r0, "yt"), tm: tm, wd: id }) + "</div>";
      var last = clubs[clubs.length - 1];
      h += '<h2 class="h">이적 지도 <small>' + clubs.length + "개 팀" + (last ? " · 최근 소속: " + esc(v(last, "teamLabel")) : "") + '</small></h2><div class="card"><div id="cmap" class="cmap"></div><ol class="career moves">' +
        clubs.map(function (r, i) {
          var t = qid(v(r, "team")), fee = fees[t];
          return "<li><b>" + (i + 1) + ". " + (year(v(r, "s")) || "?") + "–" + year(v(r, "e")) + '</b><h3><a href="#/wteam/' + t + '">' + esc(v(r, "teamLabel")) + '</a></h3><div class="fee" id="fee' + i + '">' + (fee ? "이적료: " + esc(fee) : "이적 조건을 찾는 중입니다…") + "</div></li>";
        }).join("") + "</ol>" +
        (nats.length ? '<p class="note">대표팀: ' + nats.map(function (r) { return esc(v(r, "teamLabel")) + " (" + (year(v(r, "s")) || "?") + "–" + year(v(r, "e")) + ")"; }).join(", ") + "</p>" : "") +
        '<p class="note">경력은 위키데이터 기록이며 연도만 기록된 경우가 많습니다. 이적료와 옵션은 영어 위키백과 선수 문서의 문장에서 자동으로 찾은 것입니다. 금액은 당시 보도 기준이며, 각 항목의 근거 문장에서 확인할 수 있습니다.' + (tm ? ' <a class="pl" target="_blank" rel="noopener" href="' + esc(tm) + '">트랜스퍼마켓에서 추가 확인 ↗</a>' : "") + '</p></div>';
      el.innerHTML = h;
      fillFees(clubs, v(r0, "art"), fees);
      try { drawMap(clubs); } catch (e) {
        var b = document.getElementById("cmap");
        if (b) b.outerHTML = '<p class="note">지도를 그리지 못했습니다. 아래 목록으로 경력을 확인해 주세요. (' + esc(e.message) + ")</p>";
      }
    }).catch(function (e) { fail(el, e); });
  }
  // world.js 의 압축된 경계선(TopoJSON 형식)을 지도에 그릴 수 있는 좌표로 푼다
  var worldGeo;
  function world() {
    var W = window.KO_WORLD;
    if (worldGeo || !W) return worldGeo;
    var sc = W.transform.scale, tr = W.transform.translate;
    var arcs = W.arcs.map(function (a) {
      var x = 0, y = 0;
      return a.map(function (p) { x += p[0]; y += p[1]; return [x * sc[0] + tr[0], y * sc[1] + tr[1]]; });
    });
    function ring(ids) {
      var out = [];
      ids.forEach(function (i) {
        var a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
        out = out.concat(out.length ? a.slice(1) : a);
      });
      return out;
    }
    function poly(rings) { return rings.map(ring); }
    worldGeo = { type: "FeatureCollection", features: W.geoms.filter(function (g) { return g.a; }).map(function (g) {
      return { type: "Feature", properties: {}, geometry: { type: g.t, coordinates: g.t === "Polygon" ? poly(g.a) : g.a.map(poly) } };
    }) };
    return worldGeo;
  }
  // 위키백과 선수 문서에서 이적료와 옵션을 찾아 각 이적 아래에 채운다
  function fillFees(clubs, art, fees) {
    function put(i, html) { var b = document.getElementById("fee" + i); if (b) b.innerHTML = html; }
    function fallback(i) {
      var fee = fees[qid(v(clubs[i], "team"))];
      put(i, fee ? "이적료: " + esc(fee) : '<span class="nofee">공개 문서에서 이적료 기록을 찾지 못했습니다</span>');
    }
    if (!art || !window.KOFEE) { clubs.forEach(function (r, i) { fallback(i); }); return; }
    var title = decodeURIComponent(art.split("/wiki/").pop());
    var url = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles=" + encodeURIComponent(title);
    (cache[url] ? Promise.resolve(cache[url]) : fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var pg = j.query.pages, k = Object.keys(pg)[0];
      return (cache[url] = pg[k].extract || "");
    })).then(function (text) {
      var res = window.KOFEE.extract(text, clubs.map(function (r) { return { name: v(r, "teamEn"), year: +year(v(r, "s")) }; }));
      res.forEach(function (x, i) {
        if (!x) return fallback(i);
        var curated = fees[qid(v(clubs[i], "team"))];
        var h = x.fees.length ? "<b class=\"amt\">이적료 " + esc(x.fees.join(" / ")) + "</b>" : curated ? "이적료: " + esc(curated) : "";
        h += x.tags.map(function (t) { return '<span class="opt">' + esc(t) + "</span>"; }).join("");
        h += '<details class="ev"><summary>근거 문장 보기</summary><p lang="en">' + esc(x.sentence) + '</p><a class="pl" target="_blank" rel="noopener" href="' + esc(art) + '">영어 위키백과 원문 ↗</a></details>';
        put(i, h);
      });
    }).catch(function () { clubs.forEach(function (r, i) { fallback(i); }); });
  }
  function drawMap(clubs) {
    var box = document.getElementById("cmap");
    if (!box) return;
    if (!window.L) { box.outerHTML = '<p class="note">지도 라이브러리를 불러오지 못했습니다. 아래 목록으로 경력을 확인해 주세요.</p>'; return; }
    if (map) { map.remove(); map = null; }
    var pts = [];
    clubs.forEach(function (r, i) {
      var c = coord(r); if (!c) return;
      // 같은 도시의 팀이 겹치지 않게 조금씩 옮긴다
      var o = c, n = pts.filter(function (p) { return Math.abs(p.o[0] - o[0]) < 0.4 && Math.abs(p.o[1] - o[1]) < 0.4; }).length;
      if (n) c = [o[0] + 0.22 * n, o[1] + 0.34 * n];
      pts.push({ c: c, o: o, r: r, n: i + 1 });
    });
    if (!pts.length) { box.outerHTML = '<p class="note">위치 정보가 있는 팀이 없어 지도를 그리지 못했습니다.</p>'; return; }
    // 외부 지도 서버를 쓰지 않는다. 포털에 넣어 둔 나라 경계선(world.js)을 직접 그린다.
    map = L.map(box, { scrollWheelZoom: false, maxZoom: 8, minZoom: 1, attributionControl: false });
    var line = pts.map(function (p) { return p.c; });
    map.fitBounds(L.latLngBounds(line).pad(0.25), { maxZoom: 7 });
    var geo = world();
    if (geo) L.geoJSON(geo, { interactive: false, style: { color: "#9db3a7", weight: 1, fillColor: "#dfe9e3", fillOpacity: 1 } }).addTo(map);
    L.polyline(line, { color: "#0f8a4d", weight: 3, dashArray: "6 6" }).addTo(map);
    pts.forEach(function (p) {
      L.marker(p.c, { icon: L.divIcon({ className: "pin", html: "<span>" + p.n + "</span>", iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .addTo(map).bindTooltip(esc(v(p.r, "teamLabel")), { direction: "right", offset: [12, 0] }).bindPopup("<b>" + p.n + ". " + esc(v(p.r, "teamLabel")) + "</b><br>" + (year(v(p.r, "s")) || "?") + "–" + year(v(p.r, "e")));
    });
  }
  function playerPage(el, id) {
    if (!okQ(id)) { el.innerHTML = '<p class="empty">페이지를 찾을 수 없습니다.</p>'; return; }
    career(el, id, true);
  }

  window.KOWD = { QID: QID, TEAMQ: TEAMQ, search: search, teamLinks: teamLinks, squad: squad, teamPage: teamPage, career: career, playerPage: playerPage };
})();
