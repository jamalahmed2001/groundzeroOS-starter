---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: prayer-times
source_skill_path: ~/clawd/skills/prayer-times/SKILL.md
updated: 2026-04-27T10:52:05Z
up: Agent Skills Hub
---
# prayer-times

> Get accurate Islamic prayer times for Preston, UK using ISNA calculation method.

# Prayer Times

Accurate Islamic prayer times for Preston, UK using Islamic Society of North America (ISNA) calculation method.

## Usage

Get today's prayer times:
```
/prayer-times
```

Get prayer times for a specific date:
```
/prayer-times [date in YYYY-MM-DD format]
```

## Prayer Times Returned

- **Sehri (🌙)** — Pre-dawn meal, ~15 minutes before Fajr
- **Fajr (🌅)** — Dawn prayer
- **Sunrise (☀️)** — Sunrise time (not a prayer, for reference)
- **Dhuhr (🌞)** — Midday prayer
- **Asr (🌤)** — Afternoon prayer
- **Iftar (🌇)** — Break fast at Maghrib (Ramadan essential)
- **Maghrib (🌆)** — Sunset prayer
- **Isha (🌃)** — Night prayer

## Configuration

**Location:** Preston, UK
**Calculation Method:** Islamic Society of North America (ISNA)
**Method Code:** 2 (Aladhan API)
**Alternative Methods Available:** 1 (Hanafi), 3 (Muslim World League)
**Timezone:** Europe/London (GMT/BST)

## How It Works

1. Uses Aladhan API (free, no auth required)
2. Fetches prayer times for Preston, UK
3. Applies Sunni Hanafi calculation (method 1)
4. Calculates Sehri (15 min before Fajr) for pre-dawn meal
5. Uses Maghrib time for Iftar (sunset) to break fast
6. Returns formatted output with times in local time

## Example Output

```
🕌 Prayer Times - Preston, UK
Date: Saturday, February 22, 2026

🌙 Sehri (Pre-dawn meal): 05:05 AM
🌅 Fajr:      05:20 AM
☀️ Sunrise:    07:17 AM
🌞 Dhuhr:      12:24 PM
🌤 Asr:        02:56 PM
🌇 Iftar (Break fast):  05:32 PM
🌆 Maghrib:    05:32 PM
🌃 Isha:       07:30 PM

Calculation: Islamic Society of North America (ISNA)

📝 Sehri is ~15 minutes before Fajr. Iftar is at Maghrib time.
```

## Script Usage

```bash
# Today's prayer times
bash <home>/clawd/skills/prayer-times/get-prayer-times.sh

# Specific date
bash <home>/clawd/skills/prayer-times/get-prayer-times.sh "2026-02-22"
```

## API Details

**Endpoint:** `http://api.aladhan.com/v1/timingsByCity`
**Parameters:**
- `city=Preston`
- `country=UK`
- `method=2` (Islamic Society of North America - ISNA)
- `timezone=Europe/London`

**Response Format:** JSON with prayer times

## Notes

- Times are in local time (GMT/BST as applicable)
- Jumu'ah (Friday) prayer follows Dhuhr time at the mosque
- All times are approximate, verify with local mosque if needed
- ISNA method selected as closest match to your app's times
- **Sehri** is 15 minutes before Fajr (adjust based on your preference)
- **Iftar** is at Maghrib time (sunset) — essential for Ramadan fasting
- Method 1 (Hanafi) considers Asr time when shadow is twice the length of object + twilight
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]
