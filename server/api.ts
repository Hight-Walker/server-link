import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDatabase, getDatabaseFilePath, verifyDeviceKey, hashDeviceKey, DEFAULT_DEVICE_SECRET_KEY } from './db.js';
import { triggerAlert, checkGeofenceBreaches } from './alerts.js';
import { generateEsp32Sketch } from './esp32Generator.js';
import { addSSEClient, removeSSEClient, broadcastEvent, getConnectedClientsCount, SSEClient } from './events.js';

export const apiRouter = Router();

const SESSION_COOKIE = 'scooterlink_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.header('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function createSessionToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + SESSION_DURATION_MS })).toString('base64url');
  const secret = process.env.JWT_SECRET || '';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function hasValidDashboardSession(req: Request): boolean {
  const token = getCookie(req, SESSION_COOKIE);
  const secret = process.env.JWT_SECRET || '';
  if (!token || !secret) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.email === 'string' && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function requireDashboardAuth(req: Request, res: Response, next: () => void): void {
  if (hasValidDashboardSession(req)) {
    next();
    return;
  }
  res.status(401).json({ error: 'Faça login para usar esta função.' });
}

const ALLOWED_COMMANDS = new Set([
  'start',
  'stop',
  'headlight_on',
  'headlight_off',
  'turn_left_on',
  'turn_right_on',
  'turn_off',
  'horn',
  'theft_mode_on',
  'theft_mode_off',
]);

// Helper to authenticate ESP32 calls using deviceId and X-Device-Key
async function authenticateEsp32Device(
  req: Request,
  deviceId: string
): Promise<{ ok: boolean; code?: string; message?: string; device?: any }> {
  const headerKey = req.header('x-device-key') || req.header('X-Device-Key');

  if (!deviceId || typeof deviceId !== 'string') {
    return {
      ok: false,
      code: 'DEVICE_ID_MISMATCH',
      message: 'Identificador ou chave da scooter inválidos.',
    };
  }

  if (!headerKey) {
    return {
      ok: false,
      code: 'DEVICE_ID_MISMATCH',
      message: 'Identificador ou chave da scooter inválidos.',
    };
  }

  const db = await getDatabase();
  const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [deviceId.trim()]);

  if (!devices || devices.length === 0) {
    return {
      ok: false,
      code: 'DEVICE_ID_MISMATCH',
      message: 'Identificador ou chave da scooter inválidos.',
    };
  }

  const device = devices[0];

  if (device.status !== 'active') {
    return {
      ok: false,
      code: 'DEVICE_ID_MISMATCH',
      message: 'Identificador ou chave da scooter inválidos.',
    };
  }

  const isKeyValid = verifyDeviceKey(headerKey, device.device_key_hash);
  if (!isKeyValid) {
    return {
      ok: false,
      code: 'DEVICE_ID_MISMATCH',
      message: 'Identificador ou chave da scooter inválidos.',
    };
  }

  return {
    ok: true,
    device,
  };
}

// Helper to calculate battery percentage from Li-ion voltage (3.2V = 0%, 4.2V = 100%)
function voltageToPercentage(volts: number): number {
  if (volts >= 4.2) return 100;
  if (volts <= 3.2) return 0;
  return Math.round(((volts - 3.2) / (4.2 - 3.2)) * 100);
}

