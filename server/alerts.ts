import { getDatabase } from './db.js';
import { broadcastEvent } from './events.js';

// Calculate Haversine distance in meters between two lat/lng points
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export interface TriggerAlertParams {
  deviceId: string;
  type: 'THEFT_TRIGGERED' | 'GEOFENCE_EXIT' | 'GEOFENCE_ENTER' | 'LOW_BATTERY' | 'TAMPER_DETECTED';
  message: string;
  latitude?: number;
  longitude?: number;
}

export async function triggerAlert(params: TriggerAlertParams) {
  const db = await getDatabase();
  const alertId = `alt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  console.log(`🚨 [ALERTA DISPARADO] [${params.type}] [${params.deviceId}]: ${params.message}`);

  // Save to DB
  await db.run(
    `INSERT INTO alerts (id, device_id, type, message, latitude, longitude, resolved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      alertId,
      params.deviceId,
      params.type,
      params.message,
      params.latitude ?? null,
      params.longitude ?? null,
      nowIso,
    ]
  );

  // Broadcast real-time alert event to all online clients
  try {
    broadcastEvent(
      'alert_created',
      {
        alert: {
          id: alertId,
          deviceId: params.deviceId,
          type: params.type,
          message: params.message,
          latitude: params.latitude ?? null,
          longitude: params.longitude ?? null,
          resolved: false,
          createdAt: nowIso,
        },
      },
      params.deviceId
    );
  } catch (e) {
    console.error('Error broadcasting alert SSE:', e);
  }

  // Fetch authorized contacts for this device
  const contacts = await db.query(
    `SELECT * FROM authorized_contacts WHERE device_id = ?`,
    [params.deviceId]
  );

  // Dispatch simulated/live SMS and Telegram notifications
  for (const contact of contacts) {
    if (contact.notify_sms || contact.notify_sms === 1) {
      console.log(
        `📱 [SMS SIM800L / GATEWAY] Enviando SMS para ${contact.name} (${contact.phone}): "${params.message}"`
      );
    }

    if (contact.notify_telegram || contact.notify_telegram === 1) {
      const tgToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = contact.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;

      if (tgToken && chatId) {
        try {
          const mapsLink =
            params.latitude && params.longitude
              ? `\n📍 Posição: https://maps.google.com/?q=${params.latitude},${params.longitude}`
              : '';
          const tgText = `🚨 *SCOOTER LINK - ALERTA CRÍTICO*\nDispositivo: *${params.deviceId}*\nTipo: *${params.type}*\n\n${params.message}${mapsLink}`;

          fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: tgText,
              parse_mode: 'Markdown',
            }),
          }).catch((err) => console.error('Telegram notification error:', err));
        } catch (e) {
          console.error('Error dispatching telegram alert', e);
        }
      } else {
        console.log(
          `✈️ [TELEGRAM DISPATCH] (Simulado) Alerta para ${contact.name} Telegram ID: ${contact.telegram_chat_id || 'Padrão'}`
        );
      }
    }
  }

  return { alertId, contactsNotified: contacts.length };
}

// Check Geofences on new GPS Telemetry
export async function checkGeofenceBreaches(
  deviceId: string,
  lat: number,
  lng: number
) {
  const db = await getDatabase();
  const geofences = await db.query(
    `SELECT * FROM geofences WHERE device_id = ? AND active = 1`,
    [deviceId]
  );

  for (const fence of geofences) {
    const dist = calculateDistanceMeters(lat, lng, fence.latitude, fence.longitude);
    const isOutside = dist > fence.radius_meters;

    if (isOutside && (fence.notify_on_exit === 1 || fence.notify_on_exit === true)) {
      await triggerAlert({
        deviceId,
        type: 'GEOFENCE_EXIT',
        message: `⚠️ Sua bike saiu da cerca virtual "${fence.name}"! Distância do centro: ${Math.round(dist)}m (Raio permitido: ${fence.radius_meters}m).`,
        latitude: lat,
        longitude: lng,
      });
    }
  }
}
