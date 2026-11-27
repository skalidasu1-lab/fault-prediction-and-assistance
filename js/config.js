// All settings in one place.
const CONFIG = {
  MODE: 'mock',          // starting mode: 'mock' or 'serial' (also changeable in the page)
  BAUD: 9600,            // must match Serial.begin() on the Arduino
  TEMP_MAX: 100,         // alert above this many deg C (use ~35 for a body-heat demo)
  BATT_MIN: 11.8,        // alert below this many volts
  BATT_MAX: 15.0,        // alert above this many volts
  MAX_STORED: 2000,      // readings kept in the browser
  SCAN_TIMEOUT_MS: 3000  // how long a Scan button waits for a reply
};