import { DatabaseSync } from 'node:sqlite';
import { Database as SQLiteCloudDriver } from '@sqlitecloud/drivers';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export interface IDatabase {
  isCloud: boolean;
  dbType: string;
  filePath: string;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  run(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid?: number | bigint | string }>;
  getStats(): Promise<DatabaseStats>;
}

export interface DatabaseStats {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  journalMode: string;
  tableCounts: {
    users: number;
    devices: number;
    telemetry: number;
    commands: number;
    commandAcks: number;
    alerts: number;
    geofences: number;
    authorizedContacts: number;
    deviceIdentityHistory: number;
  };
  lastTelemetryTimestamp?: string;
  totalRecords: number;
}

export const DEFAULT_DEVICE_SECRET_KEY = process.env.DEVICE_API_KEY || 'scooter_secret_key_001';

export function hashDeviceKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

export function verifyDeviceKey(providedKey: string, storedHash: string): boolean {
  if (!providedKey || !storedHash) return false;
  const providedHash = hashDeviceKey(providedKey);
  try {
    const bufA = Buffer.from(providedHash, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

const DB_FILENAME = 'scooter_link.db';
const DB_PATH = path.join(process.cwd(), DB_FILENAME);

class LocalSQLiteDatabase implements IDatabase {
  public isCloud = false;
  public dbType = 'SQLite 3 (Arquivo Local .db Centralizado)';
  public filePath: string = DB_PATH;
  private db: DatabaseSync;

  constructor() {
    // Ensure parent directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log(`💾 [SQLite] Inicializando arquivo central de banco de dados em: ${this.filePath}`);
    this.db = new DatabaseSync(this.filePath);

    // Optimize SQLite settings for high-concurrency GPS ingestion & reliability
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    this.initTables();
    this.seedInitialData();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        device_id TEXT UNIQUE NOT NULL,
        device_key_hash TEXT NOT NULL,
        raw_device_key TEXT,
        display_name TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        model TEXT DEFAULT 'ESP32-SIM800L-NEO6M',
        sim_number TEXT,
        is_online INTEGER DEFAULT 1,
        is_on INTEGER DEFAULT 0,
        headlight INTEGER DEFAULT 0,
        turn_signal TEXT DEFAULT 'off',
        signal_rssi INTEGER DEFAULT 22,
        network_registered INTEGER DEFAULT 1,
        theft_mode INTEGER DEFAULT 0,
        firmware_version TEXT DEFAULT 'v2.1.0-remote'
      );

      CREATE TABLE IF NOT EXISTS device_identity_history (
        id TEXT PRIMARY KEY,
        old_device_id TEXT NOT NULL,
        new_device_id TEXT NOT NULL,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        changed_by TEXT
      );

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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered_at DATETIME,
        executed_at DATETIME,
        message TEXT
      );

      CREATE TABLE IF NOT EXISTS command_acks (
        id TEXT PRIMARY KEY,
        command_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        status TEXT NOT NULL,
        executed_at DATETIME NOT NULL,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        resolved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS authorized_contacts (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        notify_sms INTEGER DEFAULT 1,
        notify_call INTEGER DEFAULT 0,
        notify_telegram INTEGER DEFAULT 1,
        telegram_chat_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- High performance indexes
      CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
      CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(device_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_commands_device_status ON commands(device_id, status);
      CREATE INDEX IF NOT EXISTS idx_alerts_device_time ON alerts(device_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_geofences_device ON geofences(device_id, active);
      CREATE INDEX IF NOT EXISTS idx_identity_hist_changed ON device_identity_history(changed_at DESC);
    `);

    // Migration helper: ensure new columns exist if table existed prior
    try {
      const tableInfo = this.db.prepare(`PRAGMA table_info(devices)`).all() as any[];
      const colNames = new Set(tableInfo.map((c) => c.name));
      if (!colNames.has('raw_device_key')) {
        this.db.exec(`ALTER TABLE devices ADD COLUMN raw_device_key TEXT DEFAULT '${DEFAULT_DEVICE_SECRET_KEY}';`);
      }
      if (!colNames.has('device_key_hash')) {
        this.db.exec(`ALTER TABLE devices ADD COLUMN device_key_hash TEXT NOT NULL DEFAULT '${hashDeviceKey(DEFAULT_DEVICE_SECRET_KEY)}';`);
      }
      if (!colNames.has('display_name')) {
        this.db.exec(`ALTER TABLE devices ADD COLUMN display_name TEXT;`);
      }
      if (!colNames.has('status')) {
        this.db.exec(`ALTER TABLE devices ADD COLUMN status TEXT NOT NULL DEFAULT 'active';`);
      }
      if (!colNames.has('last_seen_at')) {
        // SQLite nao permite adicionar uma coluna com CURRENT_TIMESTAMP como
        // valor padrao a uma tabela que ja existe. Primeiro cria sem padrao e
        // em seguida preenche os registros antigos.
        this.db.exec(`ALTER TABLE devices ADD COLUMN last_seen_at DATETIME;`);
        this.db.exec(`UPDATE devices SET last_seen_at = COALESCE(last_seen_at, created_at, datetime('now'));`);
      }
      if (!colNames.has('updated_at')) {
        this.db.exec(`ALTER TABLE devices ADD COLUMN updated_at DATETIME;`);
        this.db.exec(`UPDATE devices SET updated_at = COALESCE(updated_at, created_at, datetime('now'));`);
      }

      // Guarantee that all existing rows have valid raw_device_key and hash
      this.db.exec(`
        UPDATE devices
        SET raw_device_key = '${DEFAULT_DEVICE_SECRET_KEY}'
        WHERE raw_device_key IS NULL OR trim(raw_device_key) = '' OR raw_device_key LIKE '••••%';

        UPDATE devices
        SET device_key_hash = '${hashDeviceKey(DEFAULT_DEVICE_SECRET_KEY)}'
        WHERE device_key_hash IS NULL OR trim(device_key_hash) = '';
      `);
    } catch (e: any) {
      console.warn('⚠️ [SQLite] Migração de colunas em devices:', e.message);
    }
  }

  private seedInitialData(): void {
    // 1. Seed Admin User if not exists
    const usersCount = (this.db.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0;
    if (usersCount === 0) {
      const stmt = this.db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        'usr-admin-01',
        'admin@scooterlink.com',
        'admin123',
        'Gustavo Dias',
        'admin',
        new Date().toISOString()
      );
      console.log('👤 [SQLite] Usuário admin padrão semeado em scooter_link.db');
    }

    // 2. Seed Default Device scooter-001 with secret key hash
    const deviceCount = (this.db.prepare('SELECT COUNT(*) as count FROM devices').get() as any)?.count || 0;
    if (deviceCount === 0) {
      const defaultHash = hashDeviceKey(DEFAULT_DEVICE_SECRET_KEY);
      const stmt = this.db.prepare(`
        INSERT INTO devices (
          id, device_id, device_key_hash, raw_device_key, display_name, status,
          last_seen_at, created_at, updated_at, model, sim_number,
          is_online, is_on, headlight, turn_signal, signal_rssi,
          network_registered, theft_mode, firmware_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        'dev-scooter-001',
        'scooter-001',
        defaultHash,
        DEFAULT_DEVICE_SECRET_KEY,
        'Scooter Link 001',
        'active',
        new Date().toISOString(),
        new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        new Date().toISOString(),
        'ESP32 + SIM800L + NEO-6M',
        '+55 (11) 98765-4321',
        1,
        0,
        0,
        'off',
        24,
        1,
        0,
        'v2.1.0-remote'
      );
      console.log('🏍️ [SQLite] Dispositivo scooter-001 semeado com hash de segurança e chave padrão');
    } else {
      // Ensure scooter-001 has active status, raw_device_key and valid device_key_hash
      try {
        const dev = this.db.prepare('SELECT * FROM devices WHERE device_id = ?').get('scooter-001') as any;
        if (dev && (!dev.device_key_hash || !dev.status || !dev.raw_device_key)) {
          this.db.prepare(`
            UPDATE devices
            SET device_key_hash = COALESCE(device_key_hash, ?),
                raw_device_key = COALESCE(raw_device_key, ?),
                status = COALESCE(status, 'active'),
                display_name = COALESCE(display_name, 'Scooter Link 001')
            WHERE device_id = 'scooter-001'
          `).run(hashDeviceKey(DEFAULT_DEVICE_SECRET_KEY), DEFAULT_DEVICE_SECRET_KEY);
        }
      } catch {}
    }

    // 3. Seed Initial Telemetry Trail if empty
    const telemetryCount = (this.db.prepare('SELECT COUNT(*) as count FROM telemetry').get() as any)?.count || 0;
    if (telemetryCount === 0) {
      const baseLat = -23.55052;
      const baseLng = -46.63331;
      const now = Date.now();
      const count = 30;

      const stmt = this.db.prepare(`
        INSERT INTO telemetry (
          id, device_id, latitude, longitude, speed_kmh, altitude_meters,
          course_degrees, satellites, hdop, battery_voltage, battery_percentage,
          signal_rssi, network_registered, is_on, theft_mode, gps_date_utc,
          gps_time_utc, timestamp, gps_date_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = count; i >= 0; i--) {
        const timestamp = new Date(now - i * 30 * 1000);
        const progress = (count - i) / count;
        const lat = baseLat + progress * 0.006 + Math.sin(progress * Math.PI) * 0.001;
        const lng = baseLng + progress * -0.008;
        const isLast = i === 0;

        stmt.run(
          `tel-init-${i}`,
          'scooter-001',
          Number(lat.toFixed(6)),
          Number(lng.toFixed(6)),
          isLast ? 0 : Number((18.6 + Math.sin(i) * 5).toFixed(1)),
          Number((760.4 + Math.cos(i) * 3).toFixed(1)),
          120 + Math.floor(Math.sin(i) * 10),
          9,
          0.9,
          Number((4.14 - progress * 0.03).toFixed(2)),
          Math.round(95 - progress * 2),
          22,
          1,
          0,
          0,
          timestamp.toISOString().split('T')[0],
          timestamp.toISOString().split('T')[1].slice(0, 8),
          timestamp.toISOString(),
          timestamp.toISOString(),
          timestamp.toISOString()
        );
      }
      console.log(`📍 [SQLite] ${count + 1} registros de telemetria inicial semeados em scooter_link.db`);
    }

    // 4. Seed Geofence
    const geoCount = (this.db.prepare('SELECT COUNT(*) as count FROM geofences').get() as any)?.count || 0;
    if (geoCount === 0) {
      const stmt = this.db.prepare(`
        INSERT INTO geofences (
          id, device_id, name, latitude, longitude, radius_meters, active, notify_on_exit, notify_on_entry, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        'geo-home-01',
        'scooter-001',
        'Garagem / Área Segura',
        -23.55052,
        -46.63331,
        150,
        1,
        1,
        0,
        new Date().toISOString()
      );
    }

    // 5. Seed Authorized Contacts
    const contactCount = (this.db.prepare('SELECT COUNT(*) as count FROM authorized_contacts').get() as any)?.count || 0;
    if (contactCount === 0) {
      const stmt = this.db.prepare(`
        INSERT INTO authorized_contacts (
          id, device_id, name, phone, notify_sms, notify_call, notify_telegram, telegram_chat_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        'contact-01',
        'scooter-001',
        'Proprietário (Admin)',
        '+55 (11) 99876-5432',
        1,
        1,
        1,
        '123456789',
        new Date().toISOString()
      );
      stmt.run(
        'contact-02',
        'scooter-001',
        'Central 24h',
        '+55 (11) 98123-0000',
        1,
        0,
        0,
        '',
        new Date().toISOString()
      );
    }
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      return rows as unknown as T[];
    } catch (err: any) {
      console.error('❌ [SQLite Query Error]:', err.message, 'SQL:', sql, 'Params:', params);
      throw err;
    }
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint | string }> {
    try {
      const stmt = this.db.prepare(sql);
      const res = stmt.run(...params);

      // Auto update device last_seen_at or state if modifying telemetry
      const upper = sql.toUpperCase();
      if (upper.includes('INSERT INTO TELEMETRY')) {
        const deviceId = params[1] || 'scooter-001';
        const signalRssi = params[11];
        const netReg = params[12];
        const isOn = params[13];
        const theft = params[14];

        this.db.prepare(`
          UPDATE devices
          SET last_seen_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP,
              is_online = 1,
              signal_rssi = COALESCE(?, signal_rssi),
              network_registered = COALESCE(?, network_registered),
              is_on = COALESCE(?, is_on),
              theft_mode = COALESCE(?, theft_mode)
          WHERE device_id = ?
        `).run(signalRssi, netReg, isOn, theft, deviceId);
      }

      return {
        changes: Number(res.changes),
        lastInsertRowid: res.lastInsertRowid,
      };
    } catch (err: any) {
      console.error('❌ [SQLite Run Error]:', err.message, 'SQL:', sql, 'Params:', params);
      throw err;
    }
  }

  async getStats(): Promise<DatabaseStats> {
    let fileSizeBytes = 0;
    try {
      const stats = fs.statSync(this.filePath);
      fileSizeBytes = stats.size;
    } catch {}

    const getCount = (table: string): number => {
      try {
        const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any;
        return Number(row?.count || 0);
      } catch {
        return 0;
      }
    };

    const users = getCount('users');
    const devices = getCount('devices');
    const telemetry = getCount('telemetry');
    const commands = getCount('commands');
    const commandAcks = getCount('command_acks');
    const alerts = getCount('alerts');
    const geofences = getCount('geofences');
    const authorizedContacts = getCount('authorized_contacts');
    const deviceIdentityHistory = getCount('device_identity_history');

    let lastTelTime: string | undefined;
    try {
      const lastTel = this.db.prepare('SELECT created_at FROM telemetry ORDER BY created_at DESC LIMIT 1').get() as any;
      lastTelTime = lastTel?.created_at;
    } catch {}

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return {
      filePath: this.filePath,
      fileName: DB_FILENAME,
      fileSizeBytes,
      fileSizeFormatted: formatBytes(fileSizeBytes),
      journalMode: 'WAL (Write-Ahead Logging)',
      tableCounts: {
        users,
        devices,
        telemetry,
        commands,
        commandAcks,
        alerts,
        geofences,
        authorizedContacts,
        deviceIdentityHistory,
      },
      lastTelemetryTimestamp: lastTelTime,
      totalRecords: users + devices + telemetry + commands + commandAcks + alerts + geofences + authorizedContacts + deviceIdentityHistory,
    };
  }
}

class SQLiteCloudDatabase implements IDatabase {
  public isCloud = true;
  public dbType = 'SQLiteCloud (Nuvem Global)';
  public filePath = 'sqlitecloud://cloud-cluster/scooter_link.db';
  private cloudClient: SQLiteCloudDriver;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    console.log('☁️ [SQLiteCloud] Inicializando conexão com cluster SQLite Cloud...');
    this.cloudClient = new SQLiteCloudDriver(connectionString);
    this.ready = this.initTables();
  }

  private async initTables(): Promise<void> {
    try {
      await this.cloudClient.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          device_id TEXT UNIQUE NOT NULL,
          device_key_hash TEXT NOT NULL,
          display_name TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          model TEXT DEFAULT 'ESP32-SIM800L-NEO6M',
          sim_number TEXT,
          is_online INTEGER DEFAULT 1,
          is_on INTEGER DEFAULT 0,
          headlight INTEGER DEFAULT 0,
          turn_signal TEXT DEFAULT 'off',
          signal_rssi INTEGER DEFAULT 22,
          network_registered INTEGER DEFAULT 1,
          theft_mode INTEGER DEFAULT 0,
          firmware_version TEXT DEFAULT 'v2.1.0-remote'
        );

        CREATE TABLE IF NOT EXISTS device_identity_history (
          id TEXT PRIMARY KEY,
          old_device_id TEXT NOT NULL,
          new_device_id TEXT NOT NULL,
          changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          changed_by TEXT
        );

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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS commands (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          type TEXT NOT NULL,
          payload TEXT DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          delivered_at DATETIME,
          executed_at DATETIME,
          message TEXT
        );

        CREATE TABLE IF NOT EXISTS command_acks (
          id TEXT PRIMARY KEY,
          command_id TEXT NOT NULL,
          device_id TEXT NOT NULL,
          status TEXT NOT NULL,
          executed_at DATETIME NOT NULL,
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          type TEXT NOT NULL,
          message TEXT NOT NULL,
          latitude REAL,
          longitude REAL,
          resolved INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS authorized_contacts (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          notify_sms INTEGER DEFAULT 1,
          notify_call INTEGER DEFAULT 0,
          notify_telegram INTEGER DEFAULT 1,
          telegram_chat_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      // Bancos importados de versoes anteriores podem ter a tabela devices
      // sem os campos usados pela autenticacao da API atual.
      const deviceMigrations = [
        `ALTER TABLE devices ADD COLUMN device_key_hash TEXT`,
        `ALTER TABLE devices ADD COLUMN raw_device_key TEXT`,
        `ALTER TABLE devices ADD COLUMN display_name TEXT`,
        `ALTER TABLE devices ADD COLUMN status TEXT`,
        `ALTER TABLE devices ADD COLUMN last_seen_at DATETIME`,
        `ALTER TABLE devices ADD COLUMN updated_at DATETIME`,
      ];

      for (const migration of deviceMigrations) {
        try {
          await this.cloudClient.exec(migration);
        } catch {
          // A coluna ja existe ou a versao do banco nao precisa da migracao.
        }
      }

      const defaultHash = hashDeviceKey(DEFAULT_DEVICE_SECRET_KEY);
      await this.cloudClient.exec(`
        UPDATE devices
        SET device_key_hash = '${defaultHash}',
            raw_device_key = '${DEFAULT_DEVICE_SECRET_KEY}',
            display_name = COALESCE(display_name, device_id),
            status = COALESCE(status, 'active'),
            last_seen_at = COALESCE(last_seen_at, CURRENT_TIMESTAMP),
            updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
        WHERE device_key_hash IS NULL OR trim(device_key_hash) = '';
      `);

      // A scooter inicial deve existir mesmo que o banco tenha telemetria ou
      // dados importados de uma versao antiga. Isso evita o erro de cadastro
      // inicial quando o painel procura por scooter-001.
      // A chave vem da variavel DEVICE_API_KEY do Render, nunca do navegador.
      const deviceColumns = await (this.cloudClient as any).sql('PRAGMA table_info(devices)');
      const hasLegacyName = (Array.isArray(deviceColumns) ? deviceColumns : [deviceColumns])
        .some((column: any) => column?.name === 'name');
      const hasLegacyToken = (Array.isArray(deviceColumns) ? deviceColumns : [deviceColumns])
        .some((column: any) => column?.name === 'token');
      const legacyNameColumn = hasLegacyName ? ', name' : '';
      const legacyNameValue = hasLegacyName ? ", 'Scooter Link 001'" : '';
      const legacyTokenColumn = hasLegacyToken ? ', token' : '';
      const legacyTokenValue = hasLegacyToken ? `, '${DEFAULT_DEVICE_SECRET_KEY}'` : '';

      await this.cloudClient.exec(`
        INSERT OR IGNORE INTO devices (
          id, device_id, device_key_hash, raw_device_key, display_name, status,
          last_seen_at, created_at, updated_at, model, is_online, is_on,
          headlight, turn_signal, signal_rssi, network_registered, theft_mode,
          firmware_version${legacyNameColumn}${legacyTokenColumn}
        ) VALUES (
          'dev-scooter-001', 'scooter-001', '${defaultHash}', '${DEFAULT_DEVICE_SECRET_KEY}',
          'Scooter Link 001', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP, 'ESP32-SIM800L-NEO6M', 0, 0, 0, 'off', 0, 0, 0,
          'v2.1.0-remote'${legacyNameValue}${legacyTokenValue}
        );
      `);

      console.log('✅ [SQLiteCloud] Tabelas verificadas/inicializadas com sucesso no SQLite Cloud.');
    } catch (err: any) {
      console.warn('⚠️ [SQLiteCloud] Aviso ao inicializar tabelas:', err.message);
    }
  }

  async exec(sql: string): Promise<void> {
    await this.ready;
    await this.cloudClient.exec(sql);
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.ready;
    try {
      if (params && params.length > 0) {
        const res = await (this.cloudClient as any).sql(sql, ...params);
        return (Array.isArray(res) ? res : [res]) as unknown as T[];
      }
      const res = await (this.cloudClient as any).sql(sql);
      return (Array.isArray(res) ? res : [res]) as unknown as T[];
    } catch (err: any) {
      console.error('❌ [SQLiteCloud Query Error]:', err.message);
      throw err;
    }
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint | string }> {
    await this.ready;
    try {
      if (params && params.length > 0) {
        await (this.cloudClient as any).sql(sql, ...params);
      } else {
        await (this.cloudClient as any).sql(sql);
      }
      return { changes: 1 };
    } catch (err: any) {
      console.error('❌ [SQLiteCloud Run Error]:', err.message);
      throw err;
    }
  }

  async getStats(): Promise<DatabaseStats> {
    await this.ready;
    const getCount = async (table: string): Promise<number> => {
      try {
        const rows = await (this.cloudClient as any).sql(`SELECT COUNT(*) as count FROM ${table}`);
        const first = Array.isArray(rows) ? rows[0] : rows;
        return Number(first?.count || 0);
      } catch {
        return 0;
      }
    };

    const users = await getCount('users');
    const devices = await getCount('devices');
    const telemetry = await getCount('telemetry');
    const commands = await getCount('commands');
    const commandAcks = await getCount('command_acks');
    const alerts = await getCount('alerts');
    const geofences = await getCount('geofences');
    const authorizedContacts = await getCount('authorized_contacts');
    const deviceIdentityHistory = await getCount('device_identity_history');

    return {
      filePath: 'Nuvem SQLite Cloud (Remoto)',
      fileName: 'sqlitecloud.db',
      fileSizeBytes: 0,
      fileSizeFormatted: 'Nuvem (Ilimitado)',
      journalMode: 'Cloud Replicated',
      tableCounts: {
        users,
        devices,
        telemetry,
        commands,
        commandAcks,
        alerts,
        geofences,
        authorizedContacts,
        deviceIdentityHistory,
      },
      lastTelemetryTimestamp: new Date().toISOString(),
      totalRecords: users + devices + telemetry + commands + commandAcks + alerts + geofences + authorizedContacts + deviceIdentityHistory,
    };
  }
}

let dbInstance: IDatabase | null = null;

export async function getDatabase(): Promise<IDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const cloudConn = process.env.SQLITECLOUD_CONNECTION_STRING || process.env.SQLITE_CLOUD_CONNECTION_STRING;
  if (cloudConn && cloudConn.trim().startsWith('sqlitecloud://')) {
    try {
      console.log('☁️ [Database] Detectada variável SQLITECLOUD_CONNECTION_STRING. Conectando ao SQLite Cloud...');
      const cloudDb = new SQLiteCloudDatabase(cloudConn.trim());
      dbInstance = cloudDb;
      return dbInstance;
    } catch (err: any) {
      console.error('❌ [Database] Falha ao conectar ao SQLite Cloud. Usando SQLite local:', err.message);
    }
  }

  dbInstance = new LocalSQLiteDatabase();
  return dbInstance;
}

export function getDatabaseFilePath(): string {
  return DB_PATH;
}
