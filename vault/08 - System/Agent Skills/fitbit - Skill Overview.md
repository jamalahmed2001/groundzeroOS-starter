---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: fitbit
version: 1.0.0
author: claw
source_skill_path: ~/clawd/skills/fitbit/SKILL.md
updated: 2026-04-27T10:52:05Z
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# fitbit

> Access and display Fitbit health and activity data from Pixel Watch 3

# Fitbit Health Data

Access and analyze health and activity data from Fitbit devices (Pixel Watch 3, Aria 2 scales).

---

## Quick Start

### Setup (One-Time)

1. **Create Fitbit Developer App**
   - Go to https://dev.fitbit.com/apps
   - Create new app (Personal, Non-Commercial)
   - Get `client_id` and `client_secret`

2. **Configure OAuth Flow**
   - Set callback URL for authorization
   - Store credentials securely in `.credentials/fitbit.md`

3. **Authorize and Get Tokens**
   - User authorizes via Fitbit OAuth
   - Store `access_token` and `refresh_token` securely
   - Implement token refresh logic

4. **Test Connection**
   - Fetch sample data
   - Verify data is accessible

### Daily Usage

```bash
# Get today's activity
fitbit activity

# Get sleep data
fitbit sleep

# Get heart rate data
fitbit heartrate

# Get heart rate variability
fitbit hrv

# Get today's summary
fitbit summary

# Get device sync status
fitbit devices

# Custom date range
fitbit activity --from 2026-03-01 --to 2026-03-07
```

---

## Supported Data Types

### Activity Data

**Steps and Distance**
- Daily step count
- Distance covered (km/miles)
- Floors climbed

**Calories and Zones**
- Calories burned
- Active zone minutes
- Cardio, Fat Burn, Peak, Out of Range zones

**Exercise Logs**
- Type of exercise
- Duration and intensity
- Start time and end time

---

### Health Metrics

**Heart Rate**
- Resting heart rate
- Heart rate throughout day (time series)
- Heart rate zones (out of range, fat burn, cardio, peak)

**Heart Rate Variability (HRV)**
- Average HRV during sleep
- Nightly HRV trends
- Stress/recovery indicators

**Blood Oxygen (SpO2)**
- Blood oxygen levels
- Daily averages and trends

**Breathing Rate**
- Average breaths per minute during sleep
- Nightly trends

**Temperature**
- Core temperature (body)
- Skin temperature

**Cardio Fitness Score (VO2 Max)**
- Maximum/optimum rate of oxygen use
- Fitness level assessment

---

### Sleep Data

**Sleep Stages**
- Deep sleep (duration, percentage)
- Light sleep (duration, percentage)
- REM sleep (duration, percentage)
- Awake time (duration, count)

**Sleep Metrics**
- Total sleep duration
- Sleep efficiency (percentage)
- Sleep onset time (when you fell asleep)
- Wake time
- Sleep score (overall quality)

---

### Body Metrics

**Weight**
- Weight measurements
- Body mass index (BMI)

**Body Fat**
- Body fat percentage
- Trends over time

---

## Commands

### Activity Commands

```bash
# Today's activity
fitbit activity

# Steps today
fitbit steps

# Calories today
fitbit calories

# Active zone minutes
fitbit zones

# Exercise log
fitbit exercises
```

### Health Commands

```bash
# Heart rate today
fitbit heartrate

# Resting heart rate
fitbit resting-hr

# Heart rate variability
fitbit hrv

# Blood oxygen
fitbit spo2

# Temperature
fitbit temperature

# Breathing rate
fitbit breathing
```

### Sleep Commands

```bash
# Sleep summary
fitbit sleep

# Sleep stages breakdown
fitbit sleep-stages

# Sleep efficiency
fitbit sleep-efficiency

# Sleep trends (last 7 days)
fitbit sleep-trends --days 7
```

### Body Commands

```bash
# Weight today
fitbit weight

# Weight log (all measurements)
fitbit weight-log

# Body fat
fitbit body-fat
```

### Device & Status

```bash
# Last sync time
fitbit devices

# Fitbit device info
fitbit device
```

---

## Configuration

### Credentials File (`.credentials/fitbit.md`)

```markdown
# Fitbit API Credentials

# Get from: https://dev.fitbit.com/apps

CLIENT_ID="your_client_id_here"
CLIENT_SECRET="your_client_secret_here"

# OAuth tokens (set after authorization)
ACCESS_TOKEN=""
REFRESH_TOKEN=""

# Token expiry (timestamp)
TOKEN_EXPIRES=""

# User ID (after authorization)
USER_ID=""

# Device ID (Pixel Watch 3)
DEVICE_ID="pixel-watch-3"
```

### Environment Variables

```bash
# Set Fitbit credentials
export FITBIT_CLIENT_ID="your_client_id"
export FITBIT_CLIENT_SECRET="your_client_secret"
export FITBIT_ACCESS_TOKEN="access_token"
export FITBIT_REFRESH_TOKEN="refresh_token"
export FITBIT_USER_ID="user_id"
```

---

## Features

### Data Fetching
- Fetch daily activity summaries
- Fetch time-series data for trends
- Fetch sleep analysis
- Fetch health metrics (heart rate, HRV, SpO2, temperature)
- Fetch body measurements

