const $ = id => document.getElementById(id);
const state = { temp: null, batt: null, sensorError: false };
const faults = { hot: false, low: false, unplugged: false };
let source = null, pending = null, activeKeys = new Set(), logLines = [], toastTimer = null;

const fmt = (v, d) => v === null ? '--' : v.toFixed(d);
const cls = (alerts, target) => { const a = alerts.find(x => x.target === target); return a ? ' ' + a.level : ''; };

function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function log(text) {
  logLines.unshift(text);
  logLines.length = Math.min(logLines.length, 40);
  $('log').textContent = logLines.join('\n');
}

function setStatus(t, tone) {
  $('status').textContent = t;
  const dot = $('healthDot');
  dot.className = 'health-dot' + (tone ? ' ' + tone : '');
}

function setConnected(on) {
  $('connectBtn').textContent = on ? 'Disconnect' : 'Connect';
  $('scanT').disabled = $('scanB').disabled = !on;
  $('mode').disabled = on;
  setStatus(on ? 'Connected' : 'Disconnected', on ? 'online' : '');
}

function save(m) {
  Store.add({ t: new Date().toISOString(), src: m.type, temp: m.temp ?? '', batt: m.batt ?? '' });
}

function handleLine(line) {
  log('<- ' + line);
  const m = parseLine(line);
  if (!m) return;
  if (m.type === 'DATA') { state.temp = m.temp; state.batt = m.batt; state.sensorError = false; save(m); }
  else if (m.type === 'TEMP') { state.temp = m.temp; state.sensorError = false; save(m); }
  else if (m.type === 'BATT') { state.batt = m.batt; save(m); }
  else if (m.type === 'ERR') { state.sensorError = true; }
  if (pending && (m.type === pending.type || (m.type === 'ERR' && pending.type === 'TEMP'))) {
    clearTimeout(pending.timer);
    pending = null;
    $('scanStatus').textContent = m.type === 'ERR'
      ? 'Scan failed: temperature sensor not detected'
      : 'Scan complete at ' + new Date().toLocaleTimeString();
  }
  render();
}

function updateGauges(alerts) {
  const tempAlert = alerts.find(a => a.target === 'temp');
  const battAlert = alerts.find(a => a.target === 'batt');

  const tempBar = $('tempBar');
  const tempBadge = $('tempBadge');
  if (state.sensorError || state.temp === null) {
    tempBar.style.width = '0%';
    tempBar.className = 'gauge-fill' + (state.sensorError ? ' warn' : '');
    tempBadge.textContent = state.sensorError ? 'SENSOR ERR' : 'NO DATA';
    tempBadge.className = 'badge ' + (state.sensorError ? 'warn' : 'ok');
  } else {
    const pct = Math.max(0, Math.min(100, (state.temp / CONFIG.TEMP_MAX) * 100));
    tempBar.style.width = pct + '%';
    const level = tempAlert ? tempAlert.level : (pct >= 85 ? 'warn' : 'ok');
    tempBar.className = 'gauge-fill ' + level;
    tempBadge.textContent = tempAlert ? tempAlert.key.toUpperCase() : (level === 'warn' ? 'WARM' : 'NOMINAL');
    tempBadge.className = 'badge ' + level;
  }

  const battBar = $('battBar');
  const battBadge = $('battBadge');
  if (state.batt === null) {
    battBar.style.width = '0%';
    battBar.className = 'gauge-fill';
    battBadge.textContent = 'NO DATA';
    battBadge.className = 'badge ok';
  } else {
    const span = Math.max(0.1, CONFIG.BATT_MAX - CONFIG.BATT_MIN);
    const pct = Math.max(0, Math.min(100, ((state.batt - CONFIG.BATT_MIN) / span) * 100));
    battBar.style.width = pct + '%';
    const level = battAlert ? battAlert.level : 'ok';
    battBar.className = 'gauge-fill ' + level;
    battBadge.textContent = battAlert ? battAlert.key.toUpperCase() : 'NOMINAL';
    battBadge.className = 'badge ' + level;
  }
}

