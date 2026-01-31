/* Registro Ore - Stable (v7)
 * Upgrade:
 * - Ricorda ultima scheda (tabs) su iPhone
 * - Pulsante Oggi
 * - Duplica ieri (copia lavoro/permesso/stato/nota)
 * - Duplica ultimo giorno lavorato (workMin > 0)
 * - Selezione mesi passati + prev/next mese
 * Storage stabile + migrazione + backup/restore/wipe
 */

const LS_ENTRIES  = "ore_entries";     // STABILE
const LS_SETTINGS = "ore_settings";    // STABILE
const LS_UI       = "ore_ui";          // STABILE (solo preferenze UI)

const el = (id) => document.getElementById(id);

const ui = {
  // tabs
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: {
    ins: el("tab-ins"),
    set: el("tab-set"),
    rep: el("tab-rep"),
  },

  // inserimento
  date: el("date"),
  holidayHint: el("holidayHint"),
  status: el("status"),
  workHours: el("workHours"),
  permitHours: el("permitHours"),
  note: el("note"),
  saveBtn: el("saveBtn"),
  clearBtn: el("clearBtn"),

  todayBtn: el("todayBtn"),
  dupYesterdayBtn: el("dupYesterdayBtn"),
  dupLastWorkBtn: el("dupLastWorkBtn"),

  // settings
  stdDayHours: el("stdDayHours"),
  roundMin: el("roundMin"),
  extraHoliday: el("extraHoliday"),
  addExtraHolidayBtn: el("addExtraHolidayBtn"),
  resetSettingsBtn: el("resetSettingsBtn"),
  extraList: el("extraList"),

  // report
  month: el("month"),
  prevMonthBtn: el("prevMonthBtn"),
  nextMonthBtn: el("nextMonthBtn"),
  exportCsvBtn: el("exportCsvBtn"),
  exportPdfBtn: el("exportPdfBtn"),
  backupBtn: el("backupBtn"),
  restoreBtn: el("restoreBtn"),
  dangerWipeBtn: el("dangerWipeBtn"),
  restoreFile: el("restoreFile"),
  stats: el("stats"),
  tbody: el("tbody"),
};

const STATUS_LABEL = {
  normal: "Normale",
  public_holiday: "Festività",
  vacation: "Ferie",
  sick: "Malattia",
};

