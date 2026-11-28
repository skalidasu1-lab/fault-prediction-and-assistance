// Turns the latest readings into a list of active alerts.
function evaluate(s) {
  const a = [];
  if (s.sensorError)
    a.push({ key: 'sensor', target: 'temp', level: 'warn', msg: 'Temperature sensor not detected (ERR,TEMP)' });
  else if (s.temp !== null && s.temp > CONFIG.TEMP_MAX)
    a.push({ key: 'hot', target: 'temp', level: 'danger', msg: `Overheating: ${s.temp.toFixed(1)} °C (limit ${CONFIG.TEMP_MAX} °C)` });
  if (s.batt !== null && s.batt < CONFIG.BATT_MIN)
    a.push({ key: 'low', target: 'batt', level: 'danger', msg: `Low battery: ${s.batt.toFixed(2)} V (min ${CONFIG.BATT_MIN} V)` });
  else if (s.batt !== null && s.batt > CONFIG.BATT_MAX)
    a.push({ key: 'over', target: 'batt', level: 'danger', msg: `Overvoltage: ${s.batt.toFixed(2)} V (max ${CONFIG.BATT_MAX} V)` });
  return a;
}