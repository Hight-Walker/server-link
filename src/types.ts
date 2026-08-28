export type CommandType =
  | 'start'
  | 'stop'
  | 'headlight_on'
  | 'headlight_off'
  | 'turn_left_on'
  | 'turn_right_on'
  | 'turn_off'
  | 'horn'
  | 'theft_mode_on'
  | 'theft_mode_off';

export type CommandStatus = 'pending' | 'delivered' | 'executed' | 'failed';

export interface ScooterCommand {
  id: string;
  deviceId: string;
  type: CommandType;
  payload?: Record<string, any>;
  status: CommandStatus;
  createdAt: string;
  deliveredAt?: string;
  executedAt?: string;
  message?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface Device {
  id: string;
  deviceId: string;
  displayName?: string;
  name?: string;
  status?: 'active' | 'disabled';
  token?: string;
  model: string;
  simNumber?: string;
  isOnline: boolean;
  isOn?: boolean;
  headlight?: boolean;
  turnSignal?: 'off' | 'left' | 'right';
  lastPing?: string;
  lastSeenAt?: string;
  theftMode: boolean;
  signalRssi?: number;
  networkRegistered?: boolean;
  firmwareVersion?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DeviceIdentityHistory {
  id: string;
  oldDeviceId: string;
  newDeviceId: string;
  changedAt: string;
  changedBy?: string;
}

export interface TelemetryData {
  id?: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  altitudeMeters: number;
  courseDegrees: number;
  satellites: number;
  hdop: number;
  batteryVoltage?: number;
  batteryPercentage?: number;
  signalRssi?: number;
  networkRegistered?: boolean;
  isOn?: boolean;
  theftMode: boolean;
  gpsDateTime: string; // ISO or Brasilia formatted string
  gpsDateUtc?: string;
  gpsTimeUtc?: string;
  timestamp?: string;
  createdAt?: string;
}

export interface Geofence {
  id: string;
  deviceId: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  active: boolean;
  notifyOnExit: boolean;
  notifyOnEntry: boolean;
  createdAt?: string;
}

export interface AuthorizedContact {
  id: string;
  deviceId: string;
  name: string;
  phone: string;
  notifySms: boolean;
  notifyCall: boolean;
  notifyTelegram: boolean;
  telegramChatId?: string;
  createdAt?: string;
}

export interface AlertLog {
  id: string;
  deviceId: string;
  type: 'THEFT_TRIGGERED' | 'GEOFENCE_EXIT' | 'GEOFENCE_ENTER' | 'LOW_BATTERY' | 'TAMPER_DETECTED' | 'GPS_LOST';
  message: string;
  latitude?: number;
  longitude?: number;
  resolved: boolean;
  createdAt: string;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

