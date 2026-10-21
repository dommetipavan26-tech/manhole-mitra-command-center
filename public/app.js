const $ = (id) => document.getElementById(id);
const coverLabels = ['COVER OK', 'COVER MISSING', 'COVER TILTED', 'RESET REQUIRED'];
const coverDescriptions = ['Reed and tilt inputs are safe.', 'Reed contact reports cover missing.', 'Tilt switch reports cover displacement.', 'Cover is restored; safe maintenance reset is required.'];
const riskLabels = ['NORMAL', 'CAUTION', 'HIGH INTERNAL WATER', 'SENSOR FAULT'];
const riskDescriptions = ['Internal chamber condition is stable.', 'Internal water level is rising.', 'High internal water / cover-risk condition.', 'Ultrasonic reading requires inspection; float remains backup.'];
let state = null;

function formatTime(timestamp) {
  if (!timestamp) return 'Waiting for telemetry';
  return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(timestamp));
}
function statusClass(value) { return value >= 2 ? 'is-danger' : value === 1 ? 'is-warning' : 'is-normal'; }
function setStatus(cardId, labelId, descId, label, description, value) {
  const card = $(cardId);
  card.classList.remove('is-normal','is-warning','is-danger');
  card.classList.add(statusClass(value));
  $(labelId).textContent = label;
  $(descId).textContent = description;
}
function renderGauge(depth) {
  const max = 150, pct = Math.max(0,Math.min(1,Number(depth || 0)/max));
  const startX=30, y=120, r=90, angle=Math.PI-(Math.PI*pct);
  const x=120+r*Math.cos(angle), yy=y-r*Math.sin(angle), large=pct>0.5?1:0;
  const d=pct<0.001?`M${startX} ${y} A${r} ${r} 0 0 1 ${startX} ${y}`:`M${startX} ${y} A${r} ${r} 0 ${large} 1 ${x.toFixed(1)} ${yy.toFixed(1)}`;
  $('gauge-fill').setAttribute('d',d);
  $('depth-value').textContent=Number(depth || 0).toFixed(1);
  $('depth-headline').textContent=depth>=30?'High internal water risk':depth>=15?'Internal water caution':'Internal level normal';
}
function drawChart(history) {
  const svg=$('trend-chart'), W=660,H=280,p={l:46,r:20,t:22,b:38};
  const values=(history||[]).map(x=>Number(x.value)).filter(Number.isFinite);
  const max=Math.max(150,...values,1), min=0; let out='';
  for(let i=0;i<=3;i++){
    const y=p.t+(H-p.t-p.b)*i/3, label=(max-(max-min)*i/3).toFixed(0);
    out+=`<line x1="${p.l}" y1="${y}" x2="${W-p.r}" y2="${y}" stroke="rgba(210,231,238,.18)" stroke-width="1"/>`;
    out+=`<text x="${p.l-10}" y="${y+4}" text-anchor="end" fill="#9cb2bf" font-size="11">${label}</text>`;
  }
  if(values.length){
    const points=values.map((v,i)=>{const x=p.l+(W-p.l-p.r)*(values.length===1?.5:i/(values.length-1));const y=p.t+(H-p.t-p.b)*(1-(v-min)/(max-min));return `${x.toFixed(1)},${y.toFixed(1)}`}).join(' ');
    const area=`${p.l},${H-p.b} ${points} ${W-p.r},${H-p.b}`;
    out+=`<polygon points="${area}" fill="rgba(58,205,184,.12)"/>`;
    out+=`<polyline points="${points}" fill="none" stroke="#58d9c4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else out+=`<text x="330" y="140" text-anchor="middle" fill="#90a8b6" font-size="14">Waiting for internal water-level readings</text>`;
  svg.innerHTML=out;
}
function renderEvents(events) {
  const list=$('event-list'); list.innerHTML='';
  if(!events || !events.length){list.innerHTML='<div class="empty-state">No events received yet.</div>';return;}
  for(const e of events.slice(0,7)){
    const node=$('event-template').content.cloneNode(true); const item=node.querySelector('.event-item');
    item.classList.add(e.type||'info'); node.querySelector('.event-code').textContent=e.code;
    node.querySelector('.event-message').textContent=e.message; node.querySelector('time').textContent=formatTime(e.timestamp); list.appendChild(node);
  }
}
function render(next) {
  state=next;
  $('device-name').textContent=next.deviceName || 'MM 001 College Main Gate';
  const online=Boolean(next.online || next.heartbeat===1);
  $('live-dot').className=`live-dot ${online?'live':'alert'}`;
  $('connection-label').textContent=online?'DEVICE ONLINE':'WAITING FOR DEVICE';
  $('last-updated').textContent=formatTime(next.lastUpdated);
  $('source-badge').textContent=next.source==='live' ? (online ? 'LIVE BLYNK DATA' : 'LAST BLYNK STATE') : next.source==='demo' ? 'DEMO PREVIEW' : 'WAITING FOR BLYNK';
  const cover=Number(next.coverStatus||0), risk=Number(next.internalRisk||0);
  setStatus('cover-card','cover-status','cover-desc',next.coverLabel||coverLabels[cover]||'UNKNOWN',coverDescriptions[cover]||'',cover);
  setStatus('risk-card','risk-status','risk-desc',next.riskLabel||riskLabels[risk]||'UNKNOWN',riskDescriptions[risk]||'',risk);
  $('probe-gap').textContent=Number(next.probeGap||0).toFixed(1);
  $('heartbeat-status').textContent=online?'Live heartbeat received':'No live heartbeat';
  $('heart-pulse').className=`heart-pulse ${online?'live':''}`;
  renderGauge(Number(next.internalDepth||0)); drawChart(next.history); renderEvents(next.events);
}
async function refresh(){const r=await fetch('/api/state');if(!r.ok)throw new Error('Could not load dashboard state');render(await r.json())}
const modal=$('reset-modal'), keyInput=$('control-key'), confirmInput=$('cover-confirm');
function openModal(){modal.classList.add('open');modal.setAttribute('aria-hidden','false');keyInput.focus();}
function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');$('reset-feedback').textContent='';}
$('open-reset-modal').addEventListener('click',openModal); $('close-reset-modal').addEventListener('click',closeModal);
modal.addEventListener('click',(e)=>{if(e.target===modal)closeModal()});
function updateResetButton(){ $('submit-reset').disabled=!(confirmInput.checked && keyInput.value.trim()); }
confirmInput.addEventListener('change',updateResetButton); keyInput.addEventListener('input',updateResetButton);
$('submit-reset').addEventListener('click',async()=>{
  const feedback=$('reset-feedback'), button=$('submit-reset'); button.disabled=true;feedback.textContent='Sending request…';
  try{const r=await fetch('/api/control/reset',{method:'POST',headers:{'Content-Type':'application/json','X-Control-Key':keyInput.value},body:JSON.stringify({})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed');feedback.textContent=data.message;setTimeout(closeModal,1700)}
  catch(e){feedback.textContent=e.message;button.disabled=false;updateResetButton();}
});
refresh().catch(console.error);
const stream=new EventSource('/api/stream');
stream.addEventListener('state',(event)=>{try{render(JSON.parse(event.data))}catch(e){console.error(e)}});
stream.onerror=()=>{$('connection-label').textContent='WEBSITE RECONNECTING'};

<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0d2336" />
  <title>Manhole-Mitra | Safety Command Center</title>
  <meta name="description" content="A custom real-time command center for the Manhole-Mitra ESP32 safety node." />
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
  <aside class="rail" aria-label="Application navigation">
    <div class="monogram">MM</div>
    <div class="rail-line"></div>
    <button class="rail-button is-active" aria-label="Overview"><span></span></button>
    <button class="rail-button" aria-label="System architecture"><span></span></button>
    <button class="rail-button" aria-label="Events"><span></span></button>
    <div class="rail-bottom">ESP32<br>IoT</div>
  </aside>

  <main class="app-shell">
    <header class="topbar">
      <div class="headline-block">
        <p class="eyebrow">INTERNAL WATER-LEVEL & COVER SAFETY</p>
        <h1>Manhole-Mitra <span>Command Center</span></h1>
        <p class="subhead">A custom monitoring interface for the ESP32 safety node.</p>
      </div>
      <div class="connection-glass">
        <div id="live-dot" class="live-dot"></div>
        <div><strong id="connection-label">CONNECTING</strong><small id="last-updated">Waiting for telemetry</small></div>
      </div>
    </header>

    <section class="identity-ribbon glass-panel">
      <div class="node-chip"><span class="node-icon">◇</span><div><small>MONITORED NODE</small><b id="device-name">MM 001 College Main Gate</b></div></div>
      <div class="signal-flow"><span>UNDER-COVER PROBE</span><i></i><span>LOCAL SAFETY LOGIC</span><i></i><span>LIVE BLYNK DATA</span></div>
      <div id="source-badge" class="source-badge">DEMO PREVIEW</div>
    </section>

    <section class="summary-grid">
      <article class="summary-copy glass-panel">
        <p class="eyebrow">PROJECT SUMMARY</p>
        <h2>One node. Two protective functions.</h2>
        <p>Manhole-Mitra detects a missing or tilted cover, then monitors the water level inside the manhole chamber. Local LED/buzzer output is immediate; Blynk provides the remote event and status layer.</p>
        <div class="summary-tags"><span>Reed + Tilt</span><span>AJ-SR04M + Float</span><span>ESP32 + Blynk</span></div>
      </article>
      <article class="summary-logic glass-panel">
        <p class="eyebrow">MEASUREMENT MODEL</p>
        <div class="formula">Internal water depth <b>=</b> probe-to-base height <b>−</b> probe-to-water gap</div>
        <p>Internal water level is an early hydraulic-risk indicator. Reed and tilt sensors remain the direct confirmation of cover displacement.</p>
      </article>
    </section>

    <section class="status-grid">
      <article id="cover-card" class="status-card is-normal">
        <div class="card-top"><span>V1 · COVER STATUS</span><i></i></div>
        <div id="cover-status" class="status-label">COVER OK</div>
        <p id="cover-desc">Reed and tilt inputs are safe.</p>
      </article>
      <article id="risk-card" class="status-card is-normal">
        <div class="card-top"><span>V5 · INTERNAL WATER RISK</span><i></i></div>
        <div id="risk-status" class="status-label">NORMAL</div>
        <p id="risk-desc">Internal chamber condition is stable.</p>
      </article>
      <article class="metric-card glass-panel">
        <p class="eyebrow">V6 · PROBE-TO-WATER GAP</p>
        <div class="metric-value"><span id="probe-gap">--</span><small>cm</small></div>
        <p>Distance measured under the cover.</p>
      </article>
      <article class="metric-card glass-panel">
        <p class="eyebrow">V0 · DEVICE HEARTBEAT</p>
        <div class="heartbeat-row"><span id="heart-pulse" class="heart-pulse"></span><b id="heartbeat-status">Waiting for ESP32</b></div>
        <p>Connection status through Blynk.</p>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="glass-panel water-card">
        <div class="panel-heading"><div><p class="eyebrow">V2 · INTERNAL MANHOLE WATER DEPTH</p><h2>Live water level</h2></div><span class="unit-chip">CENTIMETRES</span></div>
        <div class="water-content">
          <div class="gauge-shell"><svg viewBox="0 0 240 145" aria-label="Water depth gauge"><path class="gauge-track" d="M30 120 A90 90 0 0 1 210 120"/><path id="gauge-fill" class="gauge-fill" d="M30 120 A90 90 0 0 1 30 120"/><text id="depth-value" x="120" y="98" text-anchor="middle">--</text><text x="120" y="119" text-anchor="middle" class="gauge-unit">cm</text></svg></div>
          <div class="water-insight"><h3 id="depth-headline">Waiting for sensor data</h3><p id="depth-explain">The probe measures the internal air gap. The controller converts it into internal water depth using the configured chamber reference height.</p><div class="threshold-row"><span><b>CAUTION</b> configured level</span><span><b>HIGH RISK</b> configured level</span></div></div>
        </div>
      </article>
      <article class="glass-panel trend-card">
        <div class="panel-heading"><div><p class="eyebrow">TIME SERIES</p><h2>Internal water trend</h2></div><span class="stream-chip">LIVE STREAM</span></div>
        <svg id="trend-chart" class="trend-chart" viewBox="0 0 660 280" preserveAspectRatio="none" aria-label="Internal water level chart"></svg>
        <div class="chart-caption"><span>Oldest available reading</span><span>Most recent reading</span></div>
      </article>
    </section>

    <section class="lower-grid">
      <article class="glass-panel system-card">
        <div class="panel-heading"><div><p class="eyebrow">SYSTEM ARCHITECTURE</p><h2>Signal and safety flow</h2></div></div>
        <div class="system-flow">
          <div class="flow-node power"><b>5 V</b><small>Power bank</small></div><div class="flow-arrow">→</div><div class="flow-node core"><b>ESP32</b><small>local decision</small></div><div class="flow-arrow">→</div><div class="flow-node cloud"><b>Blynk</b><small>cloud status</small></div>
          <div class="system-subrow"><div class="flow-node sensor"><b>Sensors</b><small>reed · tilt · float · AJ-SR04M</small></div><div class="flow-node alert"><b>Local alert</b><small>LED · buzzer</small></div></div>
        </div>
      </article>
      <article class="glass-panel events-card">
        <div class="panel-heading"><div><p class="eyebrow">EVENT TIMELINE</p><h2>Latest safety events</h2></div></div>
        <div id="event-list" class="event-list"><div class="empty-state">No events received yet.</div></div>
      </article>
    </section>

    <section class="control-panel glass-panel">
      <div><p class="eyebrow">PROTECTED CONTROL</p><h2>Maintenance reset</h2><p>The website can request Blynk V10. The ESP32 is still the authority and rejects reset while the cover remains unsafe.</p></div>
      <button id="open-reset-modal" class="primary-button">Maintenance reset <span>→</span></button>
    </section>
  </main>

  <div id="reset-modal" class="modal-backdrop" aria-hidden="true">
    <section class="reset-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button id="close-reset-modal" class="modal-close" aria-label="Close">×</button>
      <p class="eyebrow">PROTECTED ACTION</p><h2 id="modal-title">Request maintenance reset</h2>
      <p>Confirm the cover has been physically restored and is not tilted. The ESP32 will perform a final safety check.</p>
      <label class="check-line"><input id="cover-confirm" type="checkbox"> <span>I confirm the cover is seated and safe.</span></label>
      <label class="key-label">Control key<input id="control-key" type="password" placeholder="Enter server control key" autocomplete="off"></label>
      <p id="reset-feedback" class="reset-feedback"></p>
      <button id="submit-reset" class="primary-button" disabled>Send V10 reset request <span>→</span></button>
    </section>
  </div>

  <template id="event-template"><div class="event-item"><span class="event-marker"></span><div class="event-content"><b class="event-code"></b><p class="event-message"></p></div><time></time></div></template>
  <script src="/app.js"></script>
</body>
</html>

:root{--navy:#0d2336;--navy-2:#143c5d;--blue:#1e86c8;--teal:#13a992;--green:#27b073;--orange:#e38a2b;--red:#e15a55;--paper:#edf4f7;--ink:#eaf3f6;--muted:#9aafbd;--line:rgba(210,231,238,.16);--glass:rgba(17,46,67,.70);--glass-light:rgba(24,63,86,.56);--shadow:0 18px 45px rgba(3,18,29,.22)}*{box-sizing:border-box}html{background:#0d2336}body{min-height:100vh;margin:0;overflow-x:hidden;color:var(--ink);background:radial-gradient(1000px 650px at 82% -12%,rgba(31,135,184,.23),transparent 65%),radial-gradient(720px 580px at 25% 102%,rgba(19,169,146,.19),transparent 70%),linear-gradient(135deg,#0d2336,#123a55 62%,#102f45);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.ambient{position:fixed;pointer-events:none;border-radius:50%;filter:blur(60px);opacity:.28}.ambient-one{width:330px;height:330px;background:#1e86c8;right:-110px;top:80px}.ambient-two{width:280px;height:280px;background:#16a890;left:40px;bottom:-150px}.rail{position:fixed;z-index:5;inset:0 auto 0 0;width:82px;background:rgba(5,19,31,.62);border-right:1px solid var(--line);backdrop-filter:blur(18px);display:flex;flex-direction:column;align-items:center;padding:27px 0}.monogram{display:grid;place-items:center;width:43px;height:43px;border:1px solid rgba(84,224,197,.5);border-radius:14px;color:#64e6c9;font-size:13px;font-weight:800;letter-spacing:.06em}.rail-line{width:1px;height:48px;margin:22px 0 16px;background:linear-gradient(transparent,rgba(255,255,255,.3),transparent)}.rail-button{width:38px;height:38px;border:0;background:transparent;border-radius:12px;cursor:pointer;margin:5px 0;position:relative}.rail-button span{width:7px;height:7px;display:block;margin:auto;border-radius:50%;background:#607c90}.rail-button.is-active{background:rgba(84,224,197,.10)}.rail-button.is-active span{background:#5de2c4;box-shadow:0 0 0 6px rgba(93,226,196,.12)}.rail-bottom{margin-top:auto;text-align:center;color:#608198;font-size:9px;line-height:1.5;letter-spacing:.12em;font-weight:800}.app-shell{position:relative;max-width:1600px;margin:auto;padding:42px 46px 58px 126px}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:30px;margin-bottom:25px}.eyebrow{margin:0 0 7px;color:#67d9c7;font-size:10px;letter-spacing:.14em;font-weight:800}.headline-block h1{margin:0;color:#fff;font-size:35px;line-height:1;letter-spacing:-.055em}.headline-block h1 span{font-weight:350;color:#d4e5ed}.subhead{margin:9px 0 0;color:var(--muted);font-size:14px}.connection-glass,.glass-panel{border:1px solid var(--line);background:var(--glass);box-shadow:var(--shadow);backdrop-filter:blur(18px)}.connection-glass{display:flex;gap:12px;align-items:center;border-radius:15px;min-width:210px;padding:13px 16px}.live-dot{width:10px;height:10px;border-radius:50%;background:#7b8f9d}.live-dot.live{background:#4ee0a4;box-shadow:0 0 0 6px rgba(78,224,164,.14)}.live-dot.alert{background:#f4b245;box-shadow:0 0 0 6px rgba(244,178,69,.14)}.connection-glass strong{display:block;font-size:11px;letter-spacing:.09em;color:#fff}.connection-glass small{display:block;margin-top:3px;font-size:11px;color:var(--muted)}.glass-panel{border-radius:18px}.identity-ribbon{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 20px;margin-bottom:18px}.node-chip{display:flex;align-items:center;gap:10px;min-width:225px}.node-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:rgba(103,217,199,.14);color:#6bdcc9;font-size:24px}.node-chip small{display:block;color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.12em}.node-chip b{display:block;color:#fff;font-size:14px;margin-top:3px}.signal-flow{display:flex;align-items:center;gap:11px;color:#bed2dc;font-size:10px;letter-spacing:.08em;font-weight:800;text-align:center}.signal-flow i{width:30px;height:1px;background:rgba(190,210,220,.45)}.source-badge{background:rgba(244,178,69,.16);color:#ffd48b;border:1px solid rgba(244,178,69,.34);border-radius:999px;padding:7px 10px;font-size:9px;font-weight:800;letter-spacing:.1em;white-space:nowrap}.summary-grid{display:grid;grid-template-columns:1.25fr .95fr;gap:18px;margin-bottom:18px}.summary-copy,.summary-logic{padding:22px}.summary-copy h2,.summary-logic h2{font-size:22px;letter-spacing:-.035em;margin:0 0 11px;color:#fff}.summary-copy p,.summary-logic p{font-size:13px;line-height:1.55;color:#c1d1da;margin:0}.summary-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.summary-tags span{font-size:10px;color:#89d9ce;background:rgba(19,169,146,.14);border:1px solid rgba(19,169,146,.3);padding:6px 8px;border-radius:999px}.formula{font-size:15px;color:#dbeaf1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:13px;line-height:1.5;margin:10px 0 12px}.formula b{color:#65dac8}.status-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:18px}.status-card,.metric-card{border-radius:17px;padding:18px;min-height:148px;transition:transform .28s ease,box-shadow .28s ease,border-color .28s ease}.status-card:hover,.metric-card:hover,.glass-panel:hover{transform:translateY(-3px);box-shadow:0 24px 48px rgba(2,14,23,.28)}.status-card{background:linear-gradient(145deg,rgba(31,104,84,.9),rgba(16,67,60,.92));border:1px solid rgba(83,231,177,.26)}.status-card.is-warning{background:linear-gradient(145deg,rgba(145,91,24,.92),rgba(105,63,15,.94));border-color:rgba(255,187,79,.4)}.status-card.is-danger{background:linear-gradient(145deg,rgba(144,46,50,.95),rgba(95,35,43,.95));border-color:rgba(255,126,126,.46)}.metric-card{background:var(--glass);border:1px solid var(--line);box-shadow:var(--shadow)}.card-top{display:flex;align-items:center;justify-content:space-between;color:#cde0e8;font-size:10px;letter-spacing:.1em;font-weight:800}.card-top i{width:7px;height:7px;background:#70e6c9;border-radius:50%;box-shadow:0 0 0 5px rgba(112,230,201,.12)}.status-label{margin-top:18px;font-size:22px;line-height:1;font-weight:800;color:#fff;letter-spacing:-.04em}.status-card p,.metric-card p{margin:11px 0 0;color:#c1d2db;font-size:12px;line-height:1.4}.metric-value{margin-top:17px;color:#fff;font-size:32px;font-weight:800;letter-spacing:-.055em}.metric-value small{font-size:14px;color:var(--muted);letter-spacing:0}.heartbeat-row{display:flex;align-items:center;gap:10px;margin-top:20px;color:#fff}.heart-pulse{display:block;width:12px;height:12px;border-radius:50%;background:#718899}.heart-pulse.live{background:#56e3a8;box-shadow:0 0 0 6px rgba(86,227,168,.13)}.dashboard-grid,.lower-grid{display:grid;grid-template-columns:1fr 1.26fr;gap:18px;margin-bottom:18px}.glass-panel{padding:21px}.panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}.panel-heading h2{margin:0;color:#fff;font-size:19px;letter-spacing:-.035em}.unit-chip,.stream-chip{font-size:9px;letter-spacing:.1em;font-weight:800;padding:7px 8px;border-radius:999px;background:rgba(103,217,199,.13);color:#77dfcf;border:1px solid rgba(103,217,199,.25);white-space:nowrap}.stream-chip{background:rgba(44,145,218,.15);border-color:rgba(44,145,218,.25);color:#91cfff}.water-content{display:flex;align-items:center;gap:8px}.gauge-shell{width:48%}.gauge-shell svg{width:100%;height:auto}.gauge-track{fill:none;stroke:rgba(255,255,255,.12);stroke-width:18;stroke-linecap:round}.gauge-fill{fill:none;stroke:#39c7b2;stroke-width:18;stroke-linecap:round;transition:all .55s cubic-bezier(.22,1,.36,1)}.gauge-shell text{font-size:30px;font-weight:800;fill:#fff}.gauge-shell .gauge-unit{font-size:12px;font-weight:600;fill:#b6c9d4}.water-insight{flex:1}.water-insight h3{margin:0 0 9px;font-size:17px;line-height:1.15;color:#fff}.water-insight p{font-size:12px;line-height:1.48;color:#b5c8d3;margin:0 0 14px}.threshold-row{display:flex;flex-direction:column;gap:7px}.threshold-row span{font-size:10px;color:#a6bac5}.threshold-row b{color:#68d7c7;margin-right:5px}.trend-chart{width:100%;height:260px;border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(7,24,37,.1))}.chart-caption{display:flex;justify-content:space-between;color:#8ea5b2;font-size:10px;margin-top:5px}.system-flow{height:185px;position:relative;display:flex;align-items:flex-start;gap:8px;padding-top:14px}.flow-node{color:#fff;border-radius:11px;padding:12px 9px;text-align:center;min-width:96px;background:#35617f}.flow-node b{display:block;font-size:12px}.flow-node small{font-size:9px;color:#d4e1e8}.flow-node.power{background:#ca761e}.flow-node.core{background:#17805b}.flow-node.cloud{background:#1c77b4}.flow-arrow{font-size:21px;color:#83b9d7;padding-top:20px}.system-subrow{position:absolute;left:0;bottom:10px;display:flex;gap:12px}.system-subrow .sensor{background:#7151a7;min-width:185px}.system-subrow .alert{background:#be4545;min-width:145px}.event-list{height:185px;overflow:auto;padding-right:3px}.event-item{display:grid;grid-template-columns:10px 1fr auto;gap:10px;border-bottom:1px solid rgba(255,255,255,.09);padding:10px 0}.event-marker{width:9px;height:9px;border-radius:50%;background:#6ea6c7;margin-top:5px}.event-item.critical .event-marker{background:#f17171}.event-item.warning .event-marker{background:#f5b254}.event-content b{font-size:11px;color:#fff}.event-content p{font-size:11px;line-height:1.35;color:#b6c9d4;margin:3px 0 0}.event-item time{font-size:10px;color:#8da2af;white-space:nowrap}.empty-state{color:#9eb2be;text-align:center;padding:44px 0;font-size:13px}.control-panel{display:flex;justify-content:space-between;align-items:center;padding:20px 23px;background:linear-gradient(90deg,rgba(14,55,82,.94),rgba(13,42,61,.94))}.control-panel h2{margin:0 0 4px;color:#fff;font-size:19px}.control-panel p{margin:0;color:#bdd0da;font-size:12px}.primary-button{border:1px solid rgba(255,255,255,.2);border-radius:10px;background:#fff;color:#123f5f;padding:12px 15px;font-size:12px;font-weight:800;cursor:pointer;transition:transform .2s ease,background .2s ease}.primary-button:hover{transform:translateY(-2px);background:#dff5f1}.primary-button:disabled{opacity:.55;cursor:wait}.primary-button span{font-size:17px;margin-left:8px}.modal-backdrop{position:fixed;z-index:20;inset:0;display:none;align-items:center;justify-content:center;background:rgba(3,15,24,.72);backdrop-filter:blur(8px);padding:20px}.modal-backdrop.open{display:flex}.reset-modal{position:relative;width:min(460px,100%);border:1px solid rgba(255,255,255,.18);border-radius:18px;background:#153d58;color:#fff;padding:28px;box-shadow:0 30px 70px rgba(0,0,0,.35)}.reset-modal h2{margin:0 0 10px;font-size:23px}.reset-modal p{line-height:1.5;color:#c5d6df;font-size:13px}.modal-close{position:absolute;right:17px;top:14px;background:transparent;border:0;color:#d6e6ee;font-size:25px;cursor:pointer}.check-line{display:flex;gap:9px;align-items:flex-start;color:#dce9ee;font-size:12px;margin:18px 0}.check-line input{accent-color:#4fd1bd;margin-top:2px}.key-label{display:block;color:#a7bbc6;font-size:11px;letter-spacing:.06em;font-weight:800}.key-label input{display:block;width:100%;margin-top:7px;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(0,0,0,.15);padding:11px;color:#fff;outline:none}.key-label input:focus{border-color:#62dcca;box-shadow:0 0 0 3px rgba(98,220,202,.13)}.reset-feedback{min-height:20px;color:#ffcb83}.reset-modal .primary-button{width:100%;margin-top:14px}.reset-modal .primary-button:disabled{background:#a4b2bb}.reset-modal .primary-button:not(:disabled){background:#58d9c4}@media(max-width:1100px){.status-grid{grid-template-columns:repeat(2,1fr)}.dashboard-grid,.lower-grid,.summary-grid{grid-template-columns:1fr}.signal-flow{display:none}}@media(max-width:720px){.rail{display:none}.app-shell{padding:28px 16px 44px}.topbar{flex-direction:column}.identity-ribbon{align-items:flex-start;flex-direction:column}.status-grid{grid-template-columns:1fr}.water-content{flex-direction:column}.gauge-shell{width:75%}.control-panel{align-items:flex-start;gap:16px;flex-direction:column}.system-flow{transform:scale(.82);transform-origin:left top;width:122%;height:154px}}
