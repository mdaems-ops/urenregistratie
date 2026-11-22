/* Rekenlogica urenregistratie — los van de interface, zodat deze getest kan worden. */
(function (root) {
  'use strict';

  // Categorieën die meetellen als invoer (gepland is een reservering en telt niet mee).
  const CATS = ['werk', 'vakantie', 'compensatie', 'ziekte', 'betaald', 'onbetaald'];
  const LABELS = {
    werk: 'Werken',
    vakantie: 'Vakantie',
    gepland: 'Vakantie gepland',
    compensatie: 'Compensatie',
    ziekte: 'Ziekte',
    feestdag: 'Feestdag',
    betaald: 'Betaald verlof',
    onbetaald: 'Onbetaald verlof',
  };
  const SHORT = {
    werk: 'W', vakantie: 'V', gepland: 'Gepl.', compensatie: 'C', ziekte: 'Z',
    feestdag: 'F', betaald: 'BV', onbetaald: 'OV',
  };
  const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  const DAYS_LONG = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const MONTHS_LONG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus',
    'september', 'oktober', 'november', 'december'];
  const CHECK_MONTHS = [2, 4, 6, 8, 10, 12];

  // ---------- Datums (altijd als 'JJJJ-MM-DD', gerekend in UTC om zomertijd te omzeilen) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  function parse(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function addDays(s, n) {
    const d = parse(s);
    d.setUTCDate(d.getUTCDate() + n);
    return ymd(d);
  }
  function todayStr() {
    const n = new Date();
    return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  }
  const weekday = (s) => (parse(s).getUTCDay() + 6) % 7; // 0 = maandag
  const mondayOf = (s) => addDays(s, -weekday(s));
  const yearOf = (s) => +s.slice(0, 4);
  const monthOf = (s) => +s.slice(5, 7);
  const dayOf = (s) => +s.slice(8, 10);

  function isoWeek(s) {
    const d = parse(s);
    const thu = new Date(d);
    thu.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
    const year = thu.getUTCFullYear();
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const week = 1 + Math.round(((thu - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
    return { week, year };
  }

  // Maandlabel van een week: "nov 2026", "nov/dec 2026" of "dec 2026/jan 2027".
  function weekMonthLabel(monday) {
    const sunday = addDays(monday, 6);
    const m1 = monthOf(monday), m2 = monthOf(sunday), y1 = yearOf(monday), y2 = yearOf(sunday);
    if (y1 !== y2) return `${MONTHS[m1 - 1]} ${y1}/${MONTHS[m2 - 1]} ${y2}`;
    if (m1 !== m2) return `${MONTHS[m1 - 1]}/${MONTHS[m2 - 1]} ${y1}`;
    return `${MONTHS_LONG[m1 - 1]} ${y1}`;
  }
  const shortDate = (s) => `${dayOf(s)} ${MONTHS[monthOf(s) - 1]}`;
  const longDate = (s) => `${DAYS_LONG[weekday(s)]} ${dayOf(s)} ${MONTHS_LONG[monthOf(s) - 1]} ${yearOf(s)}`;

  // ---------- Feestdagen ----------
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return ymd(new Date(Date.UTC(y, month - 1, day)));
  }
  const holidayCache = {};
  function holidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    const e = easter(y);
    let koning = `${y}-04-27`;
    if (weekday(koning) === 6) koning = `${y}-04-26`;
    const list = [
      { date: `${y}-01-01`, name: 'Nieuwjaarsdag', defaultPaid: true },
      { date: addDays(e, -2), name: 'Goede Vrijdag', defaultPaid: false },
      { date: e, name: 'Eerste Paasdag', defaultPaid: true },
      { date: addDays(e, 1), name: 'Tweede Paasdag', defaultPaid: true },
      { date: koning, name: 'Koningsdag', defaultPaid: true },
      { date: `${y}-05-05`, name: 'Bevrijdingsdag', defaultPaid: y % 5 === 0 },
      { date: addDays(e, 39), name: 'Hemelvaartsdag', defaultPaid: true },
      { date: addDays(e, 49), name: 'Eerste Pinksterdag', defaultPaid: true },
      { date: addDays(e, 50), name: 'Tweede Pinksterdag', defaultPaid: true },
      { date: `${y}-12-25`, name: 'Eerste Kerstdag', defaultPaid: true },
      { date: `${y}-12-26`, name: 'Tweede Kerstdag', defaultPaid: true },
    ].sort((a, b) => (a.date < b.date ? -1 : 1));
    holidayCache[y] = list;
    return list;
  }

  // ---------- Toestand ----------
  function defaultState() {
    return {
      version: 1,
      settings: {
        voltijd: 40,
        factor: 0.8,
        patroon: [8, 8, 8, 8, 0, 0, 0],
        daglengte: 8,
        vakantieDagenVoltijd: 25,
        herinneringGrens: 40,
        backupWaarschuwingDagen: 30,
      },
      years: {},       // { 2026: { beginUren, beginVakantie, jaarrecht, closed, transferFrom } }
      entries: {},     // { 'JJJJ-MM-DD': { werk, vakantie, gepland, compensatie, ziekte, betaald, onbetaald, notitie } }
      holidays: {},    // { 'JJJJ-MM-DD': { betaald, uren } } — afwijkingen van de standaard
      corrections: [], // [{ id, soort: 'uren'|'vakantie', datum, uren, omschrijving }]
      meta: { lastBackup: null, lastChange: null, reminderSeen: {} },
    };
  }

  // Vult ontbrekende velden aan (bijv. na import van een ouder bestand).
  function normalize(s) {
    const d = defaultState();
    const out = Object.assign(d, s || {});
    out.settings = Object.assign(defaultState().settings, (s && s.settings) || {});
    out.meta = Object.assign(defaultState().meta, (s && s.meta) || {});
    out.meta.reminderSeen = out.meta.reminderSeen || {};
    out.years = out.years || {};
    out.entries = out.entries || {};
    out.holidays = out.holidays || {};
    out.corrections = out.corrections || [];
    if (!Array.isArray(out.settings.patroon) || out.settings.patroon.length !== 7) {
      out.settings.patroon = [8, 8, 8, 8, 0, 0, 0];
    }
    return out;
  }

  const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : 0;
  };
  const round2 = (n) => Math.round(n * 100) / 100;
  const roundHalf = (n) => Math.round(n * 2) / 2;

  const contractUren = (st) => round2(num(st.settings.voltijd) * num(st.settings.factor));
  const patroonTotaal = (st) => round2(st.settings.patroon.reduce((a, b) => a + num(b), 0));
  const dagnorm = (st, date) => num(st.settings.patroon[weekday(date)]);

  function holidayInfo(st, date) {
    const h = holidays(yearOf(date)).find((x) => x.date === date);
    if (!h) return null;
    const cfg = st.holidays[date] || {};
    const betaald = cfg.betaald != null ? !!cfg.betaald : h.defaultPaid;
    const uren = betaald ? (cfg.uren != null ? num(cfg.uren) : dagnorm(st, date)) : 0;
    return { name: h.name, date, betaald, uren, defaultPaid: h.defaultPaid };
  }

  // ---------- Dag- en weekberekening ----------
  function dayCalc(st, date) {
    const e = st.entries[date] || {};
    const norm = dagnorm(st, date);
    const holiday = holidayInfo(st, date);
    const feestdag = holiday ? holiday.uren : 0;
    const v = {};
    for (const c of CATS) v[c] = num(e[c]);
    const gepland = num(e.gepland);
    const afwezig = v.vakantie + v.ziekte + feestdag + v.betaald + v.compensatie;
    const hasInput = CATS.some((c) => v[c] > 0);
    return {
      date, norm, holiday, feestdag, gepland, notitie: e.notitie || '',
      ...v,
      afwezig,
      hasInput,
      verschil: round2(v.werk + afwezig - norm),
      mutatie: round2(v.werk + afwezig - norm - v.compensatie),
    };
  }

  function weekCalc(st, monday, today) {
    today = today || todayStr();
    const days = [];
    for (let i = 0; i < 7; i++) days.push(dayCalc(st, addDays(monday, i)));
    const sum = (k) => round2(days.reduce((a, d) => a + d[k], 0));
    const counted = days.some((d) => d.hasInput);
    const sunday = addDays(monday, 6);
    // Voorlopig: de week loopt nog, of er zijn werkdagen zonder invoer.
    const missing = days.filter((d) => d.norm > 0 && !d.hasInput && d.feestdag === 0);
    const voorlopig = counted && (sunday >= today || missing.length > 0);
    const iso = isoWeek(monday);
    return {
      monday, sunday, days, iso, counted, voorlopig, missing,
      werk: sum('werk'), afwezig: sum('afwezig'), norm: sum('norm'),
      compensatie: sum('compensatie'), vakantie: sum('vakantie'), gepland: sum('gepland'),
      ziekte: sum('ziekte'), feestdag: sum('feestdag'), betaald: sum('betaald'), onbetaald: sum('onbetaald'),
      verschil: counted ? sum('verschil') : 0,
      mutatie: counted ? sum('mutatie') : 0,
    };
  }

  // Alle weken (maandagen) die dagen in kalenderjaar y bevatten.
  function weeksOfYear(y) {
    const out = [];
    let m = mondayOf(`${y}-01-01`);
    const last = `${y}-12-31`;
    while (m <= last) { out.push(m); m = addDays(m, 7); }
    return out;
  }

  const yearCfg = (st, y) => st.years[y] || {};
  const jaarrechtStandaard = (st) =>
    round2(num(st.settings.factor) * num(st.settings.vakantieDagenVoltijd) * num(st.settings.daglengte));
  function jaarrecht(st, y) {
    const c = yearCfg(st, y);
    return c.jaarrecht != null && c.jaarrecht !== '' ? num(c.jaarrecht) : jaarrechtStandaard(st);
  }

  // Urensaldo van kalenderjaar y. Een week over de jaargrens wordt per dag aan het juiste jaar toegerekend.
  function urenYear(st, y, today) {
    today = today || todayStr();
    const weeks = [];
    let mutaties = 0;
    for (const m of weeksOfYear(y)) {
      const w = weekCalc(st, m, today);
      if (!w.counted) continue;
      const inYear = w.days.filter((d) => yearOf(d.date) === y);
      const mut = round2(inYear.reduce((a, d) => a + d.mutatie, 0));
      mutaties += mut;
      weeks.push({ monday: m, iso: w.iso, mutatie: mut, voorlopig: w.voorlopig, partial: inYear.length < 7 });
    }
    const correcties = st.corrections.filter((c) => c.soort === 'uren' && yearOf(c.datum) === y);
    const corrSum = round2(correcties.reduce((a, c) => a + num(c.uren), 0));
    const begin = num(yearCfg(st, y).beginUren);
    return {
      begin, weeks, correcties, corrSum,
      mutaties: round2(mutaties),
      totaal: round2(begin + mutaties + corrSum),
      voorlopig: weeks.some((w) => w.voorlopig),
    };
  }

  function vakantieYear(st, y) {
    let opgenomen = 0, gepland = 0;
    const geplandList = [];
    for (const [date, e] of Object.entries(st.entries)) {
      if (yearOf(date) !== y) continue;
      opgenomen += num(e.vakantie);
      if (num(e.gepland) > 0) { gepland += num(e.gepland); geplandList.push({ date, uren: num(e.gepland) }); }
    }
    geplandList.sort((a, b) => (a.date < b.date ? -1 : 1));
    const correcties = st.corrections.filter((c) => c.soort === 'vakantie' && yearOf(c.datum) === y);
    const corrSum = round2(correcties.reduce((a, c) => a + num(c.uren), 0));
    const begin = num(yearCfg(st, y).beginVakantie);
    const recht = jaarrecht(st, y);
    const saldo = round2(begin + recht - opgenomen + corrSum);
    return {
      begin, jaarrecht: recht, opgenomen: round2(opgenomen), correcties, corrSum,
      saldo, gepland: round2(gepland), geplandList,
      beschikbaar: round2(saldo - gepland),
    };
  }

  // Geplande vakantie omzetten naar opgenomen: verplaatst de uren, zodat niets dubbel wordt afgetrokken.
  function convertPlanned(st, date) {
    const e = st.entries[date];
    if (!e || !num(e.gepland)) return false;
    e.vakantie = round2(num(e.vakantie) + num(e.gepland));
    e.gepland = 0;
    return true;
  }

  // Vakantie plannen over een periode: elke dag met een norm krijgt de dagnorm als gepland (betaalde feestdagen overgeslagen).
  function planRange(st, from, to) {
    let d = from, n = 0;
    while (d <= to) {
      const norm = dagnorm(st, d);
      const h = holidayInfo(st, d);
      if (norm > 0 && !(h && h.betaald)) {
        const e = st.entries[d] || (st.entries[d] = {});
        e.gepland = norm;
        n++;
      }
      d = addDays(d, 1);
    }
    return n;
  }

  // ---------- Jaarafsluiting ----------
  function closeChecks(st, y, today) {
    today = today || todayStr();
    const u = urenYear(st, y, today);
    const emptyWeeks = weeksOfYear(y).filter((m) => {
      if (m > today) return false;
      const w = weekCalc(st, m, today);
      return !w.counted && w.norm > 0 && w.days.some((d) => yearOf(d.date) === y && d.norm > 0 && d.feestdag === 0);
    });
    const v = vakantieYear(st, y);
    const lastBackup = st.meta.lastBackup;
    const backupOk = !!lastBackup && (!st.meta.lastChange || lastBackup >= st.meta.lastChange);
    return {
      voorlopigeWeken: u.weeks.filter((w) => w.voorlopig),
      legeWeken: emptyWeeks,
      geplandOpen: v.geplandList,
      uren: u, vakantie: v, backupOk, lastBackup,
    };
  }

  function closeYear(st, y, today) {
    const c = st.years[y] || (st.years[y] = {});
    if (c.closed) throw new Error(`Jaar ${y} is al afgesloten.`);
    const next = st.years[y + 1] || (st.years[y + 1] = {});
    if (next.transferFrom === y) throw new Error(`De saldi van ${y} zijn al overgedragen naar ${y + 1}.`);
    const u = urenYear(st, y, today);
    const v = vakantieYear(st, y);
    c.closed = {
      at: today || todayStr(), eindUren: u.totaal, eindVakantie: v.saldo,
      vorigBeginUren: next.beginUren != null ? next.beginUren : null,
      vorigBeginVakantie: next.beginVakantie != null ? next.beginVakantie : null,
    };
    next.beginUren = u.totaal;
    next.beginVakantie = v.saldo; // het nieuwe jaarrecht komt er via jaarrecht(st, y+1) één keer bij
    next.transferFrom = y;
    return c.closed;
  }

  function reopenYear(st, y) {
    const c = st.years[y];
    if (!c || !c.closed) return false;
    const next = st.years[y + 1] || {};
    if (next.transferFrom === y) {
      if (c.closed.vorigBeginUren == null) delete next.beginUren; else next.beginUren = c.closed.vorigBeginUren;
      if (c.closed.vorigBeginVakantie == null) delete next.beginVakantie; else next.beginVakantie = c.closed.vorigBeginVakantie;
      delete next.transferFrom;
    }
    delete c.closed;
    return true;
  }

  // ---------- Herinnering vakantie plannen ----------
  function checkMoment(today) {
    const y = yearOf(today), m = monthOf(today);
    const past = CHECK_MONTHS.filter((x) => x <= m);
    return past.length ? `${y}-${pad(past[past.length - 1])}-01` : `${y - 1}-12-01`;
  }
  function reminder(st, today) {
    today = today || todayStr();
    const key = checkMoment(today);
    const y = yearOf(key);
    const v = vakantieYear(st, y);
    const grens = num(st.settings.herinneringGrens);
    return { key, year: y, rest: v.beschikbaar, grens, seen: !!st.meta.reminderSeen[key], due: v.beschikbaar > grens };
  }

  // ---------- Opmaak ----------
  function fmt(n, opts) {
    n = round2(num(n));
    const s = Math.abs(n).toLocaleString('nl-NL', { maximumFractionDigits: 2 });
    if (opts && opts.sign) return (n > 0 ? '+' : n < 0 ? '−' : '') + s;
    return (n < 0 ? '−' : '') + s;
  }

  const api = {
    CATS, LABELS, SHORT, DAYS, DAYS_LONG, MONTHS, MONTHS_LONG, CHECK_MONTHS,
    pad, ymd, parse, addDays, todayStr, weekday, mondayOf, yearOf, monthOf, dayOf, isoWeek,
    weekMonthLabel, shortDate, longDate, easter, holidays, holidayInfo,
    defaultState, normalize, num, round2, roundHalf, contractUren, patroonTotaal, dagnorm,
    dayCalc, weekCalc, weeksOfYear, jaarrecht, jaarrechtStandaard, urenYear, vakantieYear,
    convertPlanned, planRange, closeChecks, closeYear, reopenYear, checkMoment, reminder, fmt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
