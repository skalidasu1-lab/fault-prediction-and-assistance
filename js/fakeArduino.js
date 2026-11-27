// Pretends to be the Arduino: sends the same text lines and answers T / B.
class FakeArduino {
  constructor(onLine, faults) { this.onLine = onLine; this.faults = faults; this.t = 0; }
  temp() { return 80 + 4 * Math.sin(this.t / 10) + (this.faults.hot ? 30 : 0) + (Math.random() - 0.5) * 0.6; }
  batt() { return 12.6 + 0.2 * Math.sin(this.t / 7) - (this.faults.low ? 1.5 : 0) + (Math.random() - 0.5) * 0.04; }
  async start() {
    this.timer = setInterval(() => {
      this.t++;
      this.onLine(this.faults.unplugged ? 'ERR,TEMP' : `DATA,${this.temp().toFixed(1)},${this.batt().toFixed(2)}`);
    }, 1000);
  }
  async stop() { clearInterval(this.timer); }
  async send(c) {
    setTimeout(() => {
      if (c === 'T') this.onLine(this.faults.unplugged ? 'ERR,TEMP' : `TEMP,${this.temp().toFixed(1)}`);
      if (c === 'B') this.onLine(`BATT,${this.batt().toFixed(2)}`);
    }, 100);
  }
}