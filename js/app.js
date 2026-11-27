const $ = id => document.getElementById(id);
const state = { temp: null, batt: null, sensorError: false };
const faults = { hot: false, low: false, unplugged: false };
let source = null, pending = null, activeKeys = new Set(), logLines = [];

const fmt = (v, d) => v === null ? '--' : v.toFixed(d);
const cls = (alerts, target) => { const a = alerts.find(x => x.target === target); return a ? ' ' + a.level : ''; };

function log(text) {
  logLines.unshift(text);
  logLines.length = Math.min(logLines.length, 40);
  $('log').textContent = logLines.join('\n');
}
function setStatus(t) { $('status').textContent = t; }

function setConnected(on) {
  $('connectBtn').textContent = on ? 'Disconnect' : 'Connect';
  $('scanT').disabled = $('scanB').disabled = !on;
  $('mode').disabled = on;
  setStatus(on ? 'Connected' : 'Disconnected');
}

function save(m) {
  Store.add({ t: new Date().toISOString(), src: m.type, temp: m.temp ?? '', batt: m.batt ?? '' });
}

function handleLine(line) {
  log('â† ' + line);
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

function render() {
  $('temp').textContent = state.sensorError ? 'ERR' : fmt(state.temp, 1);
  $('batt').textContent = fmt(state.batt, 2);
  const alerts = evaluate(state);
  $('tempCard').className = 'card' + cls(alerts, 'temp');
  $('battCard').className = 'card' + cls(alerts, 'batt');
  const b = $('banner');
  if (alerts.length) {
    b.className = 'banner ' + (alerts.some(a => a.level === 'danger') ? 'danger' : 'warn');
    b.textContent = 'âš  ' + alerts.map(a => a.msg).join('  â€¢  ');
  } else { b.className = 'banner ok'; b.textContent = 'All systems normal'; }
  alerts.forEach(a => {
    if (!activeKeys.has(a.key)) {
      const li = document.createElement('li');
      li.textContent = new Date().toLocaleTimeString() + ' - ' + a.msg;
      $('alertLog').prepend(li);
    }
  });
  activeKeys = new Set(alerts.map(a => a.key));
  renderTable();
}

function renderTable() {
  $('rows').innerHTML = Store.rows.slice(-8).reverse().map(r =>
    `<tr><td>${new Date(r.t).toLocaleTimeString()}</td><td>${r.src}</td><td>${r.temp === '' ? '-' : r.temp}</td><td>${r.batt === '' ? '-' : r.batt}</td></tr>`).join('');
}

function scan(cmd, type) {
  if (!source) return;
  clearTimeout(pending && pending.timer);
  $('scanStatus').textContent = 'Scanning... waiting for ' + type + ' reply';
  pending = { type, timer: setTimeout(() => { pending = null; $('scanStatus').textContent = 'No reply from Arduino (timeout)'; }, CONFIG.SCAN_TIMEOUT_MS) };
  log('â†’ ' + cmd);
  Promise.resolve(source.send(cmd)).catch(e => setStatus('Send failed: ' + e.message));
}

async function connect() {
  const onError = e => { setStatus('Connection lost: ' + e.message); source = null; setConnected(false); setStatus('Connection lost'); };
  source = $('mode').value === 'mock' ? new FakeArduino(handleLine, faults) : new SerialArduino(handleLine, onError);
  setStatus('Connecting...');
  try { await source.start(); setConnected(true); }
  catch (e) { setStatus('Error: ' + e.message); source = null; }
}

async function disconnect() { await source.stop(); source = null; setConnected(false); }

$('connectBtn').onclick = () => source ? disconnect() : connect();
$('scanT').onclick = () => scan('T', 'TEMP');
$('scanB').onclick = () => scan('B', 'BATT');
$('exportBtn').onclick = () => Store.exportCSV();
$('clearBtn').onclick = () => { Store.clear(); renderTable(); };
$('mode').onchange = () => $('mockPanel').classList.toggle('hidden', $('mode').value !== 'mock');
document.querySelectorAll('[data-fault]').forEach(cb => cb.onchange = () => { faults[cb.dataset.fault] = cb.checked; });

$('mode').value = CONFIG.MODE;
$('mode').onchange();
renderTable();