/* ---------- Helpers ---------- */
function pad(n){ return String(n).padStart(2,"0"); }
function ymd(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
}
function clamp(n, min, max){ return Math.min(max, Math.max(min, n)); }
function minutesToHHMM(min){
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(min);
  const h = Math.floor(a/60);
  const m = a%60;
  return `${sign}${h}:${pad(m)}`;
}
function parseToMinutes(input){
  const s = (input || "").trim();
  if(!s) return 0;

  if(s.includes(":")){
    const [h, m] = s.split(":");
    const hh = Number(h);
    const mm = Number(m);
    if(Number.isFinite(hh) && Number.isFinite(mm)){
      return Math.round(hh*60 + mm);
    }
    return NaN;
  }
  const x = Number(s.replace(",", "."));
  if(Number.isFinite(x)) return Math.round(x*60);
  return NaN;
}
function roundMinutes(min, step){
  const s = Number(step) || 0;
  if(s <= 0) return min;
  return Math.round(min / s) * s;
}
function defaultMonthValue(){
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}`;
}
function monthShift(yyyyMM, delta){
  const [y, m] = yyyyMM.split("-").map(Number);
  const d = new Date(y, m-1, 1);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function dateShift(yyyyMMdd, deltaDays){
  const d = new Date(yyyyMMdd);
  d.setDate(d.getDate() + deltaDays);
  return ymd(d);
}

/* ---------- Storage ---------- */
function loadJSON(key, fallback){
  const raw = localStorage.getItem(key);
  if(!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
function saveJSON(key, obj){
  localStorage.setItem(key, JSON.stringify(obj));
}

function loadSettings(){
  return loadJSON(LS_SETTINGS, { stdDayHours: 8, roundMin: 0, extraHolidays: [] });
}
function saveSettings(s){ saveJSON(LS_SETTINGS, s); }

function loadEntries(){
  return loadJSON(LS_ENTRIES, []);
}
function saveEntries(arr){ saveJSON(LS_ENTRIES, arr); }

function upsertEntry(entries, entry){
  const idx = entries.findIndex(e => e.date === entry.date);
  if(idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  entries.sort((a,b) => a.date.localeCompare(b.date));
  return entries;
}
function deleteEntry(entries, dateStr){
  return entries.filter(e => e.date !== dateStr);
}
function monthFilter(entries, monthValue){
  return entries.filter(e => e.date.startsWith(monthValue + "-"));
}

/* ---------- Migrazione da vecchie versioni ---------- */
function tryMigrateOldKeys(){
  if(localStorage.getItem(LS_ENTRIES)) return false;

  const oldCandidates = ["ore_entries_v4","ore_entries_v3","ore_entries_v2","ore_entries_v1"];
  for(const k of oldCandidates){
    const raw = localStorage.getItem(k);
    if(!raw) continue;
    try{
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed) && parsed.length){
        localStorage.setItem(LS_ENTRIES, raw);
        return true;
      }
    }catch{}
  }
  return false;
}

/* ---------- Festività IT ---------- */
function easterSunday(year){
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const month = Math.floor((h + l - 7*m + 114) / 31);
  const day = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(year, month-1, day);
}
function italianHolidaysSet(year, extraHolidays){
  const fixed = [
    `${year}-01-01`, `${year}-01-06`, `${year}-04-25`, `${year}-05-01`,
    `${year}-06-02`, `${year}-08-15`, `${year}-11-01`, `${year}-12-08`,
    `${year}-12-25`, `${year}-12-26`,
  ];
  const easter = easterSunday(year);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easterMonday.getDate() + 1);

  const set = new Set([...fixed, ymd(easterMonday)]);
  (extraHolidays || []).forEach(d => set.add(d));
  return set;
}

/* ---------- Calcoli ---------- */
function computeDailyOrdOT(workMin, settings){
  const stdDayMin = Math.round((Number(settings.stdDayHours) || 0) * 60);
  const ordinary = Math.min(workMin, stdDayMin);
  const overtime = Math.max(0, workMin - stdDayMin);
  return { ordinary, overtime };
}
function computeMonthlyTotals(entries, settings){
  let ordinaryMin = 0;
  let overtimeMin = 0;
  let permitMinTotal = 0;
  let vacationDays = 0;
  let sickDays = 0;

  for(const e of entries){
    if(e.status === "vacation") vacationDays++;
    if(e.status === "sick") sickDays++;

    const workMin = Number(e.workMin || 0);
    const { ordinary, overtime } = computeDailyOrdOT(workMin, settings);
    ordinaryMin += ordinary;
    overtimeMin += overtime;

    permitMinTotal += Number(e.permitMin || 0);
  }
  return { ordinaryMin, overtimeMin, permitMinTotal, vacationDays, sickDays };
}

/* ---------- Render ---------- */
function renderStats(t){
  ui.stats.innerHTML = `
    <div class="stat"><div class="k">Ordinarie (mese)</div><div class="v">${minutesToHHMM(t.ordinaryMin)}</div></div>
    <div class="stat"><div class="k">Straordinari (mese)</div><div class="v">${minutesToHHMM(t.overtimeMin)}</div></div>
    <div class="stat"><div class="k">Permessi (ore)</div><div class="v">${minutesToHHMM(t.permitMinTotal)}</div></div>
    <div class="stat"><div class="k">Ferie / Malattia (giorni)</div><div class="v">${t.vacationDays} / ${t.sickDays}</div></div>
  `;
}

function renderTable(entries, settings){
  ui.tbody.innerHTML = "";

  for(const e of entries){
    const tr = document.createElement("tr");

    const workMin = Number(e.workMin || 0);
    const permitMin = Number(e.permitMin || 0);

    const work = workMin ? minutesToHHMM(workMin) : "—";
    const perm = permitMin ? minutesToHHMM(permitMin) : "—";

    const { ordinary, overtime } = computeDailyOrdOT(workMin, settings);

    tr.innerHTML = `
      <td>${e.date}</td>
      <td><span class="badge">${STATUS_LABEL[e.status] || e.status}</span></td>
      <td>${work}</td>
      <td>${perm}</td>
      <td>${workMin ? minutesToHHMM(ordinary) : "—"}</td>
      <td>${workMin ? minutesToHHMM(overtime) : "—"}</td>
      <td>${(e.note || "").replaceAll("<","&lt;").replaceAll(">","&gt;")}</td>
      <td style="text-align:right">
        <button class="ghost" data-edit="${e.date}">Modifica</button>
        <button class="danger" data-del="${e.date}">Elimina</button>
      </td>
    `;
    ui.tbody.appendChild(tr);
  }

  ui.tbody.querySelectorAll("button[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = btn.getAttribute("data-edit");
      const e = currentMonthEntries.find(x => x.date === d);
      if(!e) return;

      fillFormFromEntry(e);
      switchTab("ins");
      window.scrollTo({top:0, behavior:"smooth"});
    });
  });

  ui.tbody.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = btn.getAttribute("data-del");
      if(!confirm(`Eliminare la giornata ${d}?`)) return;
      allEntries = deleteEntry(allEntries, d);
      saveEntries(allEntries);
      refresh();
    });
  });
}

/* ---------- Export ---------- */
function downloadText(filename, text, mime="application/json"){
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCSV(monthEntries, settings){
  const monthVal = ui.month.value || defaultMonthValue();
  const totals = computeMonthlyTotals(monthEntries, settings);

  const header = ["month","date","status","work_hhmm","permit_hhmm","ordinary_hhmm","overtime_hhmm","note"];
  const rows = monthEntries.map(e => {
    const workMin = Number(e.workMin || 0);
    const permitMin = Number(e.permitMin || 0);
    const { ordinary, overtime } = computeDailyOrdOT(workMin, settings);
    return [
      monthVal,
      e.date,
      e.status,
      workMin ? minutesToHHMM(workMin) : "",
      permitMin ? minutesToHHMM(permitMin) : "",
      workMin ? minutesToHHMM(ordinary) : "",
      workMin ? minutesToHHMM(overtime) : "",
      (e.note || "").replaceAll('"','""')
    ];
  });

  const summary = [
    ["", "TOTALI MESE", "", "", "", "", "", ""],
    ["", "Ordinarie", "", "", minutesToHHMM(totals.ordinaryMin), "", "", ""],
    ["", "Straordinari", "", "", minutesToHHMM(totals.overtimeMin), "", "", ""],
    ["", "Permessi (ore)", "", minutesToHHMM(totals.permitMinTotal), "", "", "", ""],
    ["", "Ferie (giorni)", totals.vacationDays, "", "", "", "", "", ""],
    ["", "Malattia (giorni)", totals.sickDays, "", "", "", "", "", ""],
  ];

  const csv = [header, ...rows, ...summary]
    .map(r => r.map(v => `"${String(v ?? "")}"`).join(","))
    .join("\n");

  downloadText(`registro-ore_${monthVal}.csv`, csv, "text/csv;charset=utf-8");
}

function exportPDF(monthEntries, settings){
  const monthVal = ui.month.value || defaultMonthValue();
  const totals = computeMonthlyTotals(monthEntries, settings);

  const rowsHtml = monthEntries.map(e => {
    const workMin = Number(e.workMin || 0);
    const permitMin = Number(e.permitMin || 0);
    const work = workMin ? minutesToHHMM(workMin) : "";
    const perm = permitMin ? minutesToHHMM(permitMin) : "";
    const status = STATUS_LABEL[e.status] || e.status;
    const note = (e.note || "").replaceAll("<","&lt;").replaceAll(">","&gt;");
    return `
      <tr>
        <td>${e.date.slice(8,10)}</td>
        <td>${status}</td>
        <td class="r">${work}</td>
        <td class="r">${perm}</td>
        <td class="note">${note}</td>
      </tr>
    `;
  }).join("");

  const html = `
