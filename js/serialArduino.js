// Talks to the real Arduino over USB with the Web Serial API.
class SerialArduino {
  constructor(onLine, onError) { this.onLine = onLine; this.onError = onError; }
  async start() {
    if (!('serial' in navigator)) throw new Error('Web Serial not supported: use Chrome or Edge');
    this.port = await navigator.serial.requestPort();   // must come from a button click
    await this.port.open({ baudRate: CONFIG.BAUD });
    this.writer = this.port.writable.getWriter();
    this.readLoop();
    await new Promise(r => setTimeout(r, 2500));         // Uno reboots when the port opens
  }
  async readLoop() {
    const decoder = new TextDecoderStream();
    this.closed = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this.reader = decoder.readable.getReader();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line) this.onLine(line);
        }
      }
    } catch (e) { this.onError(e); }
  }
  async send(c) { await this.writer.write(new TextEncoder().encode(c + '\n')); }
  async stop() {
    try {
      await this.reader.cancel();
      await this.closed;
      this.writer.releaseLock();
      await this.port.close();
    } catch (e) { console.warn(e); }
  }
}