# Manhole-Mitra Command Center

A polished, custom, real-time web dashboard for the **Manhole-Mitra ESP32 prototype**.

It uses **Blynk as the IoT transport/backend**, while giving the project its own branded interface, custom widgets, responsive layout, internal-water trend chart, event timeline, project summary, and protected maintenance-reset control.

## Architecture

```text
ESP32 firmware
    ↓ Blynk virtual pins / events
Blynk Cloud
    ↓ Webhooks (recommended) or HTTPS polling fallback
Manhole-Mitra Node.js backend
    ↓ Server-Sent Events (SSE)
Custom web dashboard
```

## Features

- Live cover status: Cover OK, Missing, Tilted, Reset Required
- Internal water-risk status: Normal, Caution, High Internal Water, Sensor Fault
- Internal water-depth gauge and time-series chart
- Probe-to-water gap display
- Device heartbeat / online status
- Event timeline with critical and warning styling
- Protected V10 maintenance reset control
- Project summary and architecture information
- Responsive layout for desktop and mobile
- No Blynk Auth Token in frontend JavaScript

## Local setup

```bash
cp .env.example .env
npm start
```

Open:

```text
http://localhost:3000
```

The site starts in labelled **DEMO PREVIEW** mode until valid Blynk data is received.

## Environment variables

Create `.env` from `.env.example`.

```text
WEBHOOK_SECRET=your-long-random-webhook-secret
CONTROL_KEY=your-separate-dashboard-control-key
BLYNK_SERVER=https://blr1.blynk.cloud
BLYNK_DEVICE_TOKEN=your-blynk-device-token
POLL_BLYNK=false
POLL_INTERVAL_MS=5000
DEMO_MODE=true
```

### Never commit these values

```text
WEBHOOK_SECRET
CONTROL_KEY
BLYNK_DEVICE_TOKEN
Wi-Fi credentials
```

They must stay in `.env` or Render Environment Variables only.

## Blynk webhook integration (recommended)

Create a Blynk webhook for Device Datastream Update for V0, V1, V2, V5 and V6.

### Webhook URL

```text
https://YOUR-RENDER-SITE.onrender.com/api/blynk/webhook
```

### Header

```text
X-Manhole-Secret: YOUR_WEBHOOK_SECRET
```

### JSON body

```json
{
  "pin": "{device_pin}",
  "value": "{device_pinValue}",
  "device_name": "{device_name}",
  "timestamp": "{timestamp_iso8601}"
}
```

For Blynk event/log-event webhooks, use:

```text
https://YOUR-RENDER-SITE.onrender.com/api/blynk/event
```

with the same secret header and a body such as:

```json
{
  "code": "{event_code}",
  "message": "{event_description}",
  "device_name": "{device_name}",
  "timestamp": "{timestamp_iso8601}"
}
```

## Polling fallback

If Blynk webhooks are unavailable in your plan, keep the token on the backend and set:

```text
POLL_BLYNK=true
POLL_INTERVAL_MS=5000
```

The backend will poll V0, V1, V2, V5 and V6 every five seconds using Blynk HTTPS API. It also checks Blynk's real hardware-connection endpoint, so the website shows `DEVICE OFFLINE` instead of falsely trusting a stale heartbeat value. This is less immediate than webhooks but suitable for a faculty demo.

## Protected maintenance reset

The website does not expose the Blynk token. It sends V10 reset through the backend only after the presenter enters `CONTROL_KEY`.

The ESP32 remains the final authority: the firmware rejects reset if the reed/tilt inputs still indicate an unsafe cover.

## Deploy to Render

A `render.yaml` blueprint is included. See `DEPLOYMENT.md` for exact GitHub and Render instructions.

## Safety scope

This is a controlled academic prototype. It is not certified for road, sewer, public infrastructure, explosion-prone, or life-safety deployment.
