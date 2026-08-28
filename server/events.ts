import { Response } from 'express';

export interface SSEClient {
  id: string;
  res: Response;
  deviceId?: string;
  connectedAt: string;
}

const clients = new Set<SSEClient>();

export function addSSEClient(client: SSEClient): void {
  clients.add(client);
  console.log(`📡 [SSE] Novo cliente conectado: ${client.id} (Dispositivo: ${client.deviceId || 'todos'}) - Total ativos: ${clients.size}`);
}

export function removeSSEClient(client: SSEClient): void {
  clients.delete(client);
  console.log(`🔌 [SSE] Cliente desconectado: ${client.id} - Restantes: ${clients.size}`);
}

export function getConnectedClientsCount(): number {
  return clients.size;
}

export function broadcastEvent(eventName: string, data: any, targetDeviceId?: string): void {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of Array.from(clients)) {
    try {
      // If targetDeviceId is defined and client filtered for a specific device, match them; otherwise broadcast
      if (!targetDeviceId || !client.deviceId || client.deviceId === targetDeviceId) {
        client.res.write(payload);
      }
    } catch (e) {
      clients.delete(client);
    }
  }
}
