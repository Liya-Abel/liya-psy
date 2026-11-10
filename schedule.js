/* ===================== РАСПИСАНИЕ =====================
   Общее для главной (index.html) и «Разбора года» (razbor.html).
   Время московское. Дни недели: 1 — пн … 6 — сб, 7 — вс.
   Расписание строится само по правилам ниже и «катится» вперёд.
   Обновлять нужно только УЧЁБУ и РАЗОВЫЕ БРОНИ. */
const WORK_DAYS   = [1, 2, 3, 4, 5, 6];   // воскресенье — выходной
/* Окна идут друг за другом: встреча 55 минут + перерыв 35 = шаг полтора часа.
   Постоянные клиенты и брони сдвигают сетку: после клиента в 12:00 следующее окно — 13:30. */
const BREAK_MIN   = 35;
const DAY = {
  normal:   { start: "12:00", last: "21:00" },   // будни без учёбы
  study:    { start: "11:30", last: "17:30" },   // учёба с 18:30 — всё на полчаса раньше
  saturday: { start: "12:00", last: "18:00" },   // последнее окно в субботу — около 18:00
};
const EVENING_FROM = "18:00";            // в будни вечер (с 18:00) — очно, и онлайн тоже
const OFFLINE_DAYS = [2, 4];             // очно днём: вторник и четверг (онлайн тоже остаётся)

/* Постоянные клиенты — каждую неделю. Занят час (dur) и ещё полчаса до и после (WEEKLY_BUFFER):
   клиент в 12:00 закрывает время с 11:30 до 13:30 */
const WEEKLY = [
  { day: 1, time: "12:00", dur: 60 },   // пн, 12–13
  { day: 3, time: "12:00", dur: 60 },   // ср, 12–13
  { day: 6, time: "14:00", dur: 60 },   // сб, 14–15
];
const WEEKLY_BUFFER = 30;

/* Дни учёбы (пары 18:30–22:00). Дописывай новые даты, когда появятся. */
const STUDY_DATES = [
  "2026-09-30", "2026-10-01", "2026-10-02",
  "2026-10-06", "2026-10-07", "2026-10-08",
  "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16",
  "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-23",
  "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30",
  "2026-11-02", "2026-11-09", "2026-11-19", "2026-11-20",
];
/* До какой даты расписание учёбы известно. Позже этой даты все будни считаются
   учебными (без вечеров, со сдвигом) — чтобы случайно не записать клиента на пару. */
const STUDY_KNOWN_UNTIL = "2026-11-22";

/* Разовые брони и дела: "ГГГГ-ММ-ДД ЧЧ:ММ" — блокирует всё, что пересекается с этой встречей.
   Если встреча длиннее 55 минут, допиши длительность: "2026-12-05 14:00 90" */
const BUSY = [
  "2026-10-10 17:30",
];

const DAYS_AHEAD = 14;          // на сколько дней вперёд показывать на главной
const MIN_HOURS_BEFORE = 24;    // записаться можно не раньше чем за сутки
const SESSION_MIN = 55;

/* «РАЗБОР ГОДА» — встреча 90 минут, своя запись на razbor.html */
const RAZBOR = {
  from:  "2026-11-17",          // с какого дня показывать окна
  until: "2027-01-20",          // последний день записи
  min:   90,                    // длительность
  breakMin: 30,                 // перерыв после
  lastEarlier: 35,              // последнее окно дня на столько минут раньше обычного
  off: ["2026-12-31", "2027-01-01", "2027-01-02"],   // дни без разборов
};


/* ========================================================= */
const pad = n => String(n).padStart(2, "0");
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const dayKey = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
function moscowNow(){ const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).map(x => [x.type, x.value])); return new Date(Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute)); }
let HELD = [];     // слоты, по которым уже написали (из Google-таблицы), 55 минут
let HELD90 = [];   // то же для «Разбора года», 90 минут
function isStudy(key, wd){ return STUDY_DATES.includes(key) || (key > STUDY_KNOWN_UNTIL && wd <= 5); }

/* Свободные окна дня. len — длительность встречи, brk — перерыв после неё,
   lastEarlier — насколько раньше обычного заканчивать, fmt — "online" | "offline" */
function daySlots(d, { len = SESSION_MIN, brk = BREAK_MIN, lastEarlier = 0, fmt = "online" } = {}){
  const now = moscowNow(), wd = d.getUTCDay() || 7, key = dayKey(d);
  if (!WORK_DAYS.includes(wd)) return [];
  const study = isStudy(key, wd);
  const day = study ? DAY.study : wd === 6 ? DAY.saturday : DAY.normal;
  const eve = toMin(EVENING_FROM), weekday = wd <= 5;
  const at = (s, dur) => ({ a: toMin(s.slice(11, 16)), d: dur || +s.slice(17) || SESSION_MIN });
  const taken = [
    ...WEEKLY.filter(w => w.day === wd).map(w => ({ a: toMin(w.time), d: w.dur || SESSION_MIN, b: WEEKLY_BUFFER })),
    ...[...BUSY, ...HELD].filter(b => b.startsWith(key)).map(b => at(b)),
    ...HELD90.filter(b => b.startsWith(key)).map(b => at(b, RAZBOR.min)),
  ];
  // строим день: окно за окном, обходя занятое
  const grid = [];
  let t = toMin(day.start);
  while (t <= toMin(day.last) - lastEarlier) {
    // у постоянных клиентов свой запас (b) — полчаса до и после; у остальных — перерыв brk
    const gap = x => x.b ?? brk;
    const hit = taken.filter(x => t < x.a + x.d + gap(x) && x.a < t + len + gap(x));
    if (hit.length) { t = Math.ceil(Math.max(...hit.map(x => x.a + x.d + gap(x))) / 15) * 15; continue; }
    grid.push(t); t += len + brk;
  }
  // онлайн — все окна дня (включая очные); очно — только вт/чт днём и вечера без учёбы
  const fits = m => fmt === "online"
    || (OFFLINE_DAYS.includes(wd) && m < eve) || (weekday && !study && m >= eve);
  return grid.filter(fits).map(m => {
    const when = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, m));
    return { t: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, free: (when - now) / 36e5 >= MIN_HOURS_BEFORE };
  }).filter(s => s.free);
}

/* занятые слоты из Google-таблицы */
async function loadHolds(url){
  if (!url) return false;
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 5000);
    const j = await (await fetch(url, { signal: ctl.signal })).json();
    if (Array.isArray(j.held)) HELD = j.held;
    if (Array.isArray(j.held90)) HELD90 = j.held90;
    return true;
  } catch(e) { return false; }
}
