-- Scooter Link Database Schema for SQLiteCloud
-- Track & control electric scooters remotely via 2G/GPRS (ESP32 + SIM800L + NEO-6M)

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Devices Table (ESP32 Trackers & Controllers)
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  device_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  model TEXT DEFAULT 'ESP32-SIM800L-NEO6M',
  sim_number TEXT,
  battery_level REAL DEFAULT 100,
  battery_voltage REAL DEFAULT 4.15,
  is_online INTEGER DEFAULT 1,
  is_on INTEGER DEFAULT 0,
  headlight INTEGER DEFAULT 0,
  turn_signal TEXT DEFAULT 'off',
  signal_rssi INTEGER DEFAULT 22,
  network_registered INTEGER DEFAULT 1,
  last_ping DATETIME DEFAULT CURRENT_TIMESTAMP,
  theft_mode INTEGER DEFAULT 0,
  firmware_version TEXT DEFAULT 'v2.1.0-remote',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Telemetry Table (GPS & Sensor Ingestion Log)
CREATE TABLE IF NOT EXISTS telemetry (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  speed_kmh REAL DEFAULT 0,
  altitude_meters REAL DEFAULT 0,
  course_degrees REAL DEFAULT 0,
  satellites INTEGER DEFAULT 0,
  hdop REAL DEFAULT 1.0,
  battery_voltage REAL DEFAULT 4.14,
  battery_percentage REAL DEFAULT 95,
  signal_rssi INTEGER DEFAULT 22,
  network_registered INTEGER DEFAULT 1,
  is_on INTEGER DEFAULT 0,
  theft_mode INTEGER DEFAULT 0,
  gps_date_utc TEXT,
  gps_time_utc TEXT,
  timestamp TEXT,
  gps_date_time TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(device_id, created_at DESC);

-- 4. Commands Table (Queue polled by ESP32 via GPRS every 5s)
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  delivered_at DATETIME,
  executed_at DATETIME,
  message TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_commands_device_status ON commands(device_id, status, created_at ASC);

-- 5. Command Acknowledgements Table
CREATE TABLE IF NOT EXISTS command_acks (
  id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL,
  executed_at DATETIME NOT NULL,
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (command_id) REFERENCES commands(id) ON DELETE CASCADE
);

-- 6. Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  resolved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- 7. Geofences Table (Cerca Virtual)
CREATE TABLE IF NOT EXISTS geofences (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius_meters REAL NOT NULL DEFAULT 100,
  active INTEGER DEFAULT 1,
  notify_on_exit INTEGER DEFAULT 1,
  notify_on_entry INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- 8. Authorized Contacts
CREATE TABLE IF NOT EXISTS authorized_contacts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  notify_sms INTEGER DEFAULT 1,
  notify_call INTEGER DEFAULT 0,
  notify_telegram INTEGER DEFAULT 1,
  telegram_chat_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- Seed initial default scooter-001
INSERT OR IGNORE INTO devices (id, device_id, name, token, model, sim_number, battery_level, battery_voltage, is_online, is_on, theft_mode)
VALUES ('dev-scooter-001', 'scooter-001', 'Scooter Link 001', 'TROCAR_POR_CHAVE_SECRETA', 'ESP32 + SIM800L + NEO-6M', '+55 (11) 98765-4321', 95, 4.14, 1, 0, 0);

-- Seed initial user
INSERT OR IGNORE INTO users (id, email, password_hash, name, role)
VALUES ('usr-admin-01', 'admin@scooterlink.com', 'admin123', 'Gustavo Dias', 'admin');
