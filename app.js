/* Interface urenregistratie */
(function () {
  'use strict';
  const L = window.Logic;
  const APP_VERSION = '1.0.0';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f = (n) => L.fmt(n);
  const fs = (n) => L.fmt(n, { sign: true });
  const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  const today = () => L.todayStr();

  let state = L.defaultState();
  const ui = { tab: 'week', monday: L.mondayOf(today()), year: L.yearOf(today()) };

  // ---------- Opslag (IndexedDB, met localStorage als noodoplossing) ----------
  const DB = 'urenregistratie', STORE = 'kv';
  let dbp = null;
  function idb() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function load(key) {
    try {
      const db = await idb();
      return await new Promise((res, rej) => {
        const t = db.transaction(STORE).objectStore(STORE).get(key);
        t.onsuccess = () => res(t.result);
        t.onerror = () => rej(t.error);
      });
    } catch (e) {
      try { const v = localStorage.getItem(DB + ':' + key); return v ? JSON.parse(v) : undefined; } catch (_) { return undefined; }
    }
  }
  async function save(key, val) {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(JSON.parse(JSON.stringify(val)), key);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) {
      try { localStorage.setItem(DB + ':' + key, JSON.stringify(val)); } catch (_) { toast('Opslaan is mislukt.'); }
    }
  }
  function commit(changed = true) {
    if (changed) state.meta.lastChange = new Date().toISOString();
    save('state', state);
    render();
  }

  // ---------- Hulpjes ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function setPath(obj, path, value) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] || (o[parts[i]] = {});
    o[parts[parts.length - 1]] = value;
  }
  const daysAgo = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const asDays = (u) => {
    const dl = L.num(state.settings.daglengte) || 8;
    return `${f(u / dl)} ${Math.abs(u / dl) === 1 ? 'dag' : 'dagen'} van ${f(dl)} u`;
  };
  function yearSel() {
    return `<div class="yearsel"><button data-action="year" data-d="-1" aria-label="Vorig jaar">‹</button><b>${ui.year}</b><button data-action="year" data-d="1" aria-label="Volgend jaar">›</button></div>`;
  }

  // ---------- Weergave ----------
  function render() {
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
    const v = { week: viewWeek, saldi: viewSaldi, planning: viewPlanning, jaar: viewJaar, instellingen: viewInstellingen }[ui.tab];
    $('#view').innerHTML = v();
  }

  function banners() {
    let out = '';
    const lb = state.meta.lastBackup;
    const limit = L.num(state.settings.backupWaarschuwingDagen) || 30;
    const hasData = Object.keys(state.entries).length > 0;
    if (hasData && !lb) {
      out += `<div class="banner"><span>Je hebt nog geen back-up gemaakt.</span><button class="btn" data-action="backup">Back-up</button></div>`;
    } else if (lb && daysAgo(lb) > limit) {
      out += `<div class="banner"><span>Laatste back-up is ${daysAgo(lb)} dagen oud.</span><button class="btn" data-action="backup">Back-up</button></div>`;
    }
    const t = today();
    const past = L.vakantieYear(state, L.yearOf(t)).geplandList.filter((g) => g.date < t);
    if (past.length) {
      const u = past.reduce((a, g) => a + g.uren, 0);
      out += `<div class="banner"><span>${f(u)} u geplande vakantie ligt in het verleden.</span><button class="btn" data-action="tab" data-tab="planning">Omzetten</button></div>`;
    }
    return out;
  }

  function viewWeek() {
    const t = today();
    const w = L.weekCalc(state, ui.monday, t);
    const isCurrent = ui.monday === L.mondayOf(t);
    const showIsoYear = w.iso.year !== L.yearOf(ui.monday) || w.iso.year !== L.yearOf(w.sunday);
    let h = `<div class="weekhead">
      <button class="nav" data-action="week" data-d="-7" aria-label="Vorige week">‹</button>
      <div><div class="wk">Week ${w.iso.week}</div><div class="month">${esc(L.weekMonthLabel(ui.monday))}</div>
      ${showIsoYear ? `<div class="sub">ISO-weekjaar ${w.iso.year}</div>` : ''}</div>
      <button class="nav" data-action="week" data-d="7" aria-label="Volgende week">›</button></div>`;
    if (!isCurrent) h += `<button class="btn small todaylink" data-action="gotoday">Naar deze week</button>`;
    h += banners();
    h += '<ul class="days">';
    w.days.forEach((d, i) => {
      const chips = [];
      if (d.holiday) chips.push(`<span class="chip holname ${d.holiday.betaald ? '' : 'unpaid'}">${esc(d.holiday.name)}${d.holiday.betaald ? '' : ' · geen vrije dag'}</span>`);
      for (const c of ['werk', 'vakantie', 'compensatie', 'ziekte', 'betaald', 'onbetaald']) {
        if (d[c] > 0) chips.push(`<span class="chip ${c}">${L.SHORT[c]} ${f(d[c])}</span>`);
      }
      if (d.feestdag > 0) chips.push(`<span class="chip feestdag">F ${f(d.feestdag)}</span>`);
      if (d.gepland > 0) chips.push(`<span class="chip gepland">${L.SHORT.gepland} ${f(d.gepland)}</span>`);
      if (d.notitie) chips.push(`<span class="chip" title="${esc(d.notitie)}">✎</span>`);
      const tot = d.werk + d.afwezig;
      const right = d.hasInput || d.feestdag
        ? `<b>${f(tot)}</b>norm ${f(d.norm)}`
        : d.norm > 0 ? `norm ${f(d.norm)}` : '';
      h += `<li><button class="day ${d.date === t ? 'today' : ''} ${i >= 5 ? 'weekend' : ''}" data-action="day" data-date="${d.date}">
        <div><div class="dname">${L.DAYS[i]}</div><div class="ddate">${L.shortDate(d.date)}</div></div>
        <div class="chips">${chips.length ? chips.join('') : `<span class="empty">${d.date > t ? '' : d.norm > 0 ? 'Geen invoer' : ''}</span>`}</div>
        <div class="dright">${right}</div></button></li>`;
    });
    h += '</ul>';

    let status;
    if (!w.counted) status = '<span class="badge">Nog geen invoer · telt niet mee</span>';
    else if (w.voorlopig) {
      const why = w.sunday >= t ? 'week loopt nog' : `${w.missing.length} werkdag${w.missing.length === 1 ? '' : 'en'} zonder invoer`;
      status = `<span class="badge warn">Voorlopig · ${why}</span>`;
    } else status = '<span class="badge ok">Volledig</span>';

    h += `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h2 style="margin:0">Weektotaal</h2>${status}</div>
      <div class="rows">
        <span>Gewerkt</span><span class="r">${f(w.werk)}</span>
        <span>Meetellende afwezigheid</span><span class="r">${f(w.afwezig)}</span>
        <span class="muted small">vakantie ${f(w.vakantie)} · ziekte ${f(w.ziekte)} · feestdag ${f(w.feestdag)} · betaald verlof ${f(w.betaald)} · compensatie ${f(w.compensatie)}</span><span></span>
        <span>Contractnorm</span><span class="r">−${f(w.norm)}</span>
        <span class="total">Weekverschil</span><span class="r total ${cls(w.verschil)}">${fs(w.verschil)}</span>
        <span>Opgenomen compensatie</span><span class="r">${w.compensatie ? '−' + f(w.compensatie) : '0'}</span>
        <span class="total">Saldomutatie</span><span class="r total ${cls(w.mutatie)}">${fs(w.mutatie)}</span>
        ${w.onbetaald ? `<span class="muted small">Onbetaald verlof (${f(w.onbetaald)} u) vult de norm niet aan.</span><span></span>` : ''}
      </div></div>`;
    const y = L.yearOf(t);
    const u = L.urenYear(state, y, t), v = L.vakantieYear(state, y);
    h += `<div class="card"><div class="rows">
      <span>Urensaldo ${y}${u.voorlopig ? ' <span class="badge warn">voorlopig</span>' : ''}</span><span class="r ${cls(u.totaal)}"><b>${fs(u.totaal)} u</b></span>
      <span>Vakantie beschikbaar ${y}</span><span class="r"><b>${f(v.beschikbaar)} u</b></span>
    </div></div>`;
    return h;
  }

  function viewSaldi() {
    const y = ui.year, t = today();
    const u = L.urenYear(state, y, t), v = L.vakantieYear(state, y);
    const closed = state.years[y] && state.years[y].closed;
    let h = `<h1>Saldi</h1>${yearSel()}`;
    if (closed) h += `<div class="banner"><span>${y} is afgesloten op ${esc(closed.at)}. Wijzigingen veranderen het overgedragen saldo niet.</span></div>`;
    h += `<div class="card"><h2>Urensaldo ${u.voorlopig ? '<span class="badge warn">voorlopig</span>' : ''}</h2>
      <div class="big ${cls(u.totaal)}">${fs(u.totaal)} u</div>
      <div class="rows" style="margin-top:8px">
        <span>Beginsaldo</span><span class="r">${fs(u.begin)}</span>
        <span>Mutaties weken (${u.weeks.length})</span><span class="r">${fs(u.mutaties)}</span>
        <span>Correcties</span><span class="r">${fs(u.corrSum)}</span>
        <span class="total">Saldo</span><span class="r total ${cls(u.totaal)}">${fs(u.totaal)}</span>
      </div></div>`;
    h += `<div class="card"><h2>Vakantie</h2>
      <div class="big">${f(v.beschikbaar)} u</div><div class="muted small">beschikbaar na planning · ${asDays(v.beschikbaar)}</div>
      <div class="rows" style="margin-top:8px">
        <span>Beginsaldo</span><span class="r">${f(v.begin)}</span>
        <span>Jaarrecht ${y}</span><span class="r">+${f(v.jaarrecht)}</span>
        <span>Opgenomen</span><span class="r">−${f(v.opgenomen)}</span>
        <span>Correcties</span><span class="r">${fs(v.corrSum)}</span>
        <span class="total">Resterend</span><span class="r total">${f(v.saldo)}</span>
        <span>Gepland (reservering)</span><span class="r">−${f(v.gepland)}</span>
        <span class="total">Beschikbaar na planning</span><span class="r total">${f(v.beschikbaar)}</span>
      </div></div>`;

    h += `<div class="card"><h2>Weekmutaties</h2>`;
    if (!u.weeks.length) h += '<p class="muted">Nog geen ingevoerde weken in dit jaar.</p>';
    else {
      h += '<ul class="list">' + u.weeks.slice().reverse().map((w) => `<li><button class="link" data-action="openweek" data-monday="${w.monday}">Week ${w.iso.week} · ${L.shortDate(w.monday)}${w.partial ? ' (deel)' : ''}</button>
        <span>${w.voorlopig ? '<span class="badge warn">voorlopig</span> ' : ''}<b class="num ${cls(w.mutatie)}">${fs(w.mutatie)}</b></span></li>`).join('') + '</ul>';
    }
    h += '</div>';

    const corr = state.corrections.filter((c) => L.yearOf(c.datum) === y).sort((a, b) => (a.datum < b.datum ? -1 : 1));
    h += `<div class="card"><h2>Correcties</h2><p class="muted small">Voor vervallen uren, afwijkende afspraken of een contractwijziging. Een correctie blijft zichtbaar.</p>`;
    if (corr.length) {
      h += '<ul class="list">' + corr.map((c) => `<li><span><b>${c.soort === 'uren' ? 'Uren' : 'Vakantie'}</b> · ${L.shortDate(c.datum)}<br><span class="muted small">${esc(c.omschrijving)}</span></span>
        <span><b class="num ${cls(c.uren)}">${fs(c.uren)}</b> <button class="btn danger small" data-action="delcorr" data-id="${c.id}" aria-label="Verwijderen">✕</button></span></li>`).join('') + '</ul>';
    }
    const defDate = L.yearOf(t) === y ? t : `${y}-12-31`;
    h += `<form id="corrForm" style="margin-top:10px">
      <label class="field"><span>Soort</span><select name="soort"><option value="uren">Urensaldo</option><option value="vakantie">Vakantiesaldo</option></select></label>
      <label class="field"><span>Datum</span><input type="date" name="datum" value="${defDate}" min="${y}-01-01" max="${y}-12-31" required></label>
      <label class="field"><span>Uren (− voor aftrek)</span><input class="numin" name="uren" inputmode="decimal" placeholder="bijv. −8" required></label>
      <label class="field stack"><span>Omschrijving</span><input name="omschrijving" placeholder="Reden van de correctie" required></label>
      <div class="btnrow"><button class="btn primary grow" type="submit">Correctie toevoegen</button></div></form></div>`;
    return h;
  }

  function viewPlanning() {
    const y = ui.year, t = today();
    const v = L.vakantieYear(state, y);
    const past = v.geplandList.filter((g) => g.date < t);
    const future = v.geplandList.filter((g) => g.date >= t);
    let h = `<h1>Planning</h1>${yearSel()}
      <div class="card"><div class="rows">
        <span>Resterend vakantiesaldo</span><span class="r">${f(v.saldo)} u</span>
        <span>Gepland</span><span class="r">−${f(v.gepland)} u</span>
        <span class="total">Beschikbaar na planning</span><span class="r total">${f(v.beschikbaar)} u</span>
      </div><p class="muted small">${asDays(v.beschikbaar)} · herinnering bij meer dan ${f(state.settings.herinneringGrens)} u</p></div>`;
    const from = L.yearOf(t) === y ? t : `${y}-01-01`;
    h += `<div class="card"><h2>Vakantie plannen</h2>
      <form id="planForm">
        <label class="field"><span>Van</span><input type="date" name="van" value="${from}" min="${y}-01-01" max="${y}-12-31" required></label>
        <label class="field"><span>Tot en met</span><input type="date" name="tot" value="${from}" min="${y}-01-01" max="${y}-12-31" required></label>
        <p class="muted small">Elke werkdag in je patroon krijgt de dagnorm als geplande vakantie. Vrije dagen en betaalde feestdagen worden overgeslagen. Een halve dag pas je aan in het weekscherm.</p>
        <div class="btnrow"><button class="btn primary grow" type="submit">Inplannen</button></div>
      </form></div>`;
    if (past.length) {
      h += `<div class="card"><h2>In het verleden — omzetten naar opgenomen</h2><ul class="list">` +
        past.map((g) => `<li><button class="link" data-action="day" data-date="${g.date}">${L.DAYS[L.weekday(g.date)]} ${L.shortDate(g.date)}</button>
          <span><b class="num">${f(g.uren)} u</b> <button class="btn small" data-action="convert" data-date="${g.date}">Omzetten</button></span></li>`).join('') +
        `</ul><div class="btnrow"><button class="btn grow" data-action="convertall">Alles omzetten</button></div>
        <p class="muted small">Niet doorgegaan? Verwijder de planning via de dag zelf.</p></div>`;
    }
    h += `<div class="card"><h2>Gepland</h2>`;
    if (!future.length) h += '<p class="muted">Geen geplande vakantie.</p>';
    else {
      h += '<ul class="list">' + future.map((g) => `<li><button class="link" data-action="day" data-date="${g.date}">${L.DAYS[L.weekday(g.date)]} ${L.shortDate(g.date)} · week ${L.isoWeek(g.date).week}</button>
        <span><b class="num">${f(g.uren)} u</b> <button class="btn danger small" data-action="unplan" data-date="${g.date}" aria-label="Planning verwijderen">✕</button></span></li>`).join('') + '</ul>';
    }
    h += '</div>';
    return h;
  }

  function viewJaar() {
    const y = ui.year, t = today();
    const cfg = state.years[y] || {};
    let h = `<h1>Jaar afsluiten</h1>${yearSel()}`;
    if (cfg.closed) {
      const c = cfg.closed;
      h += `<div class="card"><h2>${y} is afgesloten <span class="badge ok">${esc(c.at)}</span></h2>
        <div class="rows"><span>Urensaldo overgedragen</span><span class="r ${cls(c.eindUren)}">${fs(c.eindUren)} u</span>
        <span>Vakantiesaldo overgedragen</span><span class="r">${f(c.eindVakantie)} u</span></div>
        <p class="muted small">Deze saldi zijn het beginsaldo van ${y + 1}. Het jaarrecht van ${y + 1} komt er één keer bij.</p>
        <div class="btnrow"><button class="btn danger" data-action="reopen">Afsluiting ongedaan maken</button></div></div>`;
      return h + closedHistory();
    }
    const c = L.closeChecks(state, y, t);
    const next = state.years[y + 1] || {};
    const manualNext = next.beginUren != null || next.beginVakantie != null;
    const weekList = (arr) => arr.slice(0, 12).map((x) => `<button class="link" data-action="openweek" data-monday="${x.monday || x}">wk ${(x.iso || L.isoWeek(x)).week}</button>`).join(', ') + (arr.length > 12 ? ' …' : '');
    if (y > L.yearOf(t)) h += `<div class="banner"><span>Dit jaar is nog niet begonnen.</span></div>`;
    else if (y === L.yearOf(t)) h += `<div class="banner"><span>Dit jaar loopt nog. Afsluiten kan, maar doe het bij voorkeur na 31 december.</span></div>`;

    h += `<div class="card"><h2>Controleoverzicht</h2>
      <label class="check"><input type="checkbox" data-close="1"><span><b>Alle weken volledig ingevuld?</b><br>
        <span class="small ${c.voorlopigeWeken.length || c.legeWeken.length ? 'neg' : 'muted'}">
        ${c.voorlopigeWeken.length ? `Voorlopig: ${weekList(c.voorlopigeWeken)}. ` : ''}
        ${c.legeWeken.length ? `Zonder invoer: ${weekList(c.legeWeken)}.` : ''}
        ${!c.voorlopigeWeken.length && !c.legeWeken.length ? 'Alle weken met werkdagen zijn ingevuld.' : ''}</span></span></label>
      <label class="check"><input type="checkbox" data-close="1"><span><b>Kloppen de saldi?</b><br>
        <span class="small muted">Urensaldo <b class="${cls(c.uren.totaal)}">${fs(c.uren.totaal)} u</b> · vakantiesaldo <b>${f(c.vakantie.saldo)} u</b></span></span></label>
      <label class="check"><input type="checkbox" data-close="1"><span><b>Wat gaat er mee naar ${y + 1}?</b><br>
        <span class="small muted">Urensaldo ${fs(c.uren.totaal)} u en vakantiesaldo ${f(c.vakantie.saldo)} u worden het beginsaldo van ${y + 1}; het jaarrecht van ${y + 1} (${f(L.jaarrecht(state, y + 1))} u) komt er één keer bij. Overwerk en vakantie blijven gescheiden.</span>
        ${c.geplandOpen.length ? `<br><span class="small neg">Nog ${c.geplandOpen.length} geplande vakantiedag(en) in ${y} niet omgezet; die tellen niet als opgenomen.</span>` : ''}
        ${manualNext ? `<br><span class="small neg">${y + 1} heeft al een handmatig beginsaldo; dat wordt vervangen (en hersteld bij ongedaan maken).</span>` : ''}</span></label>
      <label class="check"><input type="checkbox" data-close="1"><span><b>Correcties en uitzonderingen vastgelegd?</b><br>
        <span class="small muted">${c.uren.correcties.length + c.vakantie.correcties.length} correctie(s) in ${y}, bijv. voor vervallen vakantie-uren. <button class="link" data-action="tab" data-tab="saldi">Bekijken</button></span></span></label>
      <label class="check"><input type="checkbox" data-close="1"><span><b>Actuele back-up opgeslagen?</b><br>
        <span class="small ${c.backupOk ? 'pos' : 'neg'}">${c.backupOk ? 'Ja, na de laatste wijziging.' : 'Nee — maak eerst een back-up.'}</span>
        ${c.backupOk ? '' : ' <button class="btn small" data-action="backup">Back-up maken</button>'}</span></label>
      <div class="btnrow"><button class="btn primary grow" id="closeBtn" data-action="closeyear" disabled>Jaar ${y} afsluiten</button></div>
      </div>`;
    return h + closedHistory();
  }
  function closedHistory() {
    const ys = Object.keys(state.years).filter((k) => state.years[k].closed).sort().reverse();
    if (!ys.length) return '';
    return `<div class="card"><h2>Afgesloten jaren</h2><ul class="list">${ys.map((k) => {
      const c = state.years[k].closed;
      return `<li><button class="link" data-action="setyear" data-year="${k}">${k}</button><span class="small muted">uren ${fs(c.eindUren)} · vakantie ${f(c.eindVakantie)}</span></li>`;
    }).join('')}</ul></div>`;
  }

  function viewInstellingen() {
    const s = state.settings, y = ui.year, yc = state.years[y] || {};
    const contract = L.contractUren(state), pt = L.patroonTotaal(state);
    let h = `<h1>Instellingen</h1>
      <div class="card"><h2>Contract</h2>
        <label class="field"><span>Voltijd (uur per week)</span><input type="number" step="0.5" min="0" data-set="settings.voltijd" value="${s.voltijd}"></label>
        <label class="field"><span>Parttimefactor</span><input type="number" step="0.01" min="0" max="1.5" data-set="settings.factor" value="${s.factor}"></label>
        <label class="field"><span>Contracturen per week</span><b class="num">${f(contract)}</b></label>
        <div style="padding-top:8px"><span>Werkpatroon (uren per dag)</span>
        <div class="pattern">${L.DAYS.map((d, i) => `<label>${d}<input type="number" step="0.5" min="0" max="24" data-set="settings.patroon.${i}" value="${s.patroon[i]}"></label>`).join('')}</div></div>
        ${Math.abs(pt - contract) > 0.001 ? `<div class="warnbox">Het patroon telt op tot ${f(pt)} u, maar je contract is ${f(contract)} u. De weeknorm volgt het patroon.</div>` : ''}
      </div>
      <div class="card"><h2>Vakantie en herinnering</h2>
        <label class="field"><span>Vakantiedagen bij voltijd</span><input type="number" step="0.5" min="0" data-set="settings.vakantieDagenVoltijd" value="${s.vakantieDagenVoltijd}"></label>
        <label class="field"><span>Daglengte (uren)</span><input type="number" step="0.5" min="1" data-set="settings.daglengte" value="${s.daglengte}"></label>
        <label class="field"><span>Standaard jaarrecht</span><b class="num">${f(L.jaarrechtStandaard(state))} u</b></label>
        <label class="field"><span>Herinnering bij meer dan (uren)</span><input type="number" step="0.5" min="0" data-set="settings.herinneringGrens" value="${s.herinneringGrens}"></label>
        <p class="muted small">Controle op 1 feb, 1 apr, 1 jun, 1 aug, 1 okt en 1 dec, bij het openen van de app. ${f(s.herinneringGrens)} u = ${asDays(L.num(s.herinneringGrens))}.</p>
      </div>
      <div class="card"><h2>Per jaar</h2>${yearSel()}
        ${yc.transferFrom ? `<p class="muted small">Beginsaldi zijn overgedragen uit ${yc.transferFrom}. Wijzigen kan via “Afsluiting ongedaan maken” bij Jaar.</p>` : ''}
        <label class="field"><span>Beginsaldo uren</span><input type="number" step="0.5" data-set="years.${y}.beginUren" value="${yc.beginUren != null ? yc.beginUren : ''}" placeholder="0" ${yc.transferFrom ? 'disabled' : ''}></label>
        <label class="field"><span>Beginsaldo vakantie-uren</span><input type="number" step="0.5" data-set="years.${y}.beginVakantie" value="${yc.beginVakantie != null ? yc.beginVakantie : ''}" placeholder="0" ${yc.transferFrom ? 'disabled' : ''}></label>
        <label class="field"><span>Jaarrecht ${y} (afwijkend)</span><input type="number" step="0.5" min="0" data-set="years.${y}.jaarrecht" value="${yc.jaarrecht != null ? yc.jaarrecht : ''}" placeholder="${f(L.jaarrechtStandaard(state))}"></label>
        <p class="muted small">Leeg laten voor het standaard jaarrecht. Vul een afwijkend getal in bij een contractwijziging of een onvolledig dienstjaar.</p>
        <h3>Feestdagen ${y}</h3>
        <ul class="list">${L.holidays(y).map((hd) => {
          const info = L.holidayInfo(state, hd.date);
          return `<li><span><b>${esc(hd.name)}</b><br><span class="small muted">${L.DAYS[L.weekday(hd.date)]} ${L.shortDate(hd.date)} · norm ${f(L.dagnorm(state, hd.date))}</span></span>
            <span style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-hol="${hd.date}" data-k="betaald" ${info.betaald ? 'checked' : ''} aria-label="Betaalde vrije dag">
            <input class="numin" style="width:64px" inputmode="decimal" data-hol="${hd.date}" data-k="uren" value="${info.betaald ? f(info.uren) : ''}" ${info.betaald ? '' : 'disabled'} aria-label="Feestdaguren"></span></li>`;
        }).join('')}</ul>
        <p class="muted small">Vinkje = betaalde vrije dag; het getal is het aantal uren dat de norm aanvult.</p>
      </div>
      <div class="card"><h2>Back-up</h2>
        <p>Laatste back-up: <b>${state.meta.lastBackup ? new Date(state.meta.lastBackup).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : 'nog nooit'}</b></p>
        <p class="muted small" id="persistInfo">Opslagstatus wordt gecontroleerd…</p>
        <p class="muted small">Bewaar het herstelbestand in iCloud Drive via “Bewaar in Bestanden”. Excel en PDF zijn rapportages en geen back-up.</p>
        <div class="btnrow"><button class="btn primary grow" data-action="backup">Back-up maken</button><button class="btn grow" data-action="import">Terugzetten</button></div>
        <div class="btnrow" id="prevRow" hidden><button class="btn ghost small" data-action="restoreprev">Versie van vóór de laatste import herstellen</button></div>
      </div>
      <div class="card"><h2>Exporteren</h2>
        <form id="exportForm">
          <div class="btnrow" style="margin-top:0"><button type="button" class="btn small" data-action="preset" data-p="week">Deze week</button><button type="button" class="btn small" data-action="preset" data-p="maand">Deze maand</button><button type="button" class="btn small" data-action="preset" data-p="jaar">Jaar ${y}</button></div>
          <label class="field"><span>Van</span><input type="date" name="van" value="${ui.exportVan || `${y}-01-01`}" required></label>
          <label class="field"><span>Tot en met</span><input type="date" name="tot" value="${ui.exportTot || `${y}-12-31`}" required></label>
          <div class="btnrow"><button type="button" class="btn grow" data-action="excel">Excel</button><button type="button" class="btn grow" data-action="pdf">PDF / afdrukken</button></div>
        </form>
      </div>
      <p class="muted small" style="text-align:center">Urenregistratie ${APP_VERSION} · gegevens blijven op dit apparaat</p>`;
    setTimeout(updatePersistInfo, 0);
    return h;
  }
  async function updatePersistInfo() {
    const el = $('#persistInfo');
    if (!el) return;
    let txt = 'Blijvende opslag wordt niet ondersteund door deze browser.';
    try {
      if (navigator.storage && navigator.storage.persisted) {
        const p = await navigator.storage.persisted();
        txt = p ? 'Blijvende opslag is toegekend.' : 'Blijvende opslag is (nog) niet toegekend. Zet de app op je beginscherm en maak regelmatig een back-up.';
      }
    } catch (_) { /* negeren */ }
    el.textContent = txt;
    const prev = await load('previous');
    const row = $('#prevRow');
    if (row) row.hidden = !prev;
  }

  // ---------- Dag bewerken ----------
  function stepper(name, label, value, quick) {
    return `<div class="step"><label for="f_${name}">${label}</label>
      <div class="ctl"><button type="button" data-step="-0.5" data-for="${name}" aria-label="Min een half uur">−</button>
      <input id="f_${name}" name="${name}" inputmode="decimal" autocomplete="off" value="${value ? f(value) : ''}" placeholder="0">
      <button type="button" data-step="0.5" data-for="${name}" aria-label="Plus een half uur">+</button></div>
      ${quick || ''}</div>`;
  }
  function openDay(date) {
    const e = state.entries[date] || {};
    const norm = L.dagnorm(state, date);
    const h = L.holidayInfo(state, date);
    const iso = L.isoWeek(date);
    const quick = (name) => norm > 0
      ? `<div class="quick"><button type="button" class="btn small" data-fill="${name}" data-v="${norm}">Hele dag (${f(norm)})</button><button type="button" class="btn small" data-fill="${name}" data-v="${norm / 2}">Halve dag (${f(norm / 2)})</button></div>`
      : '';
    const sheet = $('#sheet');
    sheet.innerHTML = `<form class="sheet" id="dayForm" data-date="${date}">
      <header><h2>${L.longDate(date)}</h2><div class="muted small">Week ${iso.week} · norm ${f(norm)} u</div></header>
      ${h ? `<div class="holbox"><b>${esc(h.name)}</b>
        <label class="field" style="border:0"><span>Betaalde vrije dag</span><input type="checkbox" name="h_betaald" ${h.betaald ? 'checked' : ''}></label>
        ${stepper('h_uren', 'Feestdaguren', h.betaald ? h.uren : 0)}</div>` : ''}
      ${stepper('werk', 'Werken', e.werk)}
      ${stepper('vakantie', 'Vakantie (opgenomen)', e.vakantie, quick('vakantie'))}
      ${stepper('compensatie', 'Compensatie (overuren opnemen)', e.compensatie)}
      ${stepper('ziekte', 'Ziekte', e.ziekte)}
      ${stepper('betaald', 'Betaald verlof', e.betaald)}
      ${stepper('onbetaald', 'Onbetaald verlof', e.onbetaald)}
      ${stepper('gepland', 'Vakantie gepland (reservering)', e.gepland, quick('gepland'))}
      <label class="field stack" style="border:0"><span>Notitie</span><textarea name="notitie" rows="2">${esc(e.notitie || '')}</textarea></label>
      ${norm === 0 ? '<div class="warnbox">Volgens je werkpatroon is dit een vrije dag (norm 0). Vakantie kost hier geen uren.</div>' : ''}
      <div class="btnrow"><button type="button" class="btn danger" data-action="clearday">Wissen</button><span class="grow"></span>
      <button type="button" class="btn" data-action="closesheet">Annuleren</button><button type="submit" class="btn primary">Opslaan</button></div>
    </form>`;
    sheet.showModal();
  }
  function readNum(form, name) {
    const el = form.elements[name];
    if (!el) return 0;
    return Math.max(0, L.roundHalf(L.num(el.value)));
  }
  function saveDay(form) {
    const date = form.dataset.date;
    const norm = L.dagnorm(state, date);
    const h = L.holidayInfo(state, date);
    const e = {};
    for (const c of [...L.CATS, 'gepland']) { const v = readNum(form, c); if (v) e[c] = v; }
    const note = form.elements.notitie.value.trim();
    if (note) e.notitie = note;
    const total = L.CATS.reduce((a, c) => a + (e[c] || 0), 0);
    if (total > 24) { alert('Er staat meer dan 24 uur op deze dag.'); return; }
    if (norm === 0 && e.vakantie) {
      if (!confirm('Dit is een vrije dag in je patroon; vakantie kost hier normaal geen uren. Toch ' + f(e.vakantie) + ' vakantie-uur vastleggen?')) return;
    }
    if (h) {
      const betaald = form.elements.h_betaald.checked;
      let uren = betaald ? readNum(form, 'h_uren') : 0;
      const werk = e.werk || 0;
      if (betaald && uren > 0 && werk > 0 && werk + uren > norm) {
        const max = Math.max(0, norm - werk);
        const ok = confirm(`Je werkt op een betaalde feestdag. Werk (${f(werk)}) + feestdaguren (${f(uren)}) is meer dan de dagnorm (${f(norm)}).\n\nOK = het werk is overwerk bovenop de feestdag.\nAnnuleren = feestdaguren verlagen naar ${f(max)}.`);
        if (!ok) uren = max;
      }
      const def = h.defaultPaid;
      const sameAsDefault = betaald === def && (!betaald || uren === norm);
      if (sameAsDefault) delete state.holidays[date];
      else state.holidays[date] = { betaald, uren };
    }
    if (Object.keys(e).length) state.entries[date] = e; else delete state.entries[date];
    $('#sheet').close();
    commit();
  }

  // ---------- Back-up ----------
  async function deliver(blob, name) {
    try {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: name });
        return true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }
  async function doBackup() {
    const now = new Date().toISOString();
    const copy = JSON.parse(JSON.stringify(state));
    copy.meta.lastBackup = now;
    const data = { app: 'urenregistratie', formaat: 1, exportedAt: now, appVersion: APP_VERSION, state: copy };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const ok = await deliver(blob, `urenregistratie-backup-${today()}.json`);
    if (ok) { state.meta.lastBackup = now; commit(false); toast('Back-up gemaakt.'); }
  }
  function startImport() { const i = $('#importFile'); i.value = ''; i.click(); }
  async function handleImport(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { alert('Dit bestand is geen geldig herstelbestand.'); return; }
    if (!data || data.app !== 'urenregistratie' || !data.state || !data.state.settings || !data.state.entries) {
      alert('Dit bestand is geen herstelbestand van deze app.'); return;
    }
    const s = L.normalize(data.state);
    const n = Object.keys(s.entries).length, cur = Object.keys(state.entries).length;
    const yrs = [...new Set(Object.keys(s.entries).map((d) => d.slice(0, 4)))].sort();
    const sheet = $('#sheet');
    sheet.innerHTML = `<div class="sheet"><h2>Back-up terugzetten?</h2>
      <div class="rows" style="margin:10px 0">
        <span>Gemaakt op</span><span class="r">${esc(new Date(data.exportedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }))}</span>
        <span>Geregistreerde dagen</span><span class="r">${n}</span>
        <span>Jaren</span><span class="r">${esc(yrs.join(', ') || '—')}</span>
        <span>Correcties</span><span class="r">${s.corrections.length}</span>
        <span>Contract</span><span class="r">${f(s.settings.voltijd)} × ${f(s.settings.factor)}</span>
      </div>
      <div class="warnbox">Dit vervangt alle huidige gegevens (${cur} dagen). De huidige versie wordt eerst apart bewaard en kan daarna nog worden hersteld.</div>
      <div class="btnrow"><button class="btn grow" data-action="closesheet">Annuleren</button><button class="btn primary grow" id="confirmImport">Terugzetten</button></div></div>`;
    sheet.showModal();
    $('#confirmImport').onclick = async () => {
      await save('previous', state);
      state = s;
      sheet.close();
      commit(false);
      toast('Back-up teruggezet.');
    };
  }

  // ---------- Exporteren ----------
  function periodDays(van, tot) {
    const out = [];
    for (let d = van; d <= tot; d = L.addDays(d, 1)) out.push(d);
    return out;
  }
  function exportRange() {
    const form = $('#exportForm');
    const van = form.elements.van.value, tot = form.elements.tot.value;
    if (!van || !tot || van > tot) { alert('Kies een geldige periode.'); return null; }
    ui.exportVan = van; ui.exportTot = tot;
    return { van, tot };
  }
  function weeksInRange(van, tot) {
    const out = [];
    for (let m = L.mondayOf(van); m <= tot; m = L.addDays(m, 7)) out.push(L.weekCalc(state, m));
    return out;
  }
  function exportExcel() {
    const r = exportRange(); if (!r) return;
    const head = ['Datum', 'Dag', 'Week', 'Werken', 'Vakantie', 'Gepland', 'Compensatie', 'Ziekte', 'Feestdag', 'Betaald verlof', 'Onbetaald verlof', 'Norm', 'Dagmutatie', 'Feestdagnaam', 'Notitie'];
    const rows = [head];
    for (const d of periodDays(r.van, r.tot)) {
      const c = L.dayCalc(state, d);
      if (!c.hasInput && !c.gepland && !c.holiday && !c.notitie) continue;
      rows.push([d, L.DAYS[L.weekday(d)], L.isoWeek(d).week, c.werk, c.vakantie, c.gepland, c.compensatie, c.ziekte, c.feestdag, c.betaald, c.onbetaald, c.norm, c.hasInput ? c.mutatie : 0, c.holiday ? c.holiday.name : '', c.notitie]);
    }
    const wrows = [['Week', 'ISO-jaar', 'Maandag', 'Gewerkt', 'Meetellende afwezigheid', 'Norm', 'Weekverschil', 'Compensatie', 'Saldomutatie', 'Vakantie', 'Ziekte', 'Onbetaald', 'Status']];
    for (const w of weeksInRange(r.van, r.tot)) {
      wrows.push([w.iso.week, w.iso.year, w.monday, w.werk, w.afwezig, w.norm, w.verschil, w.compensatie, w.mutatie, w.vakantie, w.ziekte, w.onbetaald, !w.counted ? 'niet ingevoerd' : w.voorlopig ? 'voorlopig' : 'volledig']);
    }
    const srows = [['Jaar', 'Beginsaldo uren', 'Mutaties', 'Correcties uren', 'Urensaldo', 'Beginsaldo vakantie', 'Jaarrecht', 'Opgenomen', 'Correcties vakantie', 'Vakantiesaldo', 'Gepland', 'Beschikbaar']];
    for (let y = L.yearOf(r.van); y <= L.yearOf(r.tot); y++) {
      const u = L.urenYear(state, y), v = L.vakantieYear(state, y);
      srows.push([y, u.begin, u.mutaties, u.corrSum, u.totaal, v.begin, v.jaarrecht, v.opgenomen, v.corrSum, v.saldo, v.gepland, v.beschikbaar]);
    }
    const crows = [['Datum', 'Soort', 'Uren', 'Omschrijving']].concat(
      state.corrections.filter((c) => c.datum >= r.van && c.datum <= r.tot).map((c) => [c.datum, c.soort, L.num(c.uren), c.omschrijving]));
    const blob = window.XLSX.workbook([
      { name: 'Registratie', rows, boldRows: [0], widths: [12, 5, 6, 8, 9, 8, 12, 7, 9, 13, 15, 6, 11, 18, 30] },
      { name: 'Weken', rows: wrows, boldRows: [0], widths: [6, 8, 12, 9, 22, 7, 13, 12, 13, 9, 7, 10, 14] },
      { name: 'Saldi', rows: srows, boldRows: [0], widths: [6, 15, 10, 15, 11, 18, 10, 11, 18, 13, 9, 12] },
      { name: 'Correcties', rows: crows, boldRows: [0], widths: [12, 10, 8, 40] },
    ]);
    deliver(blob, `urenregistratie-${r.van}-tm-${r.tot}.xlsx`);
  }
  function exportPdf() {
    const r = exportRange(); if (!r) return;
    const s = state.settings;
    let h = `<h1>Urenoverzicht ${L.shortDate(r.van)} ${L.yearOf(r.van)} t/m ${L.shortDate(r.tot)} ${L.yearOf(r.tot)}</h1>
      <div class="meta">Contract ${f(s.voltijd)} u × ${f(s.factor)} = ${f(L.contractUren(state))} u per week · patroon ${L.DAYS.map((d, i) => `${d} ${f(s.patroon[i])}`).join(', ')} · afgedrukt ${L.longDate(today())}</div>`;
    for (const w of weeksInRange(r.van, r.tot)) {
      const days = w.days.filter((d) => d.date >= r.van && d.date <= r.tot);
      h += `<h2>Week ${w.iso.week} · ${esc(L.weekMonthLabel(w.monday))}${!w.counted ? ' · niet ingevoerd' : w.voorlopig ? ' · voorlopig' : ''}</h2>
        <table><thead><tr><th>Dag</th><th>Werk</th><th>Vak.</th><th>Comp.</th><th>Ziek</th><th>Feestd.</th><th>Betaald v.</th><th>Onbet. v.</th><th>Norm</th><th>Gepland</th></tr></thead><tbody>
        ${days.map((d) => `<tr><td>${L.DAYS[L.weekday(d.date)]} ${L.shortDate(d.date)}${d.holiday ? ' · ' + esc(d.holiday.name) : ''}${d.notitie ? ' · ' + esc(d.notitie) : ''}</td><td>${f(d.werk)}</td><td>${f(d.vakantie)}</td><td>${f(d.compensatie)}</td><td>${f(d.ziekte)}</td><td>${f(d.feestdag)}</td><td>${f(d.betaald)}</td><td>${f(d.onbetaald)}</td><td>${f(d.norm)}</td><td>${f(d.gepland)}</td></tr>`).join('')}
        <tr class="tot"><td>Week: verschil ${fs(w.verschil)} · mutatie ${fs(w.mutatie)}</td><td>${f(w.werk)}</td><td>${f(w.vakantie)}</td><td>${f(w.compensatie)}</td><td>${f(w.ziekte)}</td><td>${f(w.feestdag)}</td><td>${f(w.betaald)}</td><td>${f(w.onbetaald)}</td><td>${f(w.norm)}</td><td>${f(w.gepland)}</td></tr></tbody></table>`;
    }
    for (let y = L.yearOf(r.van); y <= L.yearOf(r.tot); y++) {
      const u = L.urenYear(state, y), v = L.vakantieYear(state, y);
      h += `<h2>Saldi ${y} (stand nu)</h2><table><tbody>
        <tr><td>Urensaldo: begin ${fs(u.begin)} + mutaties ${fs(u.mutaties)} + correcties ${fs(u.corrSum)}</td><td><b>${fs(u.totaal)} u</b></td></tr>
        <tr><td>Vakantie: begin ${f(v.begin)} + jaarrecht ${f(v.jaarrecht)} − opgenomen ${f(v.opgenomen)} + correcties ${fs(v.corrSum)}</td><td><b>${f(v.saldo)} u</b></td></tr>
        <tr><td>Gepland ${f(v.gepland)} → beschikbaar na planning</td><td><b>${f(v.beschikbaar)} u</b></td></tr></tbody></table>`;
    }
    $('#print').innerHTML = h;
    window.print();
  }

  // ---------- Herinnering ----------
  function checkReminder() {
    const r = L.reminder(state, today());
    if (r.seen) return;
    state.meta.reminderSeen[r.key] = true;
    save('state', state);
    if (!r.due) return;
    const sheet = $('#sheet');
    sheet.innerHTML = `<div class="sheet"><h2>Vakantie inplannen?</h2>
      <p>Je hebt in ${r.year} nog <b>${f(r.rest)} uur</b> vakantie die niet is ingepland (${asDays(r.rest)}).</p>
      <p class="muted small">Controle van ${L.shortDate(r.key)}: herinnering bij meer dan ${f(r.grens)} uur, na aftrek van opgenomen én geplande vakantie. Overwerk telt niet mee.</p>
      <div class="btnrow"><button class="btn grow" data-action="closesheet">Later</button><button class="btn primary grow" data-action="toplanning">Naar planning</button></div></div>`;
    sheet.showModal();
  }

  // ---------- Gebeurtenissen ----------
  const actions = {
    tab: (el) => { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
    week: (el) => { ui.monday = L.addDays(ui.monday, +el.dataset.d); render(); },
    gotoday: () => { ui.monday = L.mondayOf(today()); render(); },
    year: (el) => { ui.year += +el.dataset.d; ui.exportVan = ui.exportTot = null; render(); },
    setyear: (el) => { ui.year = +el.dataset.year; render(); },
    day: (el) => openDay(el.dataset.date),
    openweek: (el) => { ui.monday = el.dataset.monday; ui.tab = 'week'; render(); window.scrollTo(0, 0); },
    closesheet: () => $('#sheet').close(),
    toplanning: () => { $('#sheet').close(); ui.tab = 'planning'; ui.year = L.yearOf(today()); render(); },
    clearday: () => {
      const date = $('#dayForm').dataset.date;
      if (!confirm('Alle invoer van deze dag wissen?')) return;
      delete state.entries[date];
      $('#sheet').close();
      commit();
    },
    delcorr: (el) => {
      if (!confirm('Deze correctie verwijderen?')) return;
      state.corrections = state.corrections.filter((c) => c.id !== el.dataset.id);
      commit();
    },
    convert: (el) => { L.convertPlanned(state, el.dataset.date); commit(); toast('Omgezet naar opgenomen vakantie.'); },
    convertall: () => {
      const t = today();
      const list = L.vakantieYear(state, ui.year).geplandList.filter((g) => g.date < t);
      if (!confirm(`${list.length} dag(en) omzetten naar opgenomen vakantie?`)) return;
      list.forEach((g) => L.convertPlanned(state, g.date));
      commit();
    },
    unplan: (el) => {
      const e = state.entries[el.dataset.date];
      if (e) { delete e.gepland; if (!Object.keys(e).length) delete state.entries[el.dataset.date]; }
      commit();
    },
    closeyear: () => {
      const y = ui.year;
      if (!confirm(`Jaar ${y} afsluiten en de saldi overdragen naar ${y + 1}?`)) return;
      try { L.closeYear(state, y, today()); } catch (e) { alert(e.message); return; }
      commit();
      toast(`${y} afgesloten.`);
    },
    reopen: () => {
      const y = ui.year;
      if (!confirm(`Afsluiting van ${y} ongedaan maken? Het beginsaldo van ${y + 1} wordt teruggezet naar de waarde van vóór de afsluiting.`)) return;
      L.reopenYear(state, y);
      commit();
    },
    backup: () => doBackup(),
    import: () => startImport(),
    restoreprev: async () => {
      const prev = await load('previous');
      if (!prev || !confirm('De versie van vóór de laatste import herstellen? De huidige gegevens worden dan vervangen.')) return;
      const cur = state;
      state = L.normalize(prev);
      await save('previous', cur);
      commit(false);
      toast('Vorige versie hersteld.');
    },
    preset: (el) => {
      const t = today(), form = $('#exportForm');
      let van, tot;
      if (el.dataset.p === 'week') { van = L.mondayOf(t); tot = L.addDays(van, 6); }
      else if (el.dataset.p === 'maand') { van = t.slice(0, 8) + '01'; const n = L.parse(van); n.setUTCMonth(n.getUTCMonth() + 1); tot = L.addDays(L.ymd(n), -1); }
      else { van = `${ui.year}-01-01`; tot = `${ui.year}-12-31`; }
      form.elements.van.value = van; form.elements.tot.value = tot;
    },
    excel: () => exportExcel(),
    pdf: () => exportPdf(),
  };

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('#tabs button');
    if (tab) { actions.tab(tab); return; }
    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn) {
      const input = document.getElementById('f_' + stepBtn.dataset.for);
      input.value = f(Math.max(0, L.roundHalf(L.num(input.value) + +stepBtn.dataset.step))) .replace(/^0$/, '');
      return;
    }
    const fill = e.target.closest('[data-fill]');
    if (fill) { document.getElementById('f_' + fill.dataset.fill).value = f(+fill.dataset.v); return; }
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) { e.preventDefault(); actions[el.dataset.action](el, e); }
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.id === 'dayForm') saveDay(form);
    else if (form.id === 'corrForm') {
      const uren = L.round2(L.num(form.elements.uren.value.replace('−', '-')));
      if (!uren) { alert('Vul een aantal uren in (negatief voor aftrek).'); return; }
      state.corrections.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        soort: form.elements.soort.value, datum: form.elements.datum.value, uren,
        omschrijving: form.elements.omschrijving.value.trim(),
      });
      commit();
      toast('Correctie toegevoegd.');
    } else if (form.id === 'planForm') {
      const van = form.elements.van.value, tot = form.elements.tot.value;
      if (!van || !tot || van > tot) { alert('Kies een geldige periode.'); return; }
      const n = L.planRange(state, van, tot);
      commit();
      toast(n ? `${n} dag(en) ingepland.` : 'Geen werkdagen in deze periode.');
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'importFile' && el.files[0]) { handleImport(el.files[0]); return; }
    if (el.dataset.close) {
      const all = $$('[data-close]');
      $('#closeBtn').disabled = !all.every((c) => c.checked);
      return;
    }
    if (el.dataset.set) {
      const path = el.dataset.set;
      let v = el.value === '' ? null : L.num(el.value);
      if (path.startsWith('years.') && v == null) {
        const [, y, k] = path.split('.');
        if (state.years[y]) delete state.years[y][k];
      } else setPath(state, path, v == null ? 0 : v);
      commit();
      return;
    }
    if (el.dataset.hol) {
      const date = el.dataset.hol;
      const info = L.holidayInfo(state, date);
      const cfg = { betaald: info.betaald, uren: info.uren };
      if (el.dataset.k === 'betaald') { cfg.betaald = el.checked; cfg.uren = el.checked ? L.dagnorm(state, date) : 0; }
      else cfg.uren = Math.max(0, L.roundHalf(L.num(el.value)));
      state.holidays[date] = cfg;
      commit();
    }
  });

  // Vegen in het weekscherm
  let touch = null;
  document.addEventListener('touchstart', (e) => {
    if (ui.tab !== 'week' || $('#sheet').open) return;
    const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!touch) return;
    const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 40) { ui.monday = L.addDays(ui.monday, dx < 0 ? 7 : -7); render(); }
  }, { passive: true });

  // Klik buiten het bladmenu sluit het
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') e.target.close(); });

  // ---------- Start ----------
  async function init() {
    const saved = await load('state');
    state = L.normalize(saved || L.defaultState());
    if (!saved) await save('state', state);
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) { /* negeren */ }
    render();
    checkReminder();
    if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
      navigator.serviceWorker && navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { render(); checkReminder(); }
    });
  }
  init();
  window.__app = { get state() { return state; }, ui, render };
})();