function renderChart() {
  const pts = Store.rows.filter(r => r.temp !== '' || r.batt !== '').slice(-30);
  const empty = $('chartEmpty');
  if (!pts.length) {
    empty.classList.remove('hidden');
    $('tempPath').setAttribute('d', '');
    $('battPath').setAttribute('d', '');
    return;
  }
  empty.classList.add('hidden');
  const w = 640, h = 145, padX = 8, padY = 12;
  const stepX = pts.length > 1 ? (w - padX * 2) / (pts.length - 1) : 0;

  const tempCmds = [];
  const battCmds = [];
  pts.forEach((r, idx) => {
    const x = padX + idx * stepX;
    if (r.temp !== '' && isFinite(Number(r.temp))) {
      const tNorm = Math.max(0, Math.min(1, Number(r.temp) / (CONFIG.TEMP_MAX * 1.2)));
      const y = h - padY - tNorm * (h - padY * 2);
      tempCmds.push(`${tempCmds.length ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    if (r.batt !== '' && isFinite(Number(r.batt))) {
      const bSpan = Math.max(1, CONFIG.BATT_MAX - (CONFIG.BATT_MIN - 1));
      const bNorm = Math.max(0, Math.min(1, (Number(r.batt) - (CONFIG.BATT_MIN - 1)) / bSpan));
      const y = h - padY - bNorm * (h - padY * 2);
      battCmds.push(`${battCmds.length ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
  });

  $('tempPath').setAttribute('d', tempCmds.join(' '));
  $('battPath').setAttribute('d', battCmds.join(' '));
}

function buildDiagnostics(alerts) {
  const guides = {
    sensor: {
      title: 'Thermal Sensor Signal Missing (ERR,TEMP)',
      steps: [
        'Inspect the temperature probe connector and harness for loose pins or corrosion.',
        'Check pull-up/analog pin wiring against the Arduino sketch and press Scan temperature.'
      ]
    },
    hot: {
      title: 'Engine Overheating Detected',
      steps: [
        'Verify coolant level, radiator airflow, and electric cooling fan operation.',
        'Reduce engine load and confirm thermostat opening before sustained operation.'
      ]
    },
    low: {
      title: 'Low 12V Bus / Battery Voltage',
      steps: [
        'Check battery terminal tightness, ground strap integrity, and resting cell voltage.',
        'Test alternator charging output under load and trigger Scan battery.'
      ]
    },
    over: {
      title: 'Battery Overvoltage Condition',
      steps: [
        'Inspect the voltage regulator / alternator output while the engine is running.',
        'Check for poor battery connection or high-resistance load drops.'
      ]
    }
  };

  if (!alerts.length) {
    $('assistantBody').innerHTML = `
      <div class="diag-card">
        <div class="diag-title">All Telemetry Channels Within Thresholds</div>
        <ul class="diag-steps">
          <li>No active fault codes or out-of-range readings detected.</li>
          <li>Use manual Scan buttons or Simulator fault toggles to test alert and recovery paths.</li>
        </ul>
      </div>`;
    return;
  }

  $('assistantBody').innerHTML = alerts.map(a => {
    const g = guides[a.key] || { title: a.msg, steps: ['Inspect connected sensor and verify wiring.'] };
    return `
      <div class="diag-card">
        <div class="diag-title">${g.title} — <span class="mono">${a.msg}</span></div>
        <ul class="diag-steps">${g.steps.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>`;
  }).join('');
}

function render() {
  $('temp').textContent = state.sensorError ? 'ERR' : fmt(state.temp, 1);
  $('batt').textContent = fmt(state.batt, 2);
  const alerts = evaluate(state);
  $('tempCard').className = 'card metric-card' + cls(alerts, 'temp');
  $('battCard').className = 'card metric-card' + cls(alerts, 'batt');
  updateGauges(alerts);
  buildDiagnostics(alerts);

  const b = $('banner');
  if (alerts.length) {
    const isDanger = alerts.some(a => a.level === 'danger');
    b.className = 'banner ' + (isDanger ? 'danger' : 'warn');
    b.textContent = (isDanger ? 'CRITICAL: ' : 'WARNING: ') + alerts.map(a => a.msg).join('  •  ');
    if (source) setStatus(isDanger ? 'Fault Active' : 'Warning', isDanger ? 'danger' : 'warn');
  } else {
    b.className = 'banner ok';
    b.textContent = 'All systems normal';
    if (source) setStatus('Connected', 'online');
  }

  $('alertCount').textContent = `${alerts.length} active`;
  alerts.forEach(a => {
    if (!activeKeys.has(a.key)) {
      const li = document.createElement('li');
      li.textContent = new Date().toLocaleTimeString() + ' - ' + a.msg;
      $('alertLog').prepend(li);
    }
  });
  activeKeys = new Set(alerts.map(a => a.key));
  renderTable();
  renderChart();
}

function renderTable() {
  $('rows').innerHTML = Store.rows.slice(-8).reverse().map(r =>
    `<tr><td class="mono">${new Date(r.t).toLocaleTimeString()}</td><td class="mono">${r.src}</td><td class="mono">${r.temp === '' ? '-' : r.temp}</td><td class="mono">${r.batt === '' ? '-' : r.batt}</td></tr>`).join('');
}

function scan(cmd, type) {
  if (!source) return;
  clearTimeout(pending && pending.timer);
  $('scanStatus').textContent = 'Scanning... waiting for ' + type + ' reply';
  pending = { type, timer: setTimeout(() => { pending = null; $('scanStatus').textContent = 'No reply from Arduino (timeout)'; }, CONFIG.SCAN_TIMEOUT_MS) };
  log('-> ' + cmd);
  Promise.resolve(source.send(cmd)).catch(e => setStatus('Send failed: ' + e.message, 'danger'));
}

async function connect() {
  const onError = e => { setStatus('Connection lost: ' + e.message, 'danger'); source = null; setConnected(false); setStatus('Connection lost', 'danger'); };
  source = $('mode').value === 'mock' ? new FakeArduino(handleLine, faults) : new SerialArduino(handleLine, onError);
  setStatus('Connecting...', 'warn');
  try { await source.start(); setConnected(true); showToast('Connected to ' + ($('mode').value === 'mock' ? 'Simulator' : 'USB Serial')); }
  catch (e) { setStatus('Error: ' + e.message, 'danger'); source = null; showToast(e.message); }
}

async function disconnect() {
  await source.stop();
  source = null;
  setConnected(false);
  showToast('Disconnected');
}

function applyPreset(name) {
  const map = {
    normal: { hot: false, low: false, unplugged: false },
    overheat: { hot: true, low: false, unplugged: false },
    lowbatt: { hot: false, low: true, unplugged: false },
    unplugged: { hot: false, low: false, unplugged: true }
  };
  const next = map[name];
  if (!next) return;
  Object.assign(faults, next);
  document.querySelectorAll('[data-fault]').forEach(cb => {
    cb.checked = !!faults[cb.dataset.fault];
  });
  showToast('Applied preset: ' + name);
}

async function copyDiagnosticReport() {
  const alerts = evaluate(state);
  const report = [
    'Vehicle Fault Diagnostic Report',
    'Timestamp: ' + new Date().toISOString(),
    'Engine Temp: ' + (state.sensorError ? 'ERR' : fmt(state.temp, 1) + ' °C'),
    'Battery Voltage: ' + fmt(state.batt, 2) + ' V',
    'Active Alerts: ' + (alerts.length ? alerts.map(a => a.msg).join('; ') : 'None')
  ].join('\n');
  try {
    await navigator.clipboard.writeText(report);
    showToast('Diagnostic report copied');
  } catch {
    showToast('Clipboard unavailable in this browser context');
  }
}

$('connectBtn').onclick = () => source ? disconnect() : connect();
$('scanT').onclick = () => scan('T', 'TEMP');
$('scanB').onclick = () => scan('B', 'BATT');
$('exportBtn').onclick = () => { Store.exportCSV(); showToast('Exported readings.csv'); };
$('clearBtn').onclick = () => { Store.clear(); renderTable(); renderChart(); showToast('History cleared'); };
$('mode').onchange = () => {
  const isMock = $('mode').value === 'mock';
  $('mockPanel').classList.toggle('hidden', !isMock);
  $('sim-section').classList.toggle('hidden', !isMock);
};
document.querySelectorAll('[data-fault]').forEach(cb => cb.onchange = () => { faults[cb.dataset.fault] = cb.checked; });
document.querySelectorAll('[data-preset]').forEach(btn => btn.onclick = () => applyPreset(btn.dataset.preset));
$('copyReportBtn').onclick = copyDiagnosticReport;
$('sidebarToggle').onclick = () => $('sidebar').classList.toggle('collapsed');
$('mobileNavBtn').onclick = () => $('sidebar').classList.toggle('open');

$('cfgTempMax').textContent = CONFIG.TEMP_MAX + ' °C';
$('cfgBattWin').textContent = CONFIG.BATT_MIN + '–' + CONFIG.BATT_MAX + ' V';
$('cfgBaud').textContent = CONFIG.BAUD;
$('tempMaxLabel').textContent = 'Max ' + CONFIG.TEMP_MAX + ' °C';
$('battMinLabel').textContent = CONFIG.BATT_MIN + ' V';
$('battMaxLabel').textContent = CONFIG.BATT_MAX + ' V';

$('mode').value = CONFIG.MODE;
$('mode').onchange();
buildDiagnostics([]);
renderTable();
renderChart();