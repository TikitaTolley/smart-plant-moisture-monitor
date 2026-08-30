-- Migration number: 0001 	 2026-08-27T15:24:00.785Z
CREATE TABLE readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  raw INTEGER NOT NULL CHECK (raw BETWEEN 0 AND 4095),
  moisture_percent REAL NOT NULL
    CHECK (moisture_percent BETWEEN 0 AND 100),
  status TEXT NOT NULL
    CHECK (status IN ('moist', 'getting-dry', 'dry')),
  rssi INTEGER
    CHECK (rssi IS NULL OR rssi BETWEEN -127 AND 0),
  firmware_version TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (device_id, sequence)
);

CREATE INDEX readings_device_time
ON readings(device_id, received_at DESC);