### Data Formatting
- Human-readable summaries
- Tabular format for easy reading
- JSON output for programmatic use
- Trends over time (7 days, 30 days)

### Token Management
- Automatic token refresh (before expiry)
- Secure credential storage
- Token expiration warnings
- Re-authentication prompts

### Caching
- Local caching to reduce API calls
- Cache validity periods (1 hour, 1 day)
- Force refresh with `--refresh` flag

---

## Examples

### Daily Activity Summary

```bash
$ fitbit activity

📊 Activity Summary for Wednesday, March 11, 2026

Steps: 8,432 (target: 10,000)
Distance: 5.2 km
Calories: 1,842 kcal
Active Zone Minutes: 45 min (target: 60 min)

Heart Rate Zones:
- Cardio: 25 min
- Fat Burn: 15 min
- Peak: 5 min

Floors: 12 floors

Status: ✅ Great day!
```

### Sleep Analysis

```bash
$ fitbit sleep

😴 Sleep Analysis for Tuesday, March 10, 2026

Total Sleep: 7h 23m
Sleep Efficiency: 86%
Sleep Stages:
  Deep: 1h 45m (24%)
  Light: 3h 12m (44%)
  REM: 2h 26m (32%)
  Awake: 45 min

Sleep Onset: 10:45 PM
Wake Time: 6:08 AM

Sleep Score: 82 (Good)
Quality: Solid - consistent bedtime, good efficiency
```

### Health Trends

```bash
$ fitbit hrv

💓 Heart Rate Variability - Last 7 Days

Date       | HRV (ms) | Status
2026-03-05 | 48       | Good
2026-03-06 | 52       | Good
2026-03-07 | 45       | Very Good
2026-03-08 | 38       | Excellent
2026-03-09 | 41       | Very Good
2026-03-10 | 44       | Very Good
2026-03-11 | 49       | Good

Average: 45.3 ms (Very Good)
Trend: ✅ Improving
```

---

## API Integration

### Fitbit Web API Endpoints

**Activity**
- `/activities/steps/daily.json`
- `/activities/distance/date/2026-03-11.json`
- `/activities/active-zone-minutes/date/2026-03-11.json`
- `/activities/calories.json`

**Heart Rate**
- `/activities/heart/date/2026-03-11.json`
- `/activities/heart-rate/timeseries/byDate/2026-03-11/1d.json`
- `/activities/heart-rate/latest.json`

**Heart Rate Variability**
- `/activities/heart-rate-variability/date/2026-03-11.json`

**Sleep**
- `/sleep/date/2026-03-11.json`
- `/sleep/stages/date/2026-03-11.json`
- `/sleep/score/date/2026-03-11.json`

**Body**
- `/body/log/weight/date/2026-03-11.json`
- `/body/fat/date/2026-03-11.json`

**Devices**
- `/devices.json`

---

## OAuth 2.0 Flow

### Step 1: Authorization URL

```
https://www.fitbit.com/oauth2/authorize?
  response_type=code
  client_id={CLIENT_ID}
  redirect_uri={REDIRECT_URI}
  scope=activity%20heartrate%20sleep%20profile%20nutrition%20weight%20social
  expires_in=604800
```

### Step 2: Handle Callback

User approves → Fitbit redirects with authorization `code`

### Step 3: Exchange Code for Tokens

```bash
curl -X POST https://api.fitbit.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id={CLIENT_ID}&grant_type=authorization_code&redirect_uri={REDIRECT_URI}&code={CODE}"
```

### Step 4: Store Tokens

Response contains:
- `access_token`
- `refresh_token`
- `expires_in` (seconds)
- `user_id`

---

## Troubleshooting

### "Access token expired"
- Run: `fitbit auth-refresh`
- Check credentials in `.credentials/fitbit.md`

### "No data for date range"
- Check if device synced recently: `fitbit devices`
- Verify date format (YYYY-MM-DD)
- Check timezone settings

### "Invalid OAuth request"
- Verify `CLIENT_ID` and `CLIENT_SECRET` are correct
- Check `redirect_uri` matches Fitbit app settings
- Ensure scope includes requested data types

### "CORS error on webhook"
- Check Fitbit app settings for allowed domains
- Verify callback URL format

---

## Privacy & Security

### Data Sovereignty
- All data stored locally (`.credentials/` directory)
- Tokens never shared or transmitted externally
- No third-party data aggregation without consent

### Token Security
- Credentials stored in gitignored `.credentials/` directory
- Never commit tokens to version control
- Rotate tokens periodically (recommended: every 30 days)

### API Limits
- Fitbit rate limit: ~150 requests per hour
- Implement exponential backoff on rate limit errors
- Cache responses to reduce unnecessary API calls

---

## Integration Ideas

### With Daily Plans
- Add "Fitbit activity" to daily plan blocks
- Track sleep quality vs energy levels
- Correlate steps taken with daily goals

### With WhatsApp Reminders
- Daily activity summary at 6:00 PM
- Sleep quality check in morning
- "Move your body" reminder if inactive for >4 hours

### With Health Tracking
- Weekly health report with trends
- Correlate sleep quality vs steps vs heart rate
- Identify patterns for better wellness

---

## License

MIT - Use freely, modify, distribute.

---

*Access your Fitbit Pixel Watch 3 health data and gain insights into your fitness, sleep, and wellness.*
