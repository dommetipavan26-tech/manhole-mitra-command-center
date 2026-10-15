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
