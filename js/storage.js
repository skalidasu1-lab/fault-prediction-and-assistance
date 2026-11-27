// Saves readings in the browser (localStorage) and exports CSV.
const Store = {
  KEY: 'vehicleReadings',
  rows: [],
  load() { try { this.rows = JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { this.rows = []; } },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.rows)); } catch (e) { console.warn('Storage full', e); } },
  add(row) {
    this.rows.push(row);
    while (this.rows.length > CONFIG.MAX_STORED) this.rows.shift();
    this.save();
  },
  clear() { this.rows = []; this.save(); },
  exportCSV() {
    const lines = ['time,type,tempC,batteryV', ...this.rows.map(r => [r.t, r.src, r.temp, r.batt].join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'readings.csv';
    a.click();
  }
};
Store.load();