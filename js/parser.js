// The only file that knows the Arduino protocol.
function num(s) { return (s === undefined || s.trim() === '') ? NaN : Number(s); }

function parseLine(line) {
  const p = line.trim().split(',');
  if (p[0] === 'DATA' && p.length === 3 && isFinite(num(p[1])) && isFinite(num(p[2])))
    return { type: 'DATA', temp: num(p[1]), batt: num(p[2]) };
  if (p[0] === 'TEMP' && p.length === 2 && isFinite(num(p[1])))
    return { type: 'TEMP', temp: num(p[1]) };
  if (p[0] === 'BATT' && p.length === 2 && isFinite(num(p[1])))
    return { type: 'BATT', batt: num(p[1]) };
  if (p[0] === 'ERR' && p[1] === 'TEMP') return { type: 'ERR' };
  return null; // unknown or partial line
}