// ----------------------------------------------------
// 1. Health & Server Status
// ----------------------------------------------------
apiRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const stats = await db.getStats();
    
    // Fetch registered devices count and primary active deviceId
    const activeDevs = await db.query(`SELECT device_id, display_name, status, last_seen_at FROM devices WHERE status = 'active' LIMIT 1`);
    const primaryDeviceId = activeDevs.length > 0 ? activeDevs[0].device_id : 'scooter-001';

    res.json({
      status: 'online',
      appName: 'Scooter Link Remote Server',
      database: db.dbType || 'SQLite 3 (scooter_link.db)',
      databaseFile: 'scooter_link.db',
      databaseStats: stats,
      initialDeviceId: primaryDeviceId,
      pollingIntervalSeconds: 5,
      time: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 2. Authentication (Users)
// ----------------------------------------------------
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || '';
    if (!adminEmail || !adminPassword) {
      return res.status(503).json({ error: 'Configure ADMIN_EMAIL e ADMIN_PASSWORD no Render antes de acessar o painel.' });
    }
    if (String(email || '').trim().toLowerCase() !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }
    const token = createSessionToken(adminEmail);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_DURATION_MS,
      path: '/',
    });
    return res.json({
      token,
      user: {
        id: 'usr-admin-01',
        email: adminEmail,
        name: 'Administrador',
        role: 'admin',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  if (!hasValidDashboardSession(req)) return res.status(401).json({ error: 'Sessão expirada.' });
  res.json({ user: { id: 'usr-admin-01', email: process.env.ADMIN_EMAIL, name: 'Administrador', role: 'admin' } });
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

// ----------------------------------------------------
// Real-Time Server-Sent Events (SSE) Stream
// ----------------------------------------------------
apiRouter.get(['/events', '/stream'], (req: Request, res: Response) => {
  const deviceId = (req.query.deviceId as string)?.trim() || undefined;
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const client: SSEClient = {
    id: clientId,
    res,
    deviceId,
    connectedAt: new Date().toISOString(),
  };

  addSSEClient(client);

  // Send initial connection confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, deviceId, timestamp: new Date().toISOString(), clientsCount: getConnectedClientsCount() })}\n\n`);

  // Heartbeat ping every 15s to keep connections and Cloud Run/Nginx proxies alive
  const pingInterval = setInterval(() => {
    try {
      res.write(`:ping\n\n`);
    } catch {
      clearInterval(pingInterval);
      removeSSEClient(client);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    removeSSEClient(client);
  });
});

// ----------------------------------------------------
// 3. Telemetry Ingestion (ESP32 POST /api/telemetry)
// ----------------------------------------------------
apiRouter.post('/telemetry', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const deviceId = (body.deviceId || '').trim();

    if (!deviceId) {
      return res.status(400).json({
        ok: false,
        code: 'DEVICE_ID_MISMATCH',
        message: 'deviceId é obrigatório no corpo JSON.',
      });
    }

    // 1. Buscar o dispositivo pelo deviceId
    // 2. Verificar se ele existe e está com status active
    // 3. Comparar com segurança X-Device-Key e device_key_hash
    const auth = await authenticateEsp32Device(req, deviceId);
    if (!auth.ok) {
      return res.status(403).json({
        ok: false,
        code: auth.code || 'DEVICE_ID_MISMATCH',
        message: auth.message || 'Identificador ou chave da scooter inválidos.',
      });
    }

    const timestamp = body.timestamp || new Date().toISOString();

    // Extract nested or flat GPS data
    const gps = body.gps || {};
    const latitude = gps.latitude !== undefined ? gps.latitude : (body.latitude !== undefined ? body.latitude : body.lat);
    const longitude = gps.longitude !== undefined ? gps.longitude : (body.longitude !== undefined ? body.longitude : body.lng);

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        ok: false,
        error: 'Payload incompleto. latitude (ou lat) e longitude (ou lng) são obrigatórios.',
      });
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const speedKmh = gps.speedKmh !== undefined ? parseFloat(gps.speedKmh) : (body.speedKmh !== undefined ? parseFloat(body.speedKmh) : (body.speed !== undefined ? parseFloat(body.speed) : 0));
    const altitudeMeters = gps.altitudeMeters !== undefined ? parseFloat(gps.altitudeMeters) : (body.altitudeMeters !== undefined ? parseFloat(body.altitudeMeters) : (body.alt !== undefined ? parseFloat(body.alt) : 0));
    const courseDegrees = gps.courseDegrees !== undefined ? parseFloat(gps.courseDegrees) : (body.courseDegrees !== undefined ? parseFloat(body.courseDegrees) : (body.course !== undefined ? parseFloat(body.course) : 0));
    const satellites = gps.satellites !== undefined ? parseInt(gps.satellites, 10) : (body.satellites !== undefined ? parseInt(body.satellites, 10) : (body.sats !== undefined ? parseInt(body.sats, 10) : 0));
    const hdop = gps.hdop !== undefined ? parseFloat(gps.hdop) : (body.hdop !== undefined ? parseFloat(body.hdop) : 1.0);
    const gpsDateUtc = gps.gpsDateUtc || body.date || timestamp.split('T')[0];
    const gpsTimeUtc = gps.gpsTimeUtc || body.time || (timestamp.split('T')[1] ? timestamp.split('T')[1].slice(0, 8) : '00:00:00');

    // Extract scooter state & network
    const scooterState = body.scooter || {};
    const isOn = scooterState.isOn !== undefined ? Boolean(scooterState.isOn) : (body.isOn !== undefined ? Boolean(body.isOn) : false);

    const networkState = body.network || {};
    const signalRssi = networkState.signalRssi !== undefined ? parseInt(networkState.signalRssi, 10) : (body.signalRssi !== undefined ? parseInt(body.signalRssi, 10) : (body.rssi !== undefined ? parseInt(body.rssi, 10) : 22));
    const registered = networkState.registered !== undefined ? Boolean(networkState.registered) : (body.netReg !== undefined ? Boolean(body.netReg) : true);

    const batteryVoltage = body.batteryVoltage !== undefined ? parseFloat(body.batteryVoltage) : (body.vbat !== undefined ? parseFloat(body.vbat) : 4.14);
    const batteryPercentage = body.batteryPercentage !== undefined ? parseInt(body.batteryPercentage, 10) : (body.pct !== undefined ? parseInt(body.pct, 10) : voltageToPercentage(batteryVoltage));
    const theftMode = body.theftMode === true || body.theftMode === 1 || body.theft === 1 || body.theft === true;

    const db = await getDatabase();
    const recordId = `tel-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    // Insert into database
    await db.run(
      `INSERT INTO telemetry (
        id, device_id, latitude, longitude, speed_kmh, altitude_meters,
        course_degrees, satellites, hdop, battery_voltage, battery_percentage,
        signal_rssi, network_registered, is_on, theft_mode, gps_date_utc, gps_time_utc,
        timestamp, gps_date_time, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recordId,
        deviceId,
        latNum,
        lngNum,
        speedKmh,
        altitudeMeters,
        courseDegrees,
        satellites,
        hdop,
        batteryVoltage,
        batteryPercentage,
        signalRssi,
        registered ? 1 : 0,
        isOn ? 1 : 0,
        theftMode ? 1 : 0,
        gpsDateUtc,
        gpsTimeUtc,
        timestamp,
        timestamp,
        nowIso,
      ]
    );

    // Update device last_seen_at and metrics
    await db.run(
      `UPDATE devices
       SET last_seen_at = ?,
           updated_at = ?,
           is_online = 1,
           signal_rssi = ?,
           network_registered = ?,
           is_on = ?,
           theft_mode = ?
       WHERE device_id = ?`,
      [nowIso, nowIso, signalRssi, registered ? 1 : 0, isOn ? 1 : 0, theftMode ? 1 : 0, deviceId]
    );

    // Check geofences asynchronously
    checkGeofenceBreaches(deviceId, latNum, lngNum).catch((e) =>
      console.error('Error checking geofences:', e)
    );

    // Trigger low battery alert if below threshold
    if (batteryPercentage < 20) {
      triggerAlert({
        deviceId,
        type: 'LOW_BATTERY',
        message: `⚠️ Bateria fraca na scooter (${batteryPercentage}% - ${batteryVoltage.toFixed(2)}V). Recarregue a bateria.`,
        latitude: latNum,
        longitude: lngNum,
      }).catch((e) => console.error(e));
    }

    // Broadcast Real-Time SSE to all connected clients & dashboards
    try {
      const telemetryPayload = {
        id: recordId,
        deviceId,
        latitude: latNum,
        longitude: lngNum,
        speedKmh,
        altitudeMeters,
        courseDegrees,
        satellites,
        hdop,
        batteryVoltage,
        batteryPercentage,
        signalRssi,
        networkRegistered: registered,
        isOn,
        theftMode,
        timestamp,
        gpsDateTime: timestamp,
        createdAt: nowIso,
      };

      broadcastEvent('telemetry', {
        deviceId,
        telemetry: telemetryPayload,
        isOnline: true,
        lastSeenAt: nowIso,
      }, deviceId);

      broadcastEvent('scooter_update', {
        deviceId,
        telemetry: telemetryPayload,
        isOnline: true,
        lastSeenAt: nowIso,
      }, deviceId);
    } catch (sseErr) {
      console.warn('SSE Broadcast Error on Telemetry:', sseErr);
    }

    // Required response format for ESP32
    return res.status(200).json({
      ok: true,
      serverTime: nowIso,
    });
  } catch (err: any) {
    console.error('Erro na ingestão de telemetria:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ----------------------------------------------------
// 4. Create Command (POST /api/scooters/:deviceId/commands or POST /api/commands)
// ----------------------------------------------------
apiRouter.post(['/scooters/:deviceId/commands', '/commands'], requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const deviceId = (req.params.deviceId || req.body.deviceId || 'scooter-001').trim();
    const { type, payload = {} } = req.body;

    if (!type || !ALLOWED_COMMANDS.has(type)) {
      return res.status(400).json({
        error: `Comando '${type}' inválido. Comandos permitidos: ${Array.from(ALLOWED_COMMANDS).join(', ')}`,
      });
    }

    const db = await getDatabase();
    
    // Check if device exists
    const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
    if (!devices || devices.length === 0) {
      return res.status(404).json({ error: `Dispositivo '${deviceId}' não encontrado.` });
    }

    const commandId = `cmd_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    await db.run(
      `INSERT INTO commands (id, device_id, type, payload, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [commandId, deviceId, type, JSON.stringify(payload), nowIso]
    );

    const createdCommand = {
      id: commandId,
      deviceId,
      type,
      payload,
      status: 'pending',
      createdAt: nowIso,
    };

    // Broadcast Real-Time SSE to all open tabs and mobile devices
    try {
      broadcastEvent('command_created', {
        deviceId,
        command: createdCommand,
      }, deviceId);

      broadcastEvent('scooter_update', {
        deviceId,
        hasPendingCommands: true,
      }, deviceId);
    } catch (e) {
      console.warn('SSE broadcast error on command create:', e);
    }

    return res.status(201).json(createdCommand);
  } catch (err: any) {
    console.error('Erro ao criar comando:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 5. Query Commands (GET /api/scooters/:deviceId/commands?status=pending)
// ----------------------------------------------------
apiRouter.get('/scooters/:deviceId/commands', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { status } = req.query;
    const db = await getDatabase();

    // A fila pendente e exclusiva do ESP32 autenticado. Sem isto, qualquer
    // pessoa que conhecesse o deviceId poderia ler e confirmar comandos.
    if (status === 'pending') {
      const auth = await authenticateEsp32Device(req, deviceId);
      if (!auth.ok) {
        return res.status(403).json({
          ok: false,
          code: auth.code || 'DEVICE_ID_MISMATCH',
          message: auth.message || 'Identificador ou chave da scooter inválidos.',
        });
      }

      const rows = await db.query(
        `SELECT id, type, payload, created_at FROM commands WHERE device_id = ? AND status = 'pending' ORDER BY created_at ASC`,
        [deviceId]
      );

      const formatted = rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload || '{}') : (r.payload || {}),
        createdAt: r.created_at,
      }));

      return res.json({
        commands: formatted,
      });
    }

    // If query is for command history (UI cockpit feed)
    const rows = await db.query(
      `SELECT * FROM commands WHERE device_id = ? ORDER BY created_at DESC LIMIT 50`,
      [deviceId]
    );

    const formatted = rows.map((r: any) => ({
      id: r.id,
      deviceId: r.device_id,
      type: r.type,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload || '{}') : (r.payload || {}),
      status: r.status,
      createdAt: r.created_at,
      deliveredAt: r.delivered_at,
      executedAt: r.executed_at,
      message: r.message,
    }));

    return res.json({ commands: formatted });
  } catch (err: any) {
    console.error('Erro ao consultar comandos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 6. Command Execution Acknowledgement (POST /api/commands/:id/ack)
// ----------------------------------------------------
apiRouter.post('/commands/:id/ack', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status = 'executed', executedAt, message = 'Comando executado' } = req.body;

    const db = await getDatabase();
    const nowIso = executedAt || new Date().toISOString();
    const ackId = `ack_${Date.now()}`;

    // Somente o ESP32 dono do comando pode confirmar a execucao.
    const cmds = await db.query('SELECT * FROM commands WHERE id = ?', [id]);
    const cmd = cmds.length > 0 ? cmds[0] : null;
    if (!cmd) {
      return res.status(404).json({ ok: false, error: 'Comando não encontrado.' });
    }
    const auth = await authenticateEsp32Device(req, cmd.device_id);
    if (!auth.ok) {
      return res.status(403).json({
        ok: false,
        code: auth.code || 'DEVICE_ID_MISMATCH',
        message: auth.message || 'Identificador ou chave da scooter inválidos.',
      });
    }

    // Update command status
    await db.run(
      `UPDATE commands SET status = ?, executed_at = ?, message = ? WHERE id = ?`,
      [status, nowIso, message, id]
    );

    const deviceId = cmd.device_id;

    await db.run(
      `INSERT INTO command_acks (id, command_id, device_id, status, executed_at, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ackId, id, deviceId, status, nowIso, message, nowIso]
    );

    // Broadcast Real-Time SSE for Command ACK
    try {
      broadcastEvent('command_ack', {
        commandId: id,
        deviceId,
        status,
        executedAt: nowIso,
        message,
      }, deviceId);

      broadcastEvent('scooter_update', {
        deviceId,
      }, deviceId);
    } catch (e) {
      console.warn('SSE broadcast error on ACK:', e);
    }

    return res.json({
      ok: true,
      commandId: id,
      status,
      executedAt: nowIso,
      message,
    });
  } catch (err: any) {
    console.error('Erro ao confirmar comando (ACK):', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 7. Update Device Identity (PUT /api/scooters/:deviceId/identity)
// ----------------------------------------------------
apiRouter.put('/scooters/:deviceId/identity', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { newDeviceId, changedBy = 'Usuário do Sistema' } = req.body;

    if (!newDeviceId || typeof newDeviceId !== 'string') {
      return res.status(400).json({
        ok: false,
        message: 'O campo newDeviceId é obrigatório.',
      });
    }

    const cleanNewId = newDeviceId.trim();
    const cleanOldId = deviceId.trim();

    // Validate format
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanNewId)) {
      return res.status(400).json({
        ok: false,
        message: 'O novo identificador deve ter entre 3 e 32 caracteres (apenas letras, números, hífen ou underline).',
      });
    }

    if (cleanNewId === cleanOldId) {
      return res.status(400).json({
        ok: false,
        message: 'O novo identificador não pode ser idêntico ao identificador atual.',
      });
    }

    const db = await getDatabase();

    // 1. Verify old device exists
    const oldDevices = await db.query('SELECT * FROM devices WHERE device_id = ?', [cleanOldId]);
    if (!oldDevices || oldDevices.length === 0) {
      return res.status(404).json({
        ok: false,
        message: `Dispositivo atual '${cleanOldId}' não encontrado no banco de dados.`,
      });
    }

    // 2. Verify new deviceId is not already taken
    const existing = await db.query('SELECT * FROM devices WHERE device_id = ?', [cleanNewId]);
    if (existing && existing.length > 0) {
      return res.status(409).json({
        ok: false,
        message: `O identificador '${cleanNewId}' já está em uso por outro dispositivo. Escolha outro.`,
      });
    }

    const nowIso = new Date().toISOString();
    const historyId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // 3. Update devices table
    await db.run(
      `UPDATE devices SET device_id = ?, updated_at = ? WHERE device_id = ?`,
      [cleanNewId, nowIso, cleanOldId]
    );

    // 4. Update linked tables to keep data intact
    await db.run(`UPDATE telemetry SET device_id = ? WHERE device_id = ?`, [cleanNewId, cleanOldId]);
    await db.run(`UPDATE commands SET device_id = ? WHERE device_id = ?`, [cleanNewId, cleanOldId]);
    await db.run(`UPDATE command_acks SET device_id = ? WHERE device_id = ?`, [cleanNewId, cleanOldId]);
    await db.run(`UPDATE alerts SET device_id = ? WHERE device_id = ?`, [cleanNewId, cleanOldId]);
    await db.run(`UPDATE geofences SET device_id = ? WHERE device_id = ?`, [cleanNewId, cleanOldId]);
    await db.run(`UPDATE authorized_contacts SET device_id = ? WHERE device_id = ?`, [cleanNewId, cleanOldId]);

    // 5. Register in audit table device_identity_history
    await db.run(
      `INSERT INTO device_identity_history (id, old_device_id, new_device_id, changed_at, changed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [historyId, cleanOldId, cleanNewId, nowIso, changedBy]
    );

    console.log(`🔒 [Security Audit] Identificador alterado: ${cleanOldId} -> ${cleanNewId} por '${changedBy}'`);

    return res.json({
      ok: true,
      message: 'Identificador atualizado com sucesso no servidor.',
      oldDeviceId: cleanOldId,
      newDeviceId: cleanNewId,
      changedAt: nowIso,
      changedBy,
      note: 'O ESP32 ainda precisa receber a atualização via Bluetooth ou comando remoto antes de usar o novo ID nos envios de telemetria.',
    });
  } catch (err: any) {
    console.error('Erro ao atualizar identidade do dispositivo:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ----------------------------------------------------
// 8. Identity Audit History (GET /api/scooters/:deviceId/identity/history)
// ----------------------------------------------------
apiRouter.get('/scooters/:deviceId/identity/history', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const db = await getDatabase();

    const history = await db.query(
      `SELECT * FROM device_identity_history 
       WHERE old_device_id = ? OR new_device_id = ? 
       ORDER BY changed_at DESC LIMIT 50`,
      [deviceId, deviceId]
    );

    return res.json({
      deviceId,
      history: history.map((h: any) => ({
        id: h.id,
        oldDeviceId: h.old_device_id,
        newDeviceId: h.new_device_id,
        changedAt: h.changed_at,
        changedBy: h.changed_by,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 9. List Devices (GET /api/devices)
// ----------------------------------------------------
// ----------------------------------------------------
// 9. List Devices (GET /api/devices)
// ----------------------------------------------------
apiRouter.get('/devices', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const rows = await db.query('SELECT * FROM devices ORDER BY created_at ASC');

    const devices = rows.map((d: any) => {
      const lastSeen = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
      // 60 seconds threshold for online status
      const isOnline = d.status === 'active' && lastSeen > 0 && Date.now() - lastSeen <= 60000;
      return {
        id: d.id,
        deviceId: d.device_id,
        displayName: d.display_name || d.device_id,
        status: d.status || 'active',
        model: d.model,
        simNumber: d.sim_number,
        isOnline,
        isOn: Boolean(d.is_on),
        headlight: Boolean(d.headlight),
        turnSignal: d.turn_signal || 'off',
        signalRssi: d.signal_rssi || 22,
        networkRegistered: Boolean(d.network_registered ?? 1),
        theftMode: Boolean(d.theft_mode),
        firmwareVersion: d.firmware_version,
        lastSeenAt: d.last_seen_at,
        deviceKeyMasked: d.device_key_hash ? `••••••••••••${d.device_key_hash.slice(-4)}` : '••••••••••••••••',
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      };
    });

    res.json({ devices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Register / Add a new ESP32 device in the database
apiRouter.post('/devices', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId, displayName, model = 'ESP32-SIM800L-NEO6M', simNumber = '+55 (11) 98765-4321', rawDeviceKey } = req.body;

    let cleanDeviceId = (deviceId || '').trim();
    const db = await getDatabase();

    // Auto-generate deviceId if not provided or empty (e.g. scooter-001, scooter-002...)
    if (!cleanDeviceId) {
      const allDevs = await db.query('SELECT device_id FROM devices');
      const count = allDevs.length + 1;
      cleanDeviceId = `scooter-${String(count).padStart(3, '0')}`;
    }

    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanDeviceId)) {
      return res.status(400).json({
        ok: false,
        error: 'O deviceId deve ter entre 3 e 32 caracteres (apenas letras, números, hífen ou underline).',
      });
    }

    const existing = await db.query('SELECT * FROM devices WHERE device_id = ?', [cleanDeviceId]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ ok: false, error: `Dispositivo com ID '${cleanDeviceId}' já está cadastrado.` });
    }

    // Generate strong unique secret key if not specified
    const generatedRawKey = rawDeviceKey && rawDeviceKey.trim().length >= 8
      ? rawDeviceKey.trim()
      : `sec_live_${crypto.randomBytes(16).toString('hex')}`;
    
    const keyHash = hashDeviceKey(generatedRawKey);
    const nowIso = new Date().toISOString();
    const devDbId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Alguns bancos criados pela versao antiga do projeto exigem tambem a
    // coluna `name`. Detectamos isso antes de inserir para o cadastro funcionar
    // tanto no banco novo quanto no banco ja importado no SQLite Cloud.
    const columns = await db.query<any>('PRAGMA table_info(devices)');
    const hasLegacyName = columns.some((column: any) => column.name === 'name');
    const hasLegacyToken = columns.some((column: any) => column.name === 'token');
    const nameColumn = hasLegacyName ? ', name' : '';
    const nameValue = hasLegacyName ? ', ?' : '';
    const tokenColumn = hasLegacyToken ? ', token' : '';
    const tokenValue = hasLegacyToken ? ', ?' : '';
    const values = [
      devDbId,
      cleanDeviceId,
      displayName ? displayName.trim() : cleanDeviceId,
      'active',
      model,
      simNumber,
      0,
      0,
      0,
      'off',
      22,
      1,
      0,
      'v2.1.0-remote',
      keyHash,
      generatedRawKey,
      nowIso,
      nowIso,
    ];
    if (hasLegacyName) values.push(displayName ? displayName.trim() : cleanDeviceId);
    if (hasLegacyToken) values.push(generatedRawKey);

    await db.run(
      `INSERT INTO devices (
        id, device_id, display_name, status, model, sim_number,
        is_online, is_on, headlight, turn_signal, signal_rssi, network_registered,
        theft_mode, firmware_version, device_key_hash, raw_device_key, last_seen_at, created_at, updated_at${nameColumn}${tokenColumn}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?${nameValue}${tokenValue})`,
      values
    );

    console.log(`✨ [Database] Nova scooter cadastrada: ${cleanDeviceId}`);

    // Return the full secret key upon creation
    res.json({
      ok: true,
      message: `Dispositivo '${cleanDeviceId}' cadastrado com sucesso.`,
      device: {
        id: devDbId,
        deviceId: cleanDeviceId,
        displayName: displayName || cleanDeviceId,
        status: 'active',
        lastSeenAt: null,
      },
      rawDeviceKey: generatedRawKey,
      deviceKey: generatedRawKey,
      note: 'Chave secreta configurada com sucesso para o dispositivo.',
    });
  } catch (err: any) {
    console.error('Erro ao cadastrar dispositivo:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// View secret device key
apiRouter.get('/devices/:deviceId/key', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const db = await getDatabase();
    const cleanId = (deviceId || '').trim();

    const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [cleanId]);
    if (!devices || devices.length === 0) {
      return res.status(404).json({ ok: false, error: `Dispositivo '${cleanId}' não encontrado.` });
    }

    const dev = devices[0];
    const key = dev.raw_device_key || DEFAULT_DEVICE_SECRET_KEY;
    const masked = key.length > 4 ? `••••••••••••${key.slice(-4)}` : '••••••••';

    return res.json({
      ok: true,
      deviceId: cleanId,
      deviceKey: key,
      deviceKeyMasked: masked,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update / Set custom secret device key
apiRouter.put('/devices/:deviceId/key', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { deviceKey } = req.body;
    const db = await getDatabase();
    const cleanId = (deviceId || '').trim();
    const cleanKey = (deviceKey || '').trim();

    if (!cleanKey || cleanKey.length < 4) {
      return res.status(400).json({
        ok: false,
        error: 'A chave de segurança deve ter pelo menos 4 caracteres.',
      });
    }

    const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [cleanId]);
    if (!devices || devices.length === 0) {
      return res.status(404).json({ ok: false, error: `Dispositivo '${cleanId}' não encontrado.` });
    }

    const newKeyHash = hashDeviceKey(cleanKey);
    const nowIso = new Date().toISOString();

    await db.run(
      `UPDATE devices SET raw_device_key = ?, device_key_hash = ?, updated_at = ? WHERE device_id = ?`,
      [cleanKey, newKeyHash, nowIso, cleanId]
    );

    console.log(`🔑 [Security] Chave do dispositivo '${cleanId}' atualizada.`);

    return res.json({
      ok: true,
      deviceId: cleanId,
      deviceKey: cleanKey,
      deviceKeyMasked: `••••••••••••${cleanKey.slice(-4)}`,
      message: 'Chave de autenticação do dispositivo atualizada com sucesso!',
      updatedAt: nowIso,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Rotate secret device key (Generates new strong key, stores raw key and SHA-256 hash)
apiRouter.post('/devices/:deviceId/rotate-key', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const db = await getDatabase();
    const cleanId = (deviceId || '').trim();

    const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [cleanId]);
    if (!devices || devices.length === 0) {
      return res.status(404).json({ ok: false, message: `Dispositivo '${cleanId}' não encontrado.` });
    }

    // Generate cryptographically secure random key
    const newRawKey = `sec_live_${crypto.randomBytes(16).toString('hex')}`;
    const newKeyHash = hashDeviceKey(newRawKey);
    const nowIso = new Date().toISOString();

    await db.run(
      `UPDATE devices SET raw_device_key = ?, device_key_hash = ?, updated_at = ? WHERE device_id = ?`,
      [newRawKey, newKeyHash, nowIso, cleanId]
    );

    console.log(`🔑 [Security] Chave do dispositivo '${cleanId}' rotacionada com sucesso.`);

    return res.json({
      ok: true,
      deviceId: cleanId,
      newDeviceKey: newRawKey,
      deviceKey: newRawKey,
      deviceKeyMasked: `••••••••••••${newRawKey.slice(-4)}`,
      message: 'Nova chave secreta gerada e salva com sucesso! Copie-a e atualize no código do seu ESP32.',
      rotatedAt: nowIso,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Activate or Deactivate device status
apiRouter.patch('/devices/:deviceId/status', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { status } = req.body;
    const db = await getDatabase();
    const cleanId = (deviceId || '').trim();

    if (status !== 'active' && status !== 'disabled') {
      return res.status(400).json({ ok: false, error: "Status deve ser 'active' ou 'disabled'." });
    }

    const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [cleanId]);
    if (!devices || devices.length === 0) {
      return res.status(404).json({ ok: false, error: `Dispositivo '${cleanId}' não encontrado.` });
    }

    const nowIso = new Date().toISOString();
    await db.run(
      `UPDATE devices SET status = ?, updated_at = ? WHERE device_id = ?`,
      [status, nowIso, cleanId]
    );

    return res.json({
      ok: true,
      deviceId: cleanId,
      status,
      updatedAt: nowIso,
      message: `Status do dispositivo alterado para '${status}'.`,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Consolidated API Info & Configuration Endpoint
apiRouter.get('/devices/:deviceId/api-info', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const db = await getDatabase();
    const cleanId = (deviceId || '').trim();

    const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [cleanId]);
    if (!devices || devices.length === 0) {
      return res.status(404).json({ error: `Dispositivo '${cleanId}' não encontrado.` });
    }

    const dev = devices[0];
    const latestList = await db.query(
      `SELECT * FROM telemetry WHERE device_id = ? ORDER BY created_at DESC LIMIT 1`,
      [cleanId]
    );

    const latest = latestList.length > 0 ? latestList[0] : null;
    const lastSeenTime = dev.last_seen_at ? new Date(dev.last_seen_at).getTime() : 0;
    // 60 seconds threshold
    const isOnline = dev.status === 'active' && lastSeenTime > 0 && Date.now() - lastSeenTime <= 60000;

    const host = req.get('host') || 'scooterlink.app';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseApiUrl = `${protocol}://${host}/api`;
    const telemetryUrl = `${protocol}://${host}/api/telemetry`;
    const statusUrl = `${protocol}://${host}/api/status/${cleanId}`;

    let statusDisplay = 'active';
    if (dev.status === 'disabled') {
      statusDisplay = 'disabled';
    } else if (!dev.last_seen_at && !latest) {
      statusDisplay = 'awaiting_first_connection';
    }

    let currentKey = (dev.raw_device_key || '').trim();
    if (!currentKey || currentKey.startsWith('••••')) {
      currentKey = DEFAULT_DEVICE_SECRET_KEY;
      try {
        await db.run('UPDATE devices SET raw_device_key = ? WHERE device_id = ?', [currentKey, cleanId]);
      } catch {}
    }
    const maskedKey = currentKey.length > 4 ? `••••••••••••••••${currentKey.slice(-4)}` : '••••••••••••••••';

    res.json({
      baseApiUrl,
      telemetryUrl,
      statusUrl,
      deviceId: dev.device_id,
      displayName: dev.display_name || dev.device_id,
      status: dev.status,
      statusDisplay,
      isOnline,
      lastSeenAt: dev.last_seen_at || null,
      lastLocation: latest ? {
        latitude: Number(latest.latitude),
        longitude: Number(latest.longitude),
        speedKmh: Number(latest.speed_kmh || 0),
        altitudeMeters: Number(latest.altitude_meters || 0),
        courseDegrees: Number(latest.course_degrees || 0),
        satellites: Number(latest.satellites || 0),
        hdop: Number(latest.hdop || 1.0),
      } : null,
      deviceKey: currentKey,
      deviceKeyMasked: maskedKey,
      cppSnippet: `// Configuração Oficial Scooter-Link para ESP32 + SIM800L + GPS NEO-6M\nconst char* DEVICE_ID = "${cleanId}";\nconst char* TELEMETRY_URL = "${telemetryUrl}";\nconst char* DEVICE_KEY = "${currentKey}";`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Public Endpoint: GET /api/status/:deviceId
// ----------------------------------------------------
apiRouter.get('/status/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const db = await getDatabase();
    const cleanId = (deviceId || '').trim();

    const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [cleanId]);
    if (!devices || devices.length === 0) {
      return res.status(404).json({
        online: false,
        deviceId: cleanId,
        lastSeenAt: null,
        lastLocation: null,
        message: `Dispositivo '${cleanId}' não encontrado.`,
      });
    }

    const device = devices[0];
    const latestList = await db.query(
      `SELECT * FROM telemetry WHERE device_id = ? ORDER BY created_at DESC LIMIT 1`,
      [cleanId]
    );

    let lastLocation = null;
    let lastSeenAt = device.last_seen_at || null;

    if (latestList.length > 0) {
      const row = latestList[0];
      lastLocation = {
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speedKmh: Number(row.speed_kmh || 0),
      };
      if (!lastSeenAt) {
        lastSeenAt = row.created_at || row.timestamp;
      }
    }

    const lastSeenTime = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
    // 60 seconds threshold for online status
    const isOnline = device.status === 'active' && lastSeenTime > 0 && Date.now() - lastSeenTime <= 60000;

    return res.json({
      online: isOnline,
      deviceId: device.device_id,
      lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
      lastLocation: lastLocation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 10. Full Scooter Status (GET /api/scooters/:deviceId)
// ----------------------------------------------------
apiRouter.get('/scooters/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const db = await getDatabase();

    const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
    const device = devices.length > 0 ? devices[0] : null;

    const latestList = await db.query(
      `SELECT * FROM telemetry WHERE device_id = ? ORDER BY created_at DESC LIMIT 1`,
      [deviceId]
    );

    let telemetry = null;
    if (latestList.length > 0) {
      const row = latestList[0];
      telemetry = {
        id: row.id,
        deviceId: row.device_id,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speedKmh: Number(row.speed_kmh || 0),
        altitudeMeters: Number(row.altitude_meters || 0),
        courseDegrees: Number(row.course_degrees || 0),
        satellites: Number(row.satellites || 0),
        hdop: Number(row.hdop || 1.0),
        batteryVoltage: Number(row.battery_voltage || 4.14),
        batteryPercentage: Number(row.battery_percentage || 95),
        signalRssi: Number(row.signal_rssi || 22),
        networkRegistered: Boolean(row.network_registered ?? 1),
        isOn: Boolean(row.is_on),
        theftMode: Boolean(row.theft_mode),
        gpsDateUtc: row.gps_date_utc,
        gpsTimeUtc: row.gps_time_utc,
        timestamp: row.timestamp || row.gps_date_time,
        gpsDateTime: row.gps_date_time || row.timestamp,
        createdAt: row.created_at,
      };
    }

    // Pending commands count
    const pendingCmds = await db.query(
      `SELECT COUNT(*) as count FROM commands WHERE device_id = ? AND status = 'pending'`,
      [deviceId]
    );
    const pendingCount = pendingCmds.length > 0 ? Number(pendingCmds[0].count || 0) : 0;

    // Recent commands
    const recentCmds = await db.query(
      `SELECT * FROM commands WHERE device_id = ? ORDER BY created_at DESC LIMIT 10`,
      [deviceId]
    );

    // Calculate real online status: if last seen within 35 seconds
    const lastSeenTime = device ? new Date(device.last_seen_at || device.created_at).getTime() : 0;
    const isActuallyOnline = Date.now() - lastSeenTime < 35000;

    res.json({
      device: device ? {
        id: device.id,
        deviceId: device.device_id,
        displayName: device.display_name || device.device_id,
        status: device.status || 'active',
        model: device.model,
        simNumber: device.sim_number,
        isOnline: isActuallyOnline,
        isOn: Boolean(device.is_on),
        headlight: Boolean(device.headlight),
        turnSignal: device.turn_signal || 'off',
        lastSeenAt: device.last_seen_at,
        theftMode: Boolean(device.theft_mode),
        signalRssi: device.signal_rssi || 22,
        networkRegistered: Boolean(device.network_registered ?? 1),
        firmwareVersion: device.firmware_version,
        createdAt: device.created_at,
        updatedAt: device.updated_at,
      } : null,
      telemetry,
      isOnline: isActuallyOnline,
      pendingCommandsCount: pendingCount,
      recentCommands: recentCmds.map((c: any) => ({
        id: c.id,
        deviceId: c.device_id,
        type: c.type,
        payload: typeof c.payload === 'string' ? JSON.parse(c.payload || '{}') : (c.payload || {}),
        status: c.status,
        createdAt: c.created_at,
        executedAt: c.executed_at,
        message: c.message,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 11. Telemetry History (GET /api/scooters/:deviceId/telemetry/history)
// ----------------------------------------------------
apiRouter.get('/scooters/:deviceId/telemetry/history', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt((req.query.limit as string) || '150', 10);
    const db = await getDatabase();

    const results = await db.query(
      `SELECT * FROM telemetry WHERE device_id = ? ORDER BY created_at DESC LIMIT ${limit}`,
      [deviceId]
    );

    const formatted = results.map((row: any) => ({
      id: row.id,
      deviceId: row.device_id,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      speedKmh: Number(row.speed_kmh || 0),
      altitudeMeters: Number(row.altitude_meters || 0),
      courseDegrees: Number(row.course_degrees || 0),
      satellites: Number(row.satellites || 0),
      hdop: Number(row.hdop || 1.0),
      batteryVoltage: Number(row.battery_voltage || 4.14),
      batteryPercentage: Number(row.battery_percentage || 95),
      signalRssi: Number(row.signal_rssi || 22),
      networkRegistered: Boolean(row.network_registered ?? 1),
      isOn: Boolean(row.is_on),
      theftMode: Boolean(row.theft_mode),
      gpsDateUtc: row.gps_date_utc,
      gpsTimeUtc: row.gps_time_utc,
      timestamp: row.timestamp,
      gpsDateTime: row.gps_date_time || row.timestamp,
      createdAt: row.created_at,
    }));

    res.json({ history: formatted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 12. Geofences & Contacts & Alerts
// ----------------------------------------------------
apiRouter.get('/geofences', async (req: Request, res: Response) => {
  try {
    const deviceId = (req.query.deviceId as string) || 'scooter-001';
    const db = await getDatabase();
    const geofences = await db.query('SELECT * FROM geofences WHERE device_id = ?', [deviceId]);
    res.json({
      geofences: geofences.map((g: any) => ({
        id: g.id,
        deviceId: g.device_id,
        name: g.name,
        latitude: Number(g.latitude),
        longitude: Number(g.longitude),
        radiusMeters: Number(g.radius_meters),
        active: Boolean(g.active),
        notifyOnExit: Boolean(g.notify_on_exit),
        notifyOnEntry: Boolean(g.notify_on_entry),
        createdAt: g.created_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/geofences', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const {
      deviceId = 'scooter-001',
      name,
      latitude,
      longitude,
      radiusMeters = 150,
      active = 1,
      notifyOnExit = 1,
      notifyOnEntry = 0,
    } = req.body;

    const db = await getDatabase();
    const id = `geo-${Date.now()}`;
    await db.run(
      `INSERT INTO geofences (id, device_id, name, latitude, longitude, radius_meters, active, notify_on_exit, notify_on_entry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        deviceId,
        name,
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(radiusMeters),
        active ? 1 : 0,
        notifyOnExit ? 1 : 0,
        notifyOnEntry ? 1 : 0,
      ]
    );

    res.status(201).json({
      success: true,
      geofence: {
        id,
        deviceId,
        name,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radiusMeters: parseFloat(radiusMeters),
        active: Boolean(active),
        notifyOnExit: Boolean(notifyOnExit),
        notifyOnEntry: Boolean(notifyOnEntry),
      },
    });

    try {
      broadcastEvent('geofences_updated', { deviceId }, deviceId);
    } catch {}
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/geofences/:id', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    const rows = await db.query('SELECT device_id FROM geofences WHERE id = ?', [id]);
    const deviceId = rows[0]?.device_id;
    await db.run('DELETE FROM geofences WHERE id = ?', [id]);
    res.json({ success: true, id });

    try {
      broadcastEvent('geofences_updated', { deviceId, id }, deviceId);
    } catch {}
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/contacts', async (req: Request, res: Response) => {
  try {
    const deviceId = (req.query.deviceId as string) || 'scooter-001';
    const db = await getDatabase();
    const contacts = await db.query(
      'SELECT * FROM authorized_contacts WHERE device_id = ?',
      [deviceId]
    );
    res.json({
      contacts: contacts.map((c: any) => ({
        id: c.id,
        deviceId: c.device_id,
        name: c.name,
        phone: c.phone,
        notifySms: Boolean(c.notify_sms),
        notifyCall: Boolean(c.notify_call),
        notifyTelegram: Boolean(c.notify_telegram),
        telegramChatId: c.telegram_chat_id,
        createdAt: c.created_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/contacts', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const {
      deviceId = 'scooter-001',
      name,
      phone,
      notifySms = 1,
      notifyCall = 0,
      notifyTelegram = 1,
      telegramChatId = '',
    } = req.body;

    const db = await getDatabase();
    const id = `cnt-${Date.now()}`;
    await db.run(
      `INSERT INTO authorized_contacts (id, device_id, name, phone, notify_sms, notify_call, notify_telegram, telegram_chat_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        deviceId,
        name,
        phone,
        notifySms ? 1 : 0,
        notifyCall ? 1 : 0,
        notifyTelegram ? 1 : 0,
        telegramChatId,
      ]
    );

    res.status(201).json({
      success: true,
      contact: {
        id,
        deviceId,
        name,
        phone,
        notifySms: Boolean(notifySms),
        notifyCall: Boolean(notifyCall),
        notifyTelegram: Boolean(notifyTelegram),
        telegramChatId,
      },
    });

    try {
      broadcastEvent('contacts_updated', { deviceId }, deviceId);
    } catch {}
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/contacts/:id', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    const rows = await db.query('SELECT device_id FROM authorized_contacts WHERE id = ?', [id]);
    const deviceId = rows[0]?.device_id;
    await db.run('DELETE FROM authorized_contacts WHERE id = ?', [id]);
    res.json({ success: true, id });

    try {
      broadcastEvent('contacts_updated', { deviceId, id }, deviceId);
    } catch {}
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/alerts', async (req: Request, res: Response) => {
  try {
    const deviceId = (req.query.deviceId as string) || 'scooter-001';
    const db = await getDatabase();
    const alerts = await db.query(
      'SELECT * FROM alerts WHERE device_id = ? ORDER BY created_at DESC LIMIT 50',
      [deviceId]
    );
    res.json({
      alerts: alerts.map((a: any) => ({
        id: a.id,
        deviceId: a.device_id,
        type: a.type,
        message: a.message,
        latitude: a.latitude ? Number(a.latitude) : undefined,
        longitude: a.longitude ? Number(a.longitude) : undefined,
        resolved: Boolean(a.resolved),
        createdAt: a.created_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/alerts/resolve', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    const db = await getDatabase();
    const rows = await db.query('SELECT device_id FROM alerts WHERE id = ?', [id]);
    const deviceId = rows[0]?.device_id;
    await db.run('UPDATE alerts SET resolved = 1 WHERE id = ?', [id]);
    res.json({ success: true, id });

    try {
      broadcastEvent('alerts_updated', { deviceId, id }, deviceId);
    } catch {}
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 13. Simulation Helpers for Demo & Testing
// ----------------------------------------------------
apiRouter.post('/test/simulate-esp32-cycle', requireDashboardAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId = 'scooter-001', deltaLat = 0.0002, deltaLng = -0.0001, speed = 20.4, deviceKey = DEFAULT_DEVICE_SECRET_KEY } = req.body;
    const db = await getDatabase();

    // Verify authentication as the simulated ESP32
    const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
    if (!devices || devices.length === 0) {
      return res.status(403).json({
        ok: false,
        code: 'DEVICE_ID_MISMATCH',
        message: `Dispositivo '${deviceId}' não existe no banco de dados.`,
      });
    }

    const device = devices[0];
    if (device.status !== 'active') {
      return res.status(403).json({
        ok: false,
        code: 'DEVICE_DISABLED',
        message: `Dispositivo '${deviceId}' está desativado no servidor.`,
      });
    }

    if (!verifyDeviceKey(deviceKey, device.device_key_hash)) {
      return res.status(403).json({
        ok: false,
        code: 'DEVICE_ID_MISMATCH',
        message: 'Chave secreta incompatível para a scooter.',
      });
    }

    // 1. Fetch latest coordinates
    const lastList = await db.query(
      'SELECT * FROM telemetry WHERE device_id = ? ORDER BY created_at DESC LIMIT 1',
      [deviceId]
    );

    let baseLat = -23.55052;
    let baseLng = -46.63331;
    let currentBattery = 4.14;

    if (lastList.length > 0) {
      baseLat = Number(lastList[0].latitude);
      baseLng = Number(lastList[0].longitude);
      currentBattery = Number(lastList[0].battery_voltage || 4.14);
    }

    const newLat = Number((baseLat + deltaLat).toFixed(6));
    const newLng = Number((baseLng + deltaLng).toFixed(6));
    const newBat = Number(Math.max(3.4, currentBattery - 0.001).toFixed(3));
    const nowIso = new Date().toISOString();

    // Insert new telemetry
    const telId = `tel-sim-${Date.now()}`;
    await db.run(
      `INSERT INTO telemetry (
        id, device_id, latitude, longitude, speed_kmh, altitude_meters,
        course_degrees, satellites, hdop, battery_voltage, battery_percentage,
        signal_rssi, network_registered, is_on, theft_mode, gps_date_utc, gps_time_utc,
        timestamp, gps_date_time, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        telId,
        deviceId,
        newLat,
        newLng,
        speed,
        760.4,
        120,
        9,
        0.9,
        newBat,
        voltageToPercentage(newBat),
        24,
        1,
        1,
        0,
        nowIso.split('T')[0],
        nowIso.split('T')[1].slice(0, 8),
        nowIso,
        nowIso,
        nowIso,
      ]
    );

    await db.run(
      `UPDATE devices SET last_seen_at = ?, updated_at = ?, is_online = 1 WHERE device_id = ?`,
      [nowIso, nowIso, deviceId]
    );

    // 2. Check pending commands and execute / ack them
    const pendingCmds = await db.query(
      `SELECT * FROM commands WHERE device_id = ? AND status = 'pending'`,
      [deviceId]
    );

    const executedList = [];
    for (const cmd of pendingCmds) {
      const execMsg = `Executado com sucesso pelo ESP32: ${cmd.type}`;
      await db.run(
        `UPDATE commands SET status = 'executed', executed_at = ?, message = ? WHERE id = ?`,
        [nowIso, execMsg, cmd.id]
      );
      await db.run(
        `INSERT INTO command_acks (id, command_id, device_id, status, executed_at, message, created_at)
         VALUES (?, ?, ?, 'executed', ?, ?, ?)`,
        [`ack-${Date.now()}`, cmd.id, deviceId, nowIso, execMsg, nowIso]
      );
      executedList.push({ id: cmd.id, type: cmd.type, message: execMsg });
    }

    try {
      const telemetryPayload = {
        id: telId,
        deviceId,
        latitude: newLat,
        longitude: newLng,
        speedKmh: speed,
        altitudeMeters: 760.4,
        courseDegrees: 120,
        satellites: 9,
        hdop: 0.9,
        batteryVoltage: newBat,
        batteryPercentage: voltageToPercentage(newBat),
        signalRssi: 24,
        networkRegistered: true,
        isOn: true,
        theftMode: false,
        timestamp: nowIso,
        gpsDateTime: nowIso,
        createdAt: nowIso,
      };

      broadcastEvent('telemetry', {
        deviceId,
        telemetry: telemetryPayload,
        isOnline: true,
        lastSeenAt: nowIso,
      }, deviceId);

      broadcastEvent('scooter_update', {
        deviceId,
        telemetry: telemetryPayload,
        isOnline: true,
        lastSeenAt: nowIso,
      }, deviceId);
    } catch {}

    return res.json({
      success: true,
      telemetryCreated: true,
      newCoordinates: { latitude: newLat, longitude: newLng, speed },
      pendingCommandsExecuted: executedList,
      serverTime: nowIso,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 14. ESP32 Arduino Sketch Code Generator
// ----------------------------------------------------
apiRouter.get('/esp32/firmware', async (req: Request, res: Response) => {
  try {
    const host = req.get('host') || 'scooterlink.app';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const serverUrl = `${protocol}://${host}`;
    const deviceId = ((req.query.deviceId as string) || 'scooter-001').trim();
    const apn = (req.query.apn as string) || 'zap.vivo.com.br';

    const db = await getDatabase();
    const devices = await db.query('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
    const dev = devices && devices.length > 0 ? devices[0] : null;
    const key = (req.query.key as string) || (dev ? (dev.raw_device_key || DEFAULT_DEVICE_SECRET_KEY) : DEFAULT_DEVICE_SECRET_KEY);

    const sketch = generateEsp32Sketch(serverUrl, deviceId, key, apn);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(sketch);
  } catch (err: any) {
    res.status(500).send(`Erro ao gerar firmware: ${err.message}`);
  }
});

// ----------------------------------------------------
// 15. Centralized SQLite .DB Database Management & Download
// ----------------------------------------------------
apiRouter.get('/database/stats', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const stats = await db.getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Download the actual binary .db SQLite file
apiRouter.get('/database/download', requireDashboardAuth, (req: Request, res: Response) => {
  try {
    const dbFilePath = getDatabaseFilePath();
    if (!fs.existsSync(dbFilePath)) {
      return res.status(404).json({ error: 'Arquivo do banco de dados scooter_link.db ainda não foi criado.' });
    }

    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', 'attachment; filename="scooter_link.db"');

    const fileStream = fs.createReadStream(dbFilePath);
    fileStream.pipe(res);
  } catch (err: any) {
    console.error('Erro ao baixar arquivo .db:', err);
    res.status(500).json({ error: err.message });
  }
});

// Inspect table rows for Database Explorer UI
apiRouter.get('/database/tables/:tableName', async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    const allowedTables = new Set([
      'users',
      'devices',
      'device_identity_history',
      'telemetry',
      'commands',
      'command_acks',
      'alerts',
      'geofences',
      'authorized_contacts',
    ]);

    if (!allowedTables.has(tableName)) {
      return res.status(400).json({ error: `Tabela '${tableName}' não permitida ou inexistente.` });
    }

    const db = await getDatabase();
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const rows = await db.query(`SELECT * FROM ${tableName} ORDER BY rowid DESC LIMIT ${limit}`);

    // Mask device_key_hash when inspecting devices table in UI
    const sanitizedRows = rows.map((r: any) => {
      if (tableName === 'devices' && r.device_key_hash) {
        return {
          ...r,
          device_key_hash: `sha256:••••••••${r.device_key_hash.slice(-6)}`,
        };
      }
      return r;
    });

    res.json({
      table: tableName,
      count: sanitizedRows.length,
      rows: sanitizedRows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
