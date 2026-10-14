# GitHub + Render Deployment Guide

## 1. Prepare a GitHub repository

Create a new GitHub repository, for example:

```text
manhole-mitra-command-center
```

From the project folder:

```bash
git init
git add .
git commit -m "Initial Manhole-Mitra command center"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/manhole-mitra-command-center.git
git push -u origin main
```

Check before pushing:

```bash
git status
```

Never add `.env`.

## 2. Deploy through Render Blueprint

1. Sign in to [Render](https://render.com/).
2. Click **New +** → **Blueprint**.
3. Connect your GitHub account and choose the repository.
4. Render reads `render.yaml` automatically.
5. Set these Environment Variables in Render:

```text
WEBHOOK_SECRET = long random string you choose
CONTROL_KEY = separate dashboard reset password
BLYNK_SERVER = https://blr1.blynk.cloud
BLYNK_DEVICE_TOKEN = your Blynk device token
POLL_BLYNK = false
POLL_INTERVAL_MS = 5000
DEMO_MODE = true
```

6. Click **Apply** / **Create Web Service**.
7. Copy the resulting Render URL, for example:

```text
https://manhole-mitra-command-center.onrender.com
```

## 3. Verify deployment

Open:

```text
https://YOUR-RENDER-SITE.onrender.com/health
```

Expected JSON:

```json
{"ok":true,"service":"manhole-mitra-command-center"}
```

Then open the main Render URL in a browser. You should see **DEMO PREVIEW** mode.

## 4. Connect Blynk webhooks

In Blynk Console, create webhooks for virtual pins V0, V1, V2, V5 and V6.

Use:

```text
POST https://YOUR-RENDER-SITE.onrender.com/api/blynk/webhook
```

Add header:

```text
X-Manhole-Secret: your WEBHOOK_SECRET
```

Use JSON payload:

```json
{
  "pin": "{device_pin}",
  "value": "{device_pinValue}",
  "device_name": "{device_name}",
  "timestamp": "{timestamp_iso8601}"
}
```

For Blynk events use:

```text
POST https://YOUR-RENDER-SITE.onrender.com/api/blynk/event
```

with the same header.

## 5. If Blynk webhooks are unavailable

Set these Render variables:

```text
POLL_BLYNK=true
BLYNK_DEVICE_TOKEN=your actual device token
```

Then redeploy. The dashboard will poll Blynk every 5 seconds.

## 6. Before presenting

- Change `DEMO_MODE` to `false` after real Blynk data works.
- Confirm the dashboard shows `LIVE BLYNK DATA`.
- Confirm the V10 reset needs the control key.
- Do not share screenshots containing device tokens, passwords, or webhook secrets.
