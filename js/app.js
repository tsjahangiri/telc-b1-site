/* TELC B1 practice — offline single-page app. Data: window.EXAM_DATA (data/exercises.js). */
(function () {
  "use strict";

  var ALL = (window.EXAM_DATA && window.EXAM_DATA.exercises) || [];
  var STORE_KEY = "telcB1.progress.v1";
  var PREF_KEY = "telcB1.prefs.v1";
  var TYPE_LABEL = {
    lesen1: "Leseverstehen, Teil 1", lesen2: "Leseverstehen, Teil 2", lesen3: "Leseverstehen, Teil 3",
    sprach1: "Sprachbausteine, Teil 1", sprach2: "Sprachbausteine, Teil 2",
    hoeren1: "Hörverstehen, Teil 1", hoeren2: "Hörverstehen, Teil 2", hoeren3: "Hörverstehen, Teil 3"
  };
  var SHORT = { lesen1: "Lesen 1", lesen2: "Lesen 2", lesen3: "Lesen 3", sprach1: "Sprachb. 1", sprach2: "Sprachb. 2", hoeren1: "Hören 1", hoeren2: "Hören 2", hoeren3: "Hören 3" };
  function areaOf(ex) { return ex.type.indexOf("hoeren") === 0 ? "hv" : "ls"; }

  // ---------- storage (fails gracefully, e.g. private mode) ----------
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } }

  var progress = load(STORE_KEY, {});
  var prefs = load(PREF_KEY, { showDupes: false, type: "all", current: null });
  if (prefs.area !== "hv") prefs.area = "ls";

  function canon(ex) { return ex.duplicate_of || ex.id; }
  function state(ex) {
    var k = canon(ex);
    if (!progress[k]) progress[k] = { answers: {}, checked: false, revealed: false, score: null, total: null };
    return progress[k];
  }
  function persist() { save(STORE_KEY, progress); }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function markIllegible(html) {
    return html
      .replace(/\[(unleserlich[^\]]*|abgeschnitten|Logo, unleserlich)\]/g, '<span class="illegible" title="Im Original nicht lesbar">[$1]</span>')
      .replace(/\[…\]/g, '<span class="illegible" title="Im Foto abgeschnitten – nicht rekonstruierbar (Name/Nummer/Uhrzeit)">[…]</span>');
  }
  function paragraphs(text) {
    return String(text || "").split("\n").filter(function (l) { return l.trim() !== ""; }).map(function (l) {
      if (l.indexOf("## ") === 0) return "<h3>" + markIllegible(esc(l.slice(3))) + "</h3>";
      return "<p>" + markIllegible(esc(l)) + "</p>";
    }).join("");
  }
  function U(k) { return String(k).toUpperCase(); }
  function nums(ex) { return Object.keys(ex.solution).map(Number).sort(function (a, b) { return a - b; }); }

  // ---------- list / navigation ----------
  function visibleList() {
    return ALL.filter(function (ex) {
      if (areaOf(ex) !== prefs.area) return false;
      if (!prefs.showDupes && ex.duplicate_of) return false;
      if (prefs.type !== "all" && ex.type !== prefs.type) return false;
      return true;
    });
  }
  var list = visibleList();
  var idx = 0;

  function setIndexById(id) {
    var target = id && ALL.find(function (e) { return e.id === id; });
    if (target && areaOf(target) !== prefs.area) { prefs.area = areaOf(target); prefs.type = "all"; syncAreaUi(); list = visibleList(); }
    var i = list.findIndex(function (e) { return e.id === id; });
    if (i < 0 && id) {
      // a duplicate id while duplicates are hidden → go to its original
      var ex = ALL.find(function (e) { return e.id === id; });
      if (ex && ex.duplicate_of) i = list.findIndex(function (e) { return e.id === ex.duplicate_of; });
    }
    idx = i < 0 ? 0 : i;
  }

  // ---------- rendering ----------
  var $ = function (id) { return document.getElementById(id); };

  function headerHtml(ex) {
    var title = TYPE_LABEL[ex.type];
    var meta = ['<span>Modelltest ' + esc(ex.paper.slice(1)) + '</span>'];
    if (ex.topic) meta.push("<span>Thema: " + esc(ex.topic) + "</span>");
    meta.push("<span>PDF-Seite " + ex.pages.join(", ") + "</span>");
    var h = '<div class="ex-head"><h1>' + esc(title) + (ex.id.slice(-1) === "b" ? " (Variante)" : "") + "</h1>" +
      '<div class="ex-meta">' + meta.join("") + "</div></div>";
    if (ex.duplicate_of) h += '<div class="dup-notice">Diese Übung ist im PDF identisch mit ' + esc(ex.duplicate_of.replace("-", " · ")) + " — Ihr Fortschritt wird gemeinsam gespeichert.</div>";
    if (ex.uncertain && ex.uncertain.length) {
      h += '<div class="notice"><b>Hinweis:</b> ' + (areaOf(ex) === "hv" ? "Zu dieser Übung gibt es eine Anmerkung zur Lösung. " :
        "Teile des Originals sind schwer lesbar oder abgeschnitten; sie sind markiert bzw. als Rekonstruktion gekennzeichnet. ") +
        "<details><summary>Details anzeigen</summary><ul>" + ex.uncertain.map(function (u) {
          return "<li><i>" + esc(u.location) + ":</i> " + esc(u.note) + "</li>"; }).join("") + "</ul></details></div>";
    }
    h += '<div class="instructions">' + esc(ex.instructions).replace(/\n/g, "<br>") + "</div>";
    return h;
  }

  function scoreHtml(st) {
    if (!st.checked || st.total == null) return "";
    var r = st.score / st.total, cls = r >= 0.8 ? "good" : r >= 0.5 ? "mid" : "low";
    return '<div class="score ' + cls + '" role="status">Ergebnis: ' + st.score + " von " + st.total + " richtig</div>";
  }

  function notesHtml(ex) {
    var items = (ex.notes || []).concat(ex.paper_notes || []);
    if (!items.length) return "";
    return '<div class="card notes"><details><summary>Anmerkungen zur Übertragung aus dem PDF</summary><ul>' +
      items.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul></details></div>";
  }

  function itemStatus(ex, st, n) {
    var a = st.answers[n], c = ex.solution[n];
    if (!st.checked && !st.revealed) return "";
    if (st.checked && a) return a === c ? "correct" : "wrong";
    if (st.revealed || st.checked) return "missed";
    return "";
  }
  function fb(ex, st, n, labelFn) {
    var c = ex.solution[n], a = st.answers[n];
    if (st.checked && a) {
      if (a === c) return '<div class="feedback ok">✓ Richtig</div>';
      return '<div class="feedback bad">✗ Falsch — richtig ist: ' + labelFn(c) + "</div>";
    }
    if (st.checked && !a) return '<div class="feedback bad">Keine Antwort — richtig ist: ' + labelFn(c) + "</div>";
    if (st.revealed) return '<div class="feedback ok">Lösung: ' + labelFn(c) + "</div>";
    return "";
  }

  function selectHtml(name, opts, value, disabled, cls) {
    return '<select class="' + (cls || "") + '" data-n="' + name + '"' + (disabled ? " disabled" : "") + ' aria-label="Antwort ' + name + '">' +
      '<option value="">–</option>' + opts.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (value === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>";
      }).join("") + "</select>";
  }

  function renderLesen1(ex, st) {
    var locked = st.checked || st.revealed;
    var headLabel = function (k) { var h = ex.headings.find(function (x) { return x.key === k; }); return "<b>" + U(k) + "</b>) " + esc(h ? h.text : ""); };
    var h = '<div class="card"><h2>Überschriften</h2><ul class="headings-list">' + ex.headings.map(function (x) {
      return "<li><b>" + U(x.key) + ")</b> " + esc(x.text) + "</li>"; }).join("") + "</ul></div>";
    h += '<div class="questions"><h2>Texte 1–5: Welche Überschrift passt?</h2><div class="texts-list">';
    ex.texts.forEach(function (t) {
      var n = String(t.num), s = itemStatus(ex, st, n);
      h += '<div class="t row ' + (s === "missed" ? "" : s) + '"><div class="q-num">' + t.num + '.</div><div class="reading">' + paragraphs(t.text) + "</div>" +
        "<div>" + selectHtml(n, ex.headings.map(function (x) { return [x.key, U(x.key)]; }), st.answers[n], locked) + "</div>" +
        '<div class="sol">' + fb(ex, st, n, headLabel) + "</div></div>";
    });
    return h + "</div></div>";
  }

  function renderLesen2(ex, st) {
    var locked = st.checked || st.revealed;
    var h = '<div class="card reading">' + (ex.title ? '<div class="title">' + esc(ex.title) + "</div>" : "") +
      (ex.subtitle ? '<div class="subtitle">' + esc(ex.subtitle) + "</div>" : "") + paragraphs(ex.text) + "</div>";
    h += '<div class="questions"><h2>Aufgaben 6–10</h2>';
    ex.questions.forEach(function (q) {
      var n = String(q.num), a = st.answers[n], c = ex.solution[n];
      h += '<div class="q" role="radiogroup" aria-label="Aufgabe ' + n + '"><div class="q-stem"><span class="q-num">' + n + ".</span>" + esc(q.stem) + "</div>";
      ["a", "b", "c"].forEach(function (k) {
        var cls = "";
        if (st.checked) { if (k === c) cls = a === c ? "correct" : "missed"; else if (k === a) cls = "wrong"; }
        else if (st.revealed && k === c) cls = "correct";
        h += '<label class="opt ' + cls + '"><input type="radio" name="q' + n + '" value="' + k + '" data-n="' + n + '"' +
          (a === k ? " checked" : "") + (locked ? " disabled" : "") + '><span class="letter">' + U(k) + "</span><span>" + esc(q.options[k]) + "</span></label>";
      });
      h += fb(ex, st, n, function (k) { return "<b>" + U(k) + "</b> " + esc(q.options[k]); }) + "</div>";
    });
    return h + "</div>";
  }

  function renderLesen3(ex, st) {
    var locked = st.checked || st.revealed;
    var adLabel = function (k) { return k === "x" ? "<b>X</b> (keine passende Anzeige)" : "Anzeige <b>" + U(k) + "</b>"; };
    var h = '<div class="questions"><h2>Situationen 11–20: Welche Anzeige passt?</h2><div class="match-table">';
    ex.situations.forEach(function (s) {
      var n = String(s.num), stt = itemStatus(ex, st, n);
      h += '<div class="row ' + (stt === "missed" ? "" : stt) + '"><div class="q-num">' + n + '.</div><div>' + esc(s.text) + "</div><div>" +
        selectHtml(n, ex.ads.map(function (a) { return [a.key, U(a.key)]; }).concat([["x", "X (keine)"]]), st.answers[n], locked) +
        '</div><div class="sol">' + fb(ex, st, n, adLabel) + "</div></div>";
    });
    h += "</div></div>";
    h += '<div class="card"><h2>Anzeigen a–l</h2>' +
      '<p class="ad-legend">Die Anzeigen sind aus dem Originalfoto übertragen und neu gesetzt. ' +
      '<span class="illegible">[unleserlich]</span> = im Original nicht lesbar · <span class="illegible">[…]</span> = im Foto abgeschnitten, nicht rekonstruierbar · <span class="recon">gepunktet</span> = aus unscharfem oder abgeschnittenem Original rekonstruiert.</p>' +
      '<div class="newspaper"><div class="np-head">90 Minuten Leseverstehen und Sprachbausteine</div><div class="ads-grid">' +
      ex.ads.map(renderAd).join("") + "</div></div>";
    if (ex.ads_image) {
      h += '<details class="orig-img"><summary>Originalseite (Foto aus dem PDF) anzeigen</summary><img loading="lazy" src="' + esc(ex.ads_image) +
        '" alt="Originalseite mit den Anzeigen a bis l"></details>';
    }
    return h + "</div>";
  }

  var ICON = {
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    bike: '<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17l4-8h6l3 8M9.5 9L12 17h-2M14 6h3"/>',
    train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>',
    ship: '<path d="M3 17l2 4h14l2-4H3zM6 17V9h12v8M12 9V3l5 4"/>',
    plane: '<path d="M2 15l20-7-3-2-7 3-6-5-2 1 4 6-5 2-2-1-1 1 3 3z"/>',
    food: '<path d="M7 2v8a2 2 0 0 0 4 0V2M9 10v12M17 2c-2 2-2 6 0 8v12"/>',
    bed: '<path d="M2 18V7M2 13h20v5M22 18v-5a3 3 0 0 0-3-3h-8v3"/><circle cx="6.5" cy="10.5" r="2"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4z"/><path d="M12 5v16"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    flower: '<circle cx="12" cy="9" r="2.5"/><path d="M12 6.5C11 3 13 2 13 2s2 2-1 4.5M14.5 9c3.5-1 4.5 1 4.5 1s-2 2-4.5-1M9.5 9C6 8 5 10 5 10s2 2 4.5-1M12 11.5V22M12 17c-3 0-4-2-4-2M12 19c3 0 4-2 4-2"/>',
    car: '<path d="M3 16v-4l2-5h14l2 5v4H3z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M3 12h18"/>',
    job: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 13h18"/>',
    heart: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"/>',
    paw: '<circle cx="6" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="10" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5-2 3-4 3-4 0-4-3z"/>',
    gift: '<rect x="3" y="9" width="18" height="12"/><path d="M3 13h18M12 9v12M12 9C9 9 7 4 10 4s2 5 2 5c0 0 0-5 3-5s0 5-3 5"/>',
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    fuel: '<path d="M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M3 21h12M4 10h10M14 8l3 3v7a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
    medical: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 7v10M7 12h10"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
  };
  var CONTACT_RE = /(\bTel\b|Tel\.|Telefon|Fax|www\.|@|E-?Mail|Internet|http|Postfach|☎|Chiffre|Zuschriften|\b[A-Z]{0,2}-?\d{4,5}\s+[A-ZÄÖÜ][a-zäöüß]|str\.\s*\d|straße\s*\d|strasse\s*\d|gasse\s*\d|weg\s*\d)/i;
  var PRICE_RE = /(\bEuro\b|€|\bFr\.|CHF|\bPreis)/;
  function adInline(s) {
    return markIllegible(esc(s)).replace(/\{\{([^}]*)\}\}/g, '<span class="recon" title="Rekonstruiert – im Original unscharf, nicht sicher lesbar">$1</span>');
  }
  function renderAd(a) {
    var st = a.style || { variant: "classic", head: 1 };
    var lines = a.text.split("\n").filter(function (l) { return l.trim() !== ""; });
    var head = lines.slice(0, st.head), body = lines.slice(st.head);
    var bodyHtml = "", contact = [], para = "", prevRaw = "";
    function flush() { if (para) { bodyHtml += '<p class="ad-line">' + para + "</p>"; para = ""; } }
    body.forEach(function (l, i) {
      var isContact = CONTACT_RE.test(l) && i >= body.length - 6;
      if (isContact) { flush(); contact.push(l); return; }
      if (contact.length) { bodyHtml += contact.map(function (c) { return '<div class="ad-contact">' + adInline(c) + "</div>"; }).join(""); contact = []; }
      var bullet = /^\s*[•\-–·*]\s/.test(l), price = PRICE_RE.test(l) && /\d/.test(l) && l.length < 60;
      var cont = para && /-$/.test(prevRaw) && !bullet;
      var standalone = !cont && (bullet || price || l.length <= 22 || (l === l.toUpperCase() && /[A-ZÄÖÜ]{3}/.test(l)));
      if (standalone) { flush(); bodyHtml += '<div class="' + (bullet ? "ad-bullet" : price ? "ad-price" : "ad-line") + '">' + adInline(l) + "</div>"; prevRaw = ""; return; }
      var t = adInline(l);
      if (!para) para = t;
      else if (/-$/.test(prevRaw) && /^(und|oder|bzw\.?|sowie|bis|u\.)(\s|$)/.test(l)) para += " " + t;   // "Wirtschafts- und ..."
      else if (/[a-zäöüß]-$/.test(prevRaw) && /^[a-zäöüß]/.test(l)) para = para.replace(/-$/, "&shy;") + t;   // line-break hyphenation
      else if (/-$/.test(prevRaw)) para += t;   // "Themen-" + "Events"
      else para += " " + t;
      prevRaw = l;
    });
    flush();
    var contactHtml = contact.length ? '<div class="ad-contacts">' + contact.map(function (c) { return '<div class="ad-contact">' + adInline(c) + "</div>"; }).join("") + "</div>" : "";
    var icon = st.icon && ICON[st.icon] ? '<svg class="ad-icon" viewBox="0 0 24 24" aria-hidden="true">' + ICON[st.icon] + "</svg>" : "";
    return '<article class="ad v-' + st.variant + (st.span === 2 ? " wide" : "") + '" aria-label="Anzeige ' + U(a.key) + '">' +
      '<span class="ad-key">' + a.key + "</span>" +
      '<header class="ad-head">' + icon + "<div>" + head.map(function (l, i) { return '<div class="' + (i === 0 ? "ad-h1" : "ad-h2") + '">' + adInline(l) + "</div>"; }).join("") + "</div></header>" +
      '<div class="ad-body">' + bodyHtml + "</div>" + contactHtml + "</article>";
  }

  function gapText(ex, st, optsFor, labelFor) {
    var locked = st.checked || st.revealed;
    var html = paragraphs(ex.text);
    return html.replace(/\[\[(\d+)\]\]/g, function (_, n) {
      var s = itemStatus(ex, st, n), a = st.answers[n], c = ex.solution[n];
      var fix = "";
      if ((st.checked && a !== c) || (st.revealed && !st.checked)) fix = '<span class="fix" title="richtige Lösung">→ ' + esc(labelFor(c, n)) + "</span>";
      return '<span class="gap ' + (s === "missed" ? "wrong" : s) + '"><span class="gnum">(' + n + ")</span>" +
        selectHtml(n, optsFor(n), a, locked, "gap-select") + fix + "</span>";
    });
  }

  function renderSprach1(ex, st) {
    var g = {}; ex.gaps.forEach(function (x) { g[x.num] = x.options; });
    var h = '<div class="questions"><h2>Text mit Lücken 21–30</h2><div class="gap-text">' +
      gapText(ex, st, function (n) { return ["a", "b", "c"].map(function (k) { return [k, U(k) + ") " + g[n][k]]; }); },
        function (k, n) { return U(k) + ") " + g[n][k]; }) + "</div></div>";
    h += '<div class="card"><h2>Antwortmöglichkeiten</h2><table class="options-table"><tbody>' + ex.gaps.map(function (x) {
      return "<tr><th>" + x.num + "</th><td>" + ["a", "b", "c"].map(function (k) { return "<b>" + U(k) + "</b> " + esc(x.options[k]); }).join(" &nbsp;·&nbsp; ") + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    return h;
  }

  function renderSprach2(ex, st) {
    var w = {}; ex.words.forEach(function (x) { w[x.key] = x.word; });
    var opts = ex.words.map(function (x) { return [x.key, U(x.key) + " – " + x.word]; });
    var used = {}; Object.keys(st.answers).forEach(function (n) { if (st.answers[n]) used[st.answers[n]] = true; });
    var h = '<div class="card"><h2>Wörter (a–o) — jedes Wort passt nur einmal</h2><div class="wordbank">' + ex.words.map(function (x) {
      return '<div class="' + (used[x.key] ? "used" : "") + '"><b>' + U(x.key) + "</b>" + esc(x.word) + "</div>"; }).join("") + "</div></div>";
    h += '<div class="questions"><h2>Text mit Lücken 31–40</h2><div class="gap-text">' +
      gapText(ex, st, function () { return opts; }, function (k) { return U(k) + " – " + w[k]; }) + "</div></div>";
    return h;
  }

  var AUDIO_NOTICE = '<div class="audio-notice" role="note"><b>Hinweis: Die Original-Audioaufnahmen sind nicht vorhanden.</b> ' +
    "Diese Übung enthält die Aufgaben und die offiziellen Lösungen aus dem PDF und ist nur als Textübung nutzbar – " +
    "die echte Hörprüfung kann ohne Audio nicht nachgestellt werden. Ein Hörtext oder Transkript ist im PDF nicht enthalten." +
    '<span class="en" lang="en">Original audio recordings are not available. This exercise currently supports text-based practice using the original PDF questions and official solutions.</span></div>';
  function rfLabel(k) { return k === "+" ? "<b>richtig (+)</b>" : "<b>falsch (−)</b>"; }
  function renderHoeren(ex, st) {
    var locked = st.checked || st.revealed, n0 = ex.statements[0].num, n1 = ex.statements[ex.statements.length - 1].num;
    var h = '<div class="questions hv"><h2>Aufgaben ' + n0 + "–" + n1 + " · richtig oder falsch?</h2>";
    ex.statements.forEach(function (q) {
      var n = String(q.num), a = st.answers[n], c = ex.solution[n];
      h += '<div class="q" role="radiogroup" aria-label="Aufgabe ' + n + '"><div class="q-stem"><span class="q-num">' + n + ".</span>" + esc(q.text) + '</div><div class="rf">';
      [["+", "richtig", "+"], ["-", "falsch", "−"]].forEach(function (o) {
        var k = o[0], cls = "";
        if (st.checked) { if (k === c) cls = a === c ? "correct" : "missed"; else if (k === a) cls = "wrong"; }
        else if (st.revealed && k === c) cls = "correct";
        h += '<label class="opt ' + cls + '"><input type="radio" name="q' + n + '" value="' + k + '" data-n="' + n + '"' +
          (a === k ? " checked" : "") + (locked ? " disabled" : "") + '><span class="letter">' + o[2] + "</span><span>" + o[1] + "</span></label>";
      });
      h += "</div>" + fb(ex, st, n, rfLabel) + "</div>";
    });
    return h + "</div>";
  }

  function render() {
    list = visibleList();
    if (!list.length) { $("exercise").innerHTML = "<p>Keine Übungen für diesen Filter.</p>"; renderOverview(); return; }
    if (idx >= list.length) idx = list.length - 1;
    var ex = list[idx], st = state(ex);
    var body = { lesen1: renderLesen1, lesen2: renderLesen2, lesen3: renderLesen3, sprach1: renderSprach1, sprach2: renderSprach2,
      hoeren1: renderHoeren, hoeren2: renderHoeren, hoeren3: renderHoeren }[ex.type](ex, st);
    $("exercise").innerHTML = headerHtml(ex) + (areaOf(ex) === "hv" ? AUDIO_NOTICE : "") + scoreHtml(st) + body + notesHtml(ex);
    $("position").textContent = "Übung " + (idx + 1) + " von " + list.length;
    $("prevBtn").disabled = idx === 0;
    $("nextBtn").disabled = idx === list.length - 1;
    $("checkBtn").disabled = st.checked;
    $("solutionBtn").textContent = st.revealed ? "Lösung zeigen ✓" : "Lösung zeigen";
    $("solutionBtn").disabled = st.revealed;
    prefs.current = ex.id; save(PREF_KEY, prefs);
    if (location.hash !== "#" + ex.id) history.replaceState(null, "", "#" + ex.id);
    document.title = TYPE_LABEL[ex.type] + " · Modelltest " + ex.paper.slice(1) + " – TELC B1";
    renderOverview();
  }

  function badge(ex) {
    var st = progress[canon(ex)];
    if (!st || !st.checked || st.total == null) return st && st.revealed ? '<span class="badge">Lösung</span>' : "";
    return '<span class="badge ' + (st.score === st.total ? "done-full" : "done-part") + '">' + st.score + "/" + st.total + "</span>";
  }

  function renderOverview() {
    var html = "", lastPaper = null, done = 0;
    list.forEach(function (ex, i) {
      if (ex.paper !== lastPaper) { html += '<div class="ov-paper">Modelltest ' + ex.paper.slice(1) + "</div>"; lastPaper = ex.paper; }
      var st = progress[canon(ex)]; if (st && st.checked) done++;
      var label = SHORT[ex.type] + (ex.id.slice(-1) === "b" ? " (Variante)" : "") + (ex.topic ? " · " + ex.topic : "");
      html += '<button class="ov-item' + (i === idx ? " active" : "") + '" data-i="' + i + '"' + (i === idx ? ' aria-current="true"' : "") + '>' +
        '<span class="num">' + (i + 1) + '</span><span class="lbl">' + esc(label) + "</span>" + badge(ex) + "</button>";
    });
    $("ovList").innerHTML = html;
    $("ovStats").textContent = done + " von " + list.length + " Übungen bearbeitet";
    var act = $("ovList").querySelector(".active");
    if (act && act.scrollIntoView && !overviewScrolled) { act.scrollIntoView({ block: "nearest" }); }
  }
  var overviewScrolled = false;

  // ---------- actions ----------
  function current() { return list[idx]; }
  function check() {
    var ex = current(), st = state(ex), n = nums(ex), score = 0;
    n.forEach(function (k) { if (st.answers[k] === ex.solution[k]) score++; });
    st.checked = true; st.score = score; st.total = n.length; persist(); render();
    var s = document.querySelector(".score"); if (s && s.scrollIntoView) s.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function reveal() { var st = state(current()); st.revealed = true; persist(); render(); }
  function resetEx() { var ex = current(); progress[canon(ex)] = { answers: {}, checked: false, revealed: false, score: null, total: null }; persist(); render(); }
  function go(d) { var n = idx + d; if (n < 0 || n >= list.length) return; idx = n; render(); $("main").focus(); window.scrollTo(0, 0); }

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.closest && t.closest("#exercise") && t.getAttribute("data-n")) {
      var st = state(current()); if (st.checked || st.revealed) return;
      st.answers[t.getAttribute("data-n")] = t.value || undefined;
      if (!t.value) delete st.answers[t.getAttribute("data-n")];
      persist();
      if (current().type === "sprach2") {
        var used = {}; Object.keys(st.answers).forEach(function (k) { used[st.answers[k]] = true; });
        Array.prototype.forEach.call(document.querySelectorAll(".wordbank div"), function (d) {
          var key = d.querySelector("b").textContent.toLowerCase(); d.classList.toggle("used", !!used[key]);
        });
      }
    }
  });
  $("prevBtn").onclick = function () { go(-1); };
  $("nextBtn").onclick = function () { go(1); };
  $("checkBtn").onclick = check;
  $("solutionBtn").onclick = reveal;
  $("resetBtn").onclick = resetEx;
  $("ovList").onclick = function (e) {
    var b = e.target.closest(".ov-item"); if (!b) return;
    idx = Number(b.getAttribute("data-i")); overviewScrolled = true; render(); overviewScrolled = false;
    $("overview").classList.remove("open"); window.scrollTo(0, 0);
  };
  $("menuBtn").onclick = function () { $("overview").classList.toggle("open"); };
  $("closeOverview").onclick = function () { $("overview").classList.remove("open"); };
  function syncAreaUi() {
    Array.prototype.forEach.call(document.querySelectorAll(".area-tab"), function (b) {
      var on = b.getAttribute("data-area") === prefs.area; b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    Array.prototype.forEach.call($("typeFilter").options, function (o) {
      var a = o.getAttribute("data-area"); o.hidden = !!a && a !== prefs.area; o.disabled = o.hidden;
    });
    if ($("typeFilter").selectedOptions[0] && $("typeFilter").selectedOptions[0].disabled) prefs.type = "all";
    $("typeFilter").value = prefs.type || "all";
    $("dupeCount").textContent = String(ALL.filter(function (e) { return areaOf(e) === prefs.area; }).length);
    document.body.setAttribute("data-area", prefs.area);
  }
  Array.prototype.forEach.call(document.querySelectorAll(".area-tab"), function (b) {
    b.onclick = function () {
      var a = b.getAttribute("data-area"); if (a === prefs.area) return;
      var last = prefs["last_" + a];
      prefs["last_" + prefs.area] = current() && current().id;
      prefs.area = a; prefs.type = "all"; save(PREF_KEY, prefs); syncAreaUi(); list = visibleList(); setIndexById(last); render(); window.scrollTo(0, 0);
    };
  });
  $("showDupes").checked = !!prefs.showDupes;
  syncAreaUi();
  $("showDupes").onchange = function () { var id = current() && current().id; prefs.showDupes = this.checked; save(PREF_KEY, prefs); list = visibleList(); setIndexById(id); render(); };
  $("typeFilter").onchange = function () { var id = current() && current().id; prefs.type = this.value; save(PREF_KEY, prefs); list = visibleList(); setIndexById(id); render(); };
  $("resetAll").onclick = function () {
    if (confirm("Gesamten Fortschritt (alle Antworten und Ergebnisse) löschen?")) { progress = {}; persist(); render(); }
  };
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  });
  window.addEventListener("hashchange", function () { setIndexById(location.hash.slice(1)); render(); });

  // ---------- start ----------
  if (!ALL.length) { $("exercise").innerHTML = "<p>Die Übungsdaten (data/exercises.js) konnten nicht geladen werden.</p>"; return; }
  setIndexById(location.hash ? location.hash.slice(1) : prefs.current);
  render();
})();