<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Report Ore ${monthVal}</title>
<style>
  @page { size: A4; margin: 8mm; }
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:0}
  .wrap{padding:8mm}
  h1{margin:0 0 4px;font-size:16px}
  .meta{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline;margin-bottom:8px}
  .meta .muted{color:#555;font-size:11px}
  .totals{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:6px 0 10px}
  .box{border:1px solid #ddd;border-radius:8px;padding:6px}
  .k{color:#555;font-size:10px}
  .v{font-size:13px;font-weight:800;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}
  th,td{border-bottom:1px solid #e8e8e8;padding:4px 5px;vertical-align:top}
  th{background:#f6f6f6;text-align:left}
  .r{text-align:right}
  .note{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
</head>
<body>
  <div class="wrap">
    <div class="meta">
      <h1>Report ore – ${monthVal}</h1>
      <div class="muted">Standard: ${settings.stdDayHours}h/giorno • Arrotondamento: ${settings.roundMin} min</div>
    </div>

    <div class="totals">
      <div class="box"><div class="k">Ordinarie</div><div class="v">${minutesToHHMM(totals.ordinaryMin)}</div></div>
      <div class="box"><div class="k">Straordinari</div><div class="v">${minutesToHHMM(totals.overtimeMin)}</div></div>
      <div class="box"><div class="k">Permessi</div><div class="v">${minutesToHHMM(totals.permitMinTotal)}</div></div>
      <div class="box"><div class="k">Ferie (gg)</div><div class="v">${totals.vacationDays}</div></div>
      <div class="box"><div class="k">Malattia (gg)</div><div class="v">${totals.sickDays}</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:7%">G</th>
          <th style="width:18%">Stato</th>
          <th class="r" style="width:12%">Lavoro</th>
          <th class="r" style="width:12%">Permesso</th>
          <th>Nota</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="5">Nessun dato per questo mese.</td></tr>`}
      </tbody>
    </table>
  </div>

  <script>
    window.onload = () => setTimeout(() => window.print(), 250);
  </script>
</body>
</html>`;

  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/* ---------- Backup / Restore / Wipe ---------- */
function makeBackupObject(){
  return { app:"registro-ore", version:1, exportedAt:new Date().toISOString(), settings, entries: allEntries };
}
function backupNow(){
  const monthVal = ui.month.value || defaultMonthValue();
  downloadText(`backup_registro-ore_${monthVal}.json`, JSON.stringify(makeBackupObject(), null, 2));
}
function restoreFromObject(obj){
  if(!obj || typeof obj !== "object") throw new Error("File non valido.");
  if(!Array.isArray(obj.entries)) throw new Error("Backup non valido: manca 'entries'.");

  const incomingEntries = obj.entries.map(e => ({
    date: String(e.date || ""),
    status: e.status || "normal",
    workMin: Number(e.workMin || 0),
    permitMin: Number(e.permitMin || 0),
    note: String(e.note || "")
  })).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date));

  const incomingSettings = obj.settings && typeof obj.settings === "object"
    ? {
        stdDayHours: Number(obj.settings.stdDayHours ?? settings.stdDayHours),
        roundMin: Number(obj.settings.roundMin ?? settings.roundMin),
        extraHolidays: Array.isArray(obj.settings.extraHolidays) ? obj.settings.extraHolidays : (settings.extraHolidays||[])
      }
    : settings;

  if(allEntries.length > 0){
    const ok = confirm(`Ripristino backup: sovrascriverà i dati attuali (${allEntries.length} giorni). Continuo?`);
    if(!ok) return;
  }

  settings = incomingSettings;
  allEntries = incomingEntries;
  saveSettings(settings);
  saveEntries(allEntries);

  updateHolidaySuggestion();
  refresh();
  alert(`Ripristino completato: ${allEntries.length} giorni importati.`);
}

/* ---------- Festività UI ---------- */
function updateExtraList(){
  const arr = (settings.extraHolidays || []).slice().sort();
  ui.extraList.textContent = arr.length ? `Extra: ${arr.join(", ")}` : `Nessuna festività extra.`;
}
function updateHolidaySuggestion(){
  const d = ui.date.value;
  if(!d){ ui.holidayHint.textContent = ""; return; }
  const year = Number(d.slice(0,4));
  const holidaySet = italianHolidaysSet(year, settings.extraHolidays);
  const isHoliday = holidaySet.has(d);

  if(isHoliday){
    ui.holidayHint.textContent = "⚑ Questa data risulta festività (IT o extra).";
    if(ui.status.value === "normal") ui.status.value = "public_holiday";
  } else {
    ui.holidayHint.textContent = "";
  }
}

/* ---------- Tabs + UI state ---------- */
function loadUIState(){
  return loadJSON(LS_UI, { lastTab: "ins" });
}
function saveUIState(state){
  saveJSON(LS_UI, state);
}
function switchTab(tabKey){
  ui.tabs.forEach(b => {
    const active = b.dataset.tab === tabKey;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  Object.entries(ui.panels).forEach(([k, panel]) => {
    panel.classList.toggle("active", k === tabKey);
  });
  const st = loadUIState();
  st.lastTab = tabKey;
  saveUIState(st);
}

function fillFormFromEntry(e){
  ui.date.value = e.date;
  ui.status.value = e.status || "normal";
  ui.workHours.value = (e.workMin||0) ? minutesToHHMM(Number(e.workMin||0)) : "";
  ui.permitHours.value = (e.permitMin||0) ? minutesToHHMM(Number(e.permitMin||0)) : "";
  ui.note.value = e.note || "";
  updateHolidaySuggestion();
}

function findEntryByDate(dateStr){
  return allEntries.find(e => e.date === dateStr);
}
function findLastWorkEntry(beforeDateStr){
  const sorted = [...allEntries].sort((a,b) => a.date.localeCompare(b.date));
  for(let i = sorted.length - 1; i >= 0; i--){
    const e = sorted[i];
    if(e.date < beforeDateStr && Number(e.workMin || 0) > 0){
      return e;
    }
  }
  return null;
}

/* ---------- App state ---------- */
let settings = loadSettings();
let allEntries = loadEntries();
let currentMonthEntries = [];

function refresh(){
  ui.stdDayHours.value = settings.stdDayHours;
  ui.roundMin.value = settings.roundMin;
  updateExtraList();

  const monthVal = ui.month.value || defaultMonthValue();
  ui.month.value = monthVal;

  currentMonthEntries = monthFilter(allEntries, monthVal);

  const totals = computeMonthlyTotals(currentMonthEntries, settings);
  renderStats(totals);
  renderTable(currentMonthEntries, settings);
}

/* ---------- Events ---------- */
// Tabs
ui.tabs.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

// Oggi
ui.todayBtn.addEventListener("click", () => {
  ui.date.value = ymd(new Date());
  ui.status.value = "normal";
  updateHolidaySuggestion();
  switchTab("ins");
});

// Duplica ieri
ui.dupYesterdayBtn.addEventListener("click", () => {
  const targetDate = ui.date.value || ymd(new Date());
  const y = dateShift(targetDate, -1);
  const src = findEntryByDate(y);
  if(!src){
    alert(`Nessun dato trovato per ieri (${y}).`);
    return;
  }
  if(!confirm(`Copiare i dati da ${y} alla data selezionata (${targetDate})?`)) return;

  ui.status.value = src.status || "normal";
  ui.workHours.value = (src.workMin||0) ? minutesToHHMM(Number(src.workMin||0)) : "";
  ui.permitHours.value = (src.permitMin||0) ? minutesToHHMM(Number(src.permitMin||0)) : "";
  ui.note.value = src.note || "";
  updateHolidaySuggestion();
});

// Duplica ultimo giorno lavorato
ui.dupLastWorkBtn.addEventListener("click", () => {
  const targetDate = ui.date.value || ymd(new Date());
  const src = findLastWorkEntry(targetDate);
  if(!src){
    alert("Nessun giorno lavorato precedente trovato (con ore lavoro > 0).");
    return;
  }
  if(!confirm(`Copiare i dati dall’ultimo giorno lavorato (${src.date}) alla data selezionata (${targetDate})?`)) return;

  ui.status.value = src.status || "normal";
  ui.workHours.value = (src.workMin||0) ? minutesToHHMM(Number(src.workMin||0)) : "";
  ui.permitHours.value = (src.permitMin||0) ? minutesToHHMM(Number(src.permitMin||0)) : "";
  ui.note.value = src.note || "";
  updateHolidaySuggestion();
});

// Salva
ui.saveBtn.addEventListener("click", () => {
  const date = ui.date.value;
  if(!date){ alert("Seleziona una data."); return; }

  const workParsed = parseToMinutes(ui.workHours.value);
  const permitParsed = parseToMinutes(ui.permitHours.value);
  if(!Number.isFinite(workParsed) || !Number.isFinite(permitParsed)){
    alert("Formato ore non valido. Usa HH:MM (es 8:30) oppure decimali (es 8.5).");
    return;
  }

  let workMin = clamp(roundMinutes(workParsed, settings.roundMin), 0, 24*60);
  let permitMin = clamp(roundMinutes(permitParsed, settings.roundMin), 0, 24*60);
  const status = ui.status.value;

  if(status !== "normal" && (workMin > 0 || permitMin > 0)){
    const ok = confirm("Stato non ‘Normale’. Vuoi azzerare automaticamente lavoro e permesso?");
    if(ok){ workMin = 0; permitMin = 0; }
  }

  const entry = { date, status, workMin, permitMin, note: (ui.note.value || "").trim() };
  allEntries = upsertEntry(allEntries, entry);
  saveEntries(allEntries);

  ui.workHours.value = "";
  ui.permitHours.value = "";
  ui.note.value = "";

  refresh();
  updateHolidaySuggestion();
});

ui.clearBtn.addEventListener("click", () => {
  ui.workHours.value = "";
  ui.permitHours.value = "";
  ui.note.value = "";
});

ui.date.addEventListener("change", updateHolidaySuggestion);

// Settings
ui.stdDayHours.addEventListener("change", () => {
  settings.stdDayHours = Number(ui.stdDayHours.value || 0);
  saveSettings(settings);
  refresh();
});
ui.roundMin.addEventListener("change", () => {
  settings.roundMin = Number(ui.roundMin.value || 0);
  saveSettings(settings);
  refresh();
});
ui.addExtraHolidayBtn.addEventListener("click", () => {
  const d = ui.extraHoliday.value;
  if(!d){ alert("Seleziona una data extra."); return; }
  settings.extraHolidays = Array.from(new Set([...(settings.extraHolidays||[]), d]));
  saveSettings(settings);
  ui.extraHoliday.value = "";
  updateExtraList();
  updateHolidaySuggestion();
});
ui.resetSettingsBtn.addEventListener("click", () => {
  if(!confirm("Resettare impostazioni? (non cancella i dati)")) return;
  settings = { stdDayHours: 8, roundMin: 0, extraHolidays: [] };
  saveSettings(settings);
  refresh();
});

// Month report
ui.month.addEventListener("change", refresh);
ui.prevMonthBtn.addEventListener("click", () => {
  ui.month.value = monthShift(ui.month.value || defaultMonthValue(), -1);
  refresh();
});
ui.nextMonthBtn.addEventListener("click", () => {
  ui.month.value = monthShift(ui.month.value || defaultMonthValue(), +1);
  refresh();
});

ui.exportCsvBtn.addEventListener("click", () => exportCSV(currentMonthEntries, settings));
ui.exportPdfBtn.addEventListener("click", () => exportPDF(currentMonthEntries, settings));

// Backup/Restore/Wipe
ui.backupBtn.addEventListener("click", backupNow);
ui.restoreBtn.addEventListener("click", () => { ui.restoreFile.value=""; ui.restoreFile.click(); });
ui.restoreFile.addEventListener("change", async () => {
  const file = ui.restoreFile.files?.[0];
  if(!file) return;
  const text = await file.text();
  try{ restoreFromObject(JSON.parse(text)); }
  catch(err){ alert("Errore nel ripristino: " + (err?.message || String(err))); }
});
ui.dangerWipeBtn.addEventListener("click", () => {
  if(allEntries.length === 0){ alert("Non ci sono dati da cancellare."); return; }
  const ok = confirm(`ATTENZIONE: cancello TUTTI i dati (${allEntries.length} giorni). Hai fatto il backup?`);
  if(!ok) return;
  const ok2 = confirm("Conferma definitiva: vuoi davvero cancellare tutto?");
  if(!ok2) return;

  allEntries = [];
  saveEntries(allEntries);
  refresh();
  alert("Dati cancellati.");
});

/* ---------- Init ---------- */
(function init(){
  const migrated = tryMigrateOldKeys();

  settings = loadSettings();
  allEntries = loadEntries();

  ui.date.value = ymd(new Date());
  ui.month.value = defaultMonthValue();

  updateHolidaySuggestion();
  refresh();

  const st = loadUIState();
  switchTab(st.lastTab || "ins");

  if(migrated){
    alert("Ho trovato dati di una versione precedente e li ho importati automaticamente.");
  }
})();