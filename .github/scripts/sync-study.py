#!/usr/bin/env python3
"""Сверка учёбы: берёт календарь InStudy (ссылка в .instudy-url, только на этом компьютере)
и обновляет STUDY_DATES / STUDY_KNOWN_UNTIL в schedule.js.
Учебный день = день, где есть событие, начинающееся с 18:00 (пары 18:50–22:00).
Каждое воскресенье утром запускается сам (.github/workflows/sync-study.yml).
Вручную, из папки site:  python3 .github/scripts/sync-study.py         — показать, что изменится
                         python3 .github/scripts/sync-study.py --write — записать в schedule.js
"""
import re, sys, urllib.request, datetime as dt, pathlib

import os
REPO = pathlib.Path(__file__).resolve().parents[2]      # корень сайта
JS = REPO / "schedule.js"
AHEAD_DAYS = 28          # насколько вперёд считаем расписание известным

# ссылка на календарь: в GitHub — секрет INSTUDY_URL, на компьютере — файл «Лия Сайт/.instudy-url»
url = os.environ.get("INSTUDY_URL") or (REPO.parent / ".instudy-url").read_text().strip()
ics = urllib.request.urlopen(url, timeout=30).read().decode("utf-8").replace("\r\n", "\n")
ics = re.sub(r"\n[ \t]", "", ics)

today = dt.date.today()
known_until = today + dt.timedelta(days=AHEAD_DAYS)
days = {}
for ev in ics.split("BEGIN:VEVENT")[1:]:
    m = re.search(r"^DTSTART[^:\n]*:(\d{8})T(\d{2})(\d{2})", ev, re.M)
    if not m: continue
    d = dt.datetime.strptime(m[1], "%Y%m%d").date()
    if int(m[2]) >= 18 and today - dt.timedelta(days=7) <= d <= known_until:
        title = (re.search(r"^SUMMARY[^:\n]*:(.*)$", ev, re.M) or [None, ""])[1]
        days.setdefault(d, title.replace("\\,", ",")[:60])

src = JS.read_text()
old = re.search(r"const STUDY_DATES = \[(.*?)\];", src, re.S)[1]
old_set = set(re.findall(r'"(\d{4}-\d{2}-\d{2})"', old))
new_set = {d.isoformat() for d in days}

items = sorted(new_set)
lines, row, month = [], [], None
for k in items:
    if row and k[:7] != month:
        lines.append("  " + ", ".join(f'"{x}"' for x in row) + ","); row = []
    month = k[:7]; row.append(k)
if row: lines.append("  " + ", ".join(f'"{x}"' for x in row) + ",")
block = "const STUDY_DATES = [\n" + "\n".join(lines) + "\n];"
src2 = re.sub(r"const STUDY_DATES = \[.*?\];", lambda _: block, src, flags=re.S)
src2 = re.sub(r'const STUDY_KNOWN_UNTIL = "[\d-]+";', f'const STUDY_KNOWN_UNTIL = "{known_until.isoformat()}";', src2)

wd = "пн вт ср чт пт сб вс".split()
print(f"Учёба по календарю до {known_until:%d.%m.%Y}:")
for d in sorted(days):
    if d >= today: print(f"  {d:%d.%m} {wd[d.weekday()]} — {days[d]}")
added = sorted(k for k in new_set - old_set if k >= today.isoformat())
removed = sorted(k for k in old_set - new_set if k >= today.isoformat())
print("Добавлено:", ", ".join(added) or "—")
print("Убрано:", ", ".join(removed) or "—")
if "--write" in sys.argv and src2 != src:
    JS.write_text(src2); print("schedule.js обновлён")
