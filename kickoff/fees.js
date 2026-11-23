// 이적료·옵션 추출기
// 영어 위키백과 선수 문서(CC BY-SA)의 문장에서 이적 금액과 조건을 찾아 한국어로 정리한다.
// 자동 추출이므로 화면에는 항상 근거 문장과 출처 링크를 함께 보여준다.
(function (root) {
  "use strict";

  var MONEY = /(?:US\$|A\$|€|£|\$)\s?\d[\d,]*(?:\.\d+)?\s?(?:million|billion|bn|m|k)?\b|\b\d[\d,]*(?:\.\d+)?\s?(?:million|billion)\s(?:euros?|pounds|dollars)/gi;
  var VERB = /\b(sign(?:ed|ing)?|join(?:ed|ing)?|mov(?:ed|e)|transfer(?:red)?|loan(?:ed)?|deal|fee|agree(?:d|ment)|complet(?:ed|ing)|bought|sold|acquir(?:ed)|contract|return(?:ed)?|announc(?:ed)|permanent)\b/i;
  var TAGS = [
    [/\bobligation to (?:buy|purchase)|\bobligatory purchase|\bmandatory (?:purchase|buy)/i, "의무 완전 이적 조항"],
    [/\boption to (?:buy|purchase|make)|\bbuy(?:ing)? option|\bpurchase option|\boption (?:of|for) (?:a )?permanent/i, "완전 이적 옵션"],
    [/\b(?:release|buy-?out|buyout) clause/i, "바이아웃 조항"],
    [/\bbuy-?back/i, "재영입(바이백) 조항"],
    [/\bsell-?on/i, "재판매 수익 조항"],
    [/\badd-?ons?\b|\bbonus(?:es)?\b|\bpotentially ris|\bcould rise|\brising to|\bplus .{0,30}(?:variables|incentives)|\bperformance-related/i, "추가 옵션(보너스) 포함"],
    [/\bon loan\b|\bloan(?:ed)?\b|\bseason-long loan|\bloan deal/i, "임대"],
    [/\bfree transfer|\bfree agent|\bon a free\b/i, "자유 이적"],
    [/\bundisclosed/i, "이적료 비공개"],
    [/\b(?:club|league|world|national|asian|british|transfer)[- ]record|\brecord (?:fee|signing|transfer|deal)|\bmost expensive/i, "당시 기록적 이적료"],
    [/\boption (?:for|of|to extend)\b.{0,40}\b(?:year|season|extend|extension)|\bextension option|\bclub option/i, "계약 연장 옵션"]
  ];
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  var YEARS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d(?:\.\d)?|\d½)[- ](?:and[- ]a[- ]half[- ])?year (?:contract|deal|agreement)/i;

  // 문서 전체를 문장으로 나눈다. 각 문장은 직전 두 문장과 함께 연도 판단에 쓴다.
  function sentences(text) {
    var out = [];
    text.split(/\n+/).forEach(function (line) {
      line = line.trim();
      if (!line || /^=+.*=+$/.test(line)) return;
      line.replace(/\s+/g, " ").split(/(?<=[a-z0-9\)\]"”][.!?])\s+(?=[A-Z"“])/).forEach(function (s) { if (s.length > 25) out.push(s); });
    });
    return out;
  }
  // 팀 이름에서 문장과 맞춰 볼 낱말을 만든다. 예: "Bayer 04 Leverkusen" -> ["bayer", "leverk"]
  function keys(name) {
    var words = name.replace(/\b(?:F\.?C\.?|A\.?F\.?C\.?|S\.?C\.?|C\.?F\.?|S\.?V\.?|A\.?C\.?|S\.?S\.?C\.?|A\.?S\.?|R\.?C\.?D?\.?|U\.?D\.?|C\.?D\.?|S\.?K\.?|F\.?K\.?|B\.?K\.?|I\.?F\.?|club|football|futbol|calcio|de|the|of|and|united|city|town|sporting|real|athletic|atletico)\b/gi, " ")
      .replace(/[^A-Za-zÀ-ÿ ]/g, " ").split(/\s+/).filter(function (w) { return w.length >= 4; });
    var ks = words.map(function (w) { return w.toLowerCase().slice(0, 6); });
    if (!ks.length) ks = [name.toLowerCase()];
    var ac = name.split(/\s+/).map(function (w) { return w[0]; }).join("");
    if (/^[A-Z]{3,5}$/.test(ac)) ks.push(ac.toLowerCase());
    return ks;
  }
  function has(sent, ks) { var l = sent.toLowerCase(); return ks.some(function (k) { return l.indexOf(k) >= 0; }); }

  // "£22 million" -> "2,200만 파운드"
  function ko(m) {
    var cur = /€|euro/i.test(m) ? "유로" : /£|pound/i.test(m) ? "파운드" : /A\$/.test(m) ? "호주 달러" : "달러";
    var n = parseFloat((/\d[\d,]*(?:\.\d+)?/.exec(m) || ["0"])[0].replace(/,/g, ""));
    var unit = /billion|bn/i.test(m) ? 1e9 : /million|\dm\b|\d\sm\b/i.test(m) ? 1e6 : /k\b/i.test(m) ? 1e3 : 1;
    var v = n * unit;
    if (!v) return "";
    var man = Math.round(v / 1e4), eok = Math.floor(man / 1e4), rest = man % 1e4, s = "";
    if (eok) s += eok.toLocaleString("en-US") + "억";
    if (rest) s += (s ? " " : "") + rest.toLocaleString("en-US") + "만";
    if (!s) s = Math.round(v).toLocaleString("en-US");
    return "약 " + s + " " + cur;
  }

  // moves: [{ name: 영어 팀 이름, year: 입단 연도(숫자) }] -> 같은 순서의 결과 배열 (못 찾으면 null)
  function extract(text, moves) {
    var ss = sentences(text);
    return moves.map(function (mv) {
      if (!mv.name || !mv.year) return null;
      var ks = keys(mv.name), best = null;
      ss.forEach(function (s, i) {
        if (!has(s, ks) || !VERB.test(s)) return;
        var ctx = (ss[i - 2] || "") + " " + (ss[i - 1] || "");
        var yr = new RegExp("\\b" + mv.year + "\\b");
        var prev = new RegExp("\\b(?:November|December) " + (mv.year - 1) + "\\b");
        var score = yr.test(s) ? 4 : prev.test(s) ? 3 : yr.test(ctx) ? 2 : 0;
        if (!score) return;
        var money = s.match(MONEY) || [];
        money = money.filter(function (m) { return /[€£$]|million|billion/i.test(m) && ko(m); });
        var tags = TAGS.filter(function (t) { return t[0].test(s); }).map(function (t) { return t[1]; });
        var ym = YEARS.exec(s);
        if (!money.length && !tags.length && !ym) return;
        score += money.length ? 4 : 0;
        score += tags.length;
        if (/\b(?:sign|join|transfer|loan|mov)/i.test(s)) score += 1;
        if (!best || score > best.score) best = { score: score, sentence: s, money: money, tags: tags, ym: ym };
      });
      if (!best) return null;
      var fees = [];
      best.money.forEach(function (m) { var k = ko(m); if (k && fees.indexOf(k) < 0) fees.push(k); });
      var tags = best.tags.slice();
      if (tags.indexOf("의무 완전 이적 조항") >= 0) tags = tags.filter(function (t) { return t !== "완전 이적 옵션"; });
      if (best.ym) {
        var y = best.ym[1].toLowerCase();
        tags.push((NUMW[y] || y.replace("½", ".5")) + (/half/i.test(best.ym[0]) ? ".5" : "") + "년 계약");
      }
      return { fees: fees.slice(0, 3), tags: tags, sentence: best.sentence };
    });
  }

  root.KOFEE = { extract: extract, ko: ko };
})(typeof window !== "undefined" ? window : globalThis);
