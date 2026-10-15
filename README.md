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
