# Fix Website Cover / Risk Status — Blynk V8 / V9 Bridge Setup

## Why this bridge is needed

The custom website correctly receives numeric Blynk values for V2 and V6. However, Blynk Enum streams V1 and V5 can display custom labels differently from the raw API response. This caused the website to show `COVER OK` / `NORMAL` while Blynk dashboard showed another Enum label.

The solution is to use two dedicated **Integer** streams for the website only:

```text
V8 = Website Cover State
V9 = Website Water Risk
```

The ESP32 firmware writes the same raw integer states to both Blynk Enum pins and website bridge pins:

```text
V1 and V8: cover state
V5 and V9: internal water-risk state
```

## 1. Create V8 in Blynk

Open:

```text
Blynk Console → Developer Zone → Templates → Manhole Mitra → Datastreams → New Datastream
```

Create:

```text
Type: Virtual Pin
Pin: V8
Name: Website Cover State
Data type: Integer
Minimum: 0
Maximum: 3
Default: 0
```

No Blynk widget is required for V8.

## 2. Create V9 in Blynk

Create:

```text
Type: Virtual Pin
Pin: V9
Name: Website Water Risk
Data type: Integer
Minimum: 0
Maximum: 3
Default: 0
```

No Blynk widget is required for V9.

## 3. Upload the updated ESP32 firmware

Use the newest `ManholeMitra_PowerBank.ino` file (ESP32 firmware — maintained outside this web-dashboard repo). It now writes:

```cpp
Blynk.virtualWrite(V8, coverState);
Blynk.virtualWrite(V9, riskState);
```

## 4. Update Render website code

Upload the newest website ZIP to GitHub and redeploy Render. The backend now polls:

```text
V0, V2, V6, V8, V9
```

instead of reading V1/V5 Enum values through the API.

## 5. Expected raw values

### V8 — Website Cover State

```text
0 = COVER OK
1 = COVER MISSING
2 = COVER TILTED
3 = RESET REQUIRED
```

### V9 — Website Water Risk

```text
0 = NORMAL
1 = CAUTION
2 = HIGH INTERNAL WATER
3 = SENSOR FAULT
```

After these two bridge streams are active, Blynk and the custom website will show matching Cover and Internal Water Risk statuses.
