import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Device,
  TelemetryData,
  Geofence,
  AuthorizedContact,
  AlertLog,
  UserLocation,
  ScooterCommand,
  CommandType,
} from './types';
import { BikeMap } from './components/BikeMap';
import { InfoDrawer } from './components/InfoDrawer';
import { TheftModal } from './components/TheftModal';
import { HistoryModal } from './components/HistoryModal';
import { GeofenceModal } from './components/GeofenceModal';
import { ContactsModal } from './components/ContactsModal';
import { Esp32ConfigModal } from './components/Esp32ConfigModal';
import { RemoteControlPanel } from './components/RemoteControlPanel';
import { LoginModal } from './components/LoginModal';
import { AlertsBadge } from './components/AlertsBadge';
import { DatabaseModal } from './components/DatabaseModal';
import { DeviceSelectorModal } from './components/DeviceSelectorModal';
import { ApiConfigModal } from './components/ApiConfigModal';
import { safeFetchJson } from './utils/api';
import {
  formatBrasiliaTimeOnly,
  formatBrasiliaDateTime,
  formatDistance,
  isMobileDevice,
  getCompassDirection,
} from './utils/dateFormatter';
import { calculateDistanceMeters } from './utils/geo';
import {
  ShieldAlert,
  Info,
  Locate,
  History,
  ShieldCheck,
  Users,
  Cpu,
  LogOut,
  Wifi,
  WifiOff,
  Radio,
  Satellite,
  Volume2,
  VolumeX,
  Zap,
  Power,
  RotateCw,
  Database,
  Download,
  Gauge,
  Compass,
  Mountain,
  Layers,
  MapPin,
  ExternalLink,
  Shield,
  Edit3,
  Server,
  X,
} from 'lucide-react';

export default function App() {
  // 1. Auth state
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('scooterlink_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  // Tracked ESP32 Device ID (stored in localStorage)
  const [activeDeviceId, setActiveDeviceId] = useState<string>(() => {
    return localStorage.getItem('scooterlink_active_device_id') || 'scooter-001';
  });

  // 2. Device, Telemetry, and Commands State
  const [device, setDevice] = useState<Device | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [isDeviceOnline, setIsDeviceOnline] = useState<boolean>(true);
  const [recentCommands, setRecentCommands] = useState<ScooterCommand[]>([]);
  const [pendingCommandsCount, setPendingCommandsCount] = useState<number>(0);
  const [historyTrail, setHistoryTrail] = useState<TelemetryData[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [contacts, setContacts] = useState<AuthorizedContact[]>([]);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [dbStatus, setDbStatus] = useState<{ database: string; status: string } | null>(null);

  // 3. User Geolocation state
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // 4. UI Modals state
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isTheftModalOpen, setIsTheftModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isGeofenceOpen, setIsGeofenceOpen] = useState(false);
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [isEsp32ModalOpen, setIsEsp32ModalOpen] = useState(false);
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);
  const [isDeviceSelectorOpen, setIsDeviceSelectorOpen] = useState(false);
  const [isApiConfigOpen, setIsApiConfigOpen] = useState(false);
  const [isRemoteControlMobileOpen, setIsRemoteControlMobileOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [dismissOfflineBanner, setDismissOfflineBanner] = useState(false);
  const [dismissGpsSearchingBanner, setDismissGpsSearchingBanner] = useState(false);

  // Active view tab for streamlined sidebar cockpit
  const [cockpitTab, setCockpitTab] = useState<'control' | 'telemetry' | 'safety'>('control');

  // Change or select tracked device ID
  const handleSelectDeviceId = useCallback((newId: string) => {
    const clean = newId.trim();
    if (!clean) return;
    setActiveDeviceId(clean);
    localStorage.setItem('scooterlink_active_device_id', clean);
  }, []);

  // Sound oscillator ref for siren effect in theft mode
  const audioContextRef = useRef<AudioContext | null>(null);

  const playEmergencySiren = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }, [soundEnabled]);

  // Fetch Complete Scooter Status & Recent Commands
  const fetchScooterStatus = useCallback(async () => {
    try {
      const result = await safeFetchJson(`/api/scooters/${activeDeviceId}`);
      if (!result.ok || !result.data) return;
      const data = result.data;
      if (data.telemetry) {
        setTelemetry(data.telemetry);
      }
      if (data.device) {
        setDevice(data.device);
      }
      setIsDeviceOnline(Boolean(data.isOnline));
      if (data.recentCommands) {
        setRecentCommands(data.recentCommands);
      }
      if (typeof data.pendingCommandsCount === 'number') {
        setPendingCommandsCount(data.pendingCommandsCount);
      }
    } catch (err) {
      // Handled safely
    }
  }, [activeDeviceId]);

  const fetchHistory = useCallback(async () => {
    try {
      const result = await safeFetchJson(`/api/scooters/${activeDeviceId}/telemetry/history?limit=100`);
      if (!result.ok || !result.data) return;
      if (result.data.history) {
        setHistoryTrail(result.data.history);
      }
    } catch (err) {}
  }, [activeDeviceId]);

  const fetchGeofences = useCallback(async () => {
    try {
      const result = await safeFetchJson(`/api/geofences?deviceId=${activeDeviceId}`);
      if (!result.ok || !result.data) return;
      if (result.data.geofences) {
        setGeofences(result.data.geofences);
      }
    } catch (err) {}
  }, [activeDeviceId]);

  const fetchContacts = useCallback(async () => {
    try {
      const result = await safeFetchJson(`/api/contacts?deviceId=${activeDeviceId}`);
      if (!result.ok || !result.data) return;
      if (result.data.contacts) {
        setContacts(result.data.contacts);
      }
    } catch (err) {}
  }, [activeDeviceId]);

  const fetchAlerts = useCallback(async () => {
    try {
      const result = await safeFetchJson(`/api/alerts?deviceId=${activeDeviceId}`);
      if (!result.ok || !result.data) return;
      if (result.data.alerts) {
        setAlerts(result.data.alerts);
      }
    } catch (err) {}
  }, [activeDeviceId]);

  const fetchDbStatus = useCallback(async () => {
    try {
      const result = await safeFetchJson('/api/status');
      if (result.ok && result.data) {
        setDbStatus(result.data);
      }
    } catch {}
  }, []);

  // Poll status every 4 seconds
  useEffect(() => {
    fetchScooterStatus();
    fetchHistory();
    fetchGeofences();
    fetchContacts();
    fetchAlerts();
    fetchDbStatus();

    const interval = setInterval(() => {
      fetchScooterStatus();
      fetchAlerts();
      fetchDbStatus();
    }, 4000);

    return () => clearInterval(interval);
  }, [fetchScooterStatus, fetchHistory, fetchGeofences, fetchContacts, fetchAlerts, fetchDbStatus]);

  // Request Browser Geolocation
  const handleRequestUserLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocalização não é suportada pelo seu navegador.');
      return;
    }

    setIsLocatingUser(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingUser(false);
        setUserLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        setIsLocatingUser(false);
        console.warn('Geolocation error:', err);
        setGeoError(
          err.code === 1
            ? 'Permissão de localização negada.'
            : 'Não foi possível obter a sua localização GPS.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Send Remote Command
  const handleSendCommand = async (type: CommandType, payload: Record<string, any> = {}) => {
    try {
      const res = await fetch(`/api/scooters/${activeDeviceId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      fetchScooterStatus();
      return data.command;
    } catch (err: any) {
      console.error('Error sending command:', err);
      throw err;
    }
  };

  // Toggle Theft Mode (Antifurto)
  const handleToggleTheftMode = async (enable: boolean) => {
    try {
      await handleSendCommand(enable ? 'theft_mode_on' : 'theft_mode_off');
      if (enable) {
        playEmergencySiren();
      }
    } catch (err) {
      console.error('Error toggling theft mode:', err);
    }
  };

  // Resolve Alert
  const handleResolveAlert = async (alertId: string) => {
    try {
      await fetch(`/api/alerts/${alertId}/resolve`, { method: 'PATCH' });
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      console.error('Error resolving alert:', err);
    }
  };

  // Calculate distance between user and scooter
  const distanceToUser =
    userLocation && telemetry
      ? calculateDistanceMeters(
          userLocation.latitude,
          userLocation.longitude,
          telemetry.latitude,
          telemetry.longitude
        )
      : null;

  const isTheftActive = Boolean(device?.theftMode ?? telemetry?.theftMode);
  const isGpsSearching = telemetry && telemetry.satellites < 4;

  // Render Login Modal if no user
  if (!user) {
    return (
      <LoginModal
        onLoginSuccess={(loggedUser) => {
          setUser(loggedUser);
          localStorage.setItem('scooterlink_user', JSON.stringify(loggedUser));
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 select-none">
      {/* 1. Theft Mode Urgent Emergency Banner */}
      {isTheftActive && (
        <div
          id="banner-theft-active"
          className="bg-red-600 px-4 py-2 text-white font-black text-xs md:text-sm uppercase tracking-wider flex items-center justify-between z-50 shrink-0 shadow-lg animate-pulse"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 animate-bounce" />
            <span>🚨 ALERTA DE MODO ROUBO ATIVADO — RASTREAMENTO GPS CONTÍNUO (1s)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1 rounded bg-red-700 hover:bg-red-800 text-white transition-colors cursor-pointer"
              title={soundEnabled ? 'Silenciar Sirene' : 'Ativar Som da Sirene'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setIsTheftModalOpen(true)}
              className="py-1 px-3 bg-white text-red-600 rounded font-bold text-xs hover:bg-slate-100 transition-colors shadow cursor-pointer"
            >
              Ações de Emergência
            </button>
          </div>
        </div>
      )}

      {/* 2. Top Navigation Bar */}
      <header className="px-4 md:px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-20 shrink-0">
        {/* Brand & Vehicle Status */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-500 flex items-center justify-center shadow-md">
            <span className="text-slate-950 font-black text-sm">SL</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                Scooter <span className="text-cyan-400">Link</span>
              </h1>
              {/* Editable Tracked ESP32 ID Button */}
              <button
                id="btn-edit-tracked-device"
                onClick={() => setIsDeviceSelectorOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500/50 transition-all font-mono text-xs cursor-pointer group shadow-sm"
                title="Clique para editar ou trocar o ID do ESP32 que está sendo buscado"
              >
                <Radio className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
                <span className="font-bold">{activeDeviceId}</span>
                <span className="text-[10px] text-slate-400 group-hover:text-cyan-300 flex items-center gap-0.5 ml-0.5 border-l border-slate-700 pl-1.5">
                  <Edit3 className="w-3 h-3" />
                  <span className="hidden sm:inline">Editar</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Status Indicators & Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Online / Offline status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${
              !isDeviceOnline
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                !isDeviceOnline ? 'bg-red-500' : 'bg-emerald-400 animate-pulse'
              }`}
            />
            <span>{isDeviceOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* API Configuration Modal Button */}
          <button
            id="btn-open-api-config-modal"
            onClick={() => setIsApiConfigOpen(true)}
            className="py-1.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 hover:border-emerald-500/40 shadow-sm"
            title="Página Administrativa: Configuração da API & Ingestão ESP32"
          >
            <Server className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Configuração da API</span>
          </button>

          {/* Database Modal Button */}
          <button
            id="btn-open-database-modal"
            onClick={() => setIsDatabaseModalOpen(true)}
            className="py-1.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700"
            title="Gerenciador do Banco de Dados"
          >
            <Database className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Banco .DB</span>
          </button>

          {/* Show My Location Button */}
          <button
            id="btn-request-my-location"
            onClick={handleRequestUserLocation}
            className={`py-1.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer border ${
              userLocation
                ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            } ${isLocatingUser ? 'animate-pulse' : ''}`}
            title="Localizar meu aparelho"
          >
            <Locate className="w-4 h-4" />
            <span className="hidden md:inline">Meu Local</span>
          </button>

          {/* Theft Mode Trigger (Roubo) */}
          <button
            id="btn-theft-mode-trigger"
            onClick={() => setIsTheftModalOpen(true)}
            className={`py-1.5 px-3.5 rounded-xl font-extrabold text-xs tracking-wider transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-md ${
              isTheftActive
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>ROUBO</span>
          </button>

          {/* Alerts Notification Bell */}
          <AlertsBadge alerts={alerts} onResolveAlert={handleResolveAlert} />

          {/* Logout */}
          <button
            id="btn-logout"
            onClick={() => {
              fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
              localStorage.removeItem('scooterlink_user');
              setUser(null);
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors cursor-pointer border border-slate-700"
            title="Sair do Scooter Link"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 3. Warnings Bar (GPS Searching / Offline) */}
      {isGpsSearching && !dismissGpsSearchingBanner && (
        <div
          id="status-gps-searching-banner"
          className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 text-xs text-amber-300 flex items-center justify-between z-10 animate-pulse"
        >
          <div className="flex items-center gap-2 mx-auto">
            <Satellite className="w-4 h-4 text-amber-400 shrink-0" />
            <span>⚠️ GPS NEO-6M buscando satélites... Exibindo última posição registrada.</span>
          </div>
          <button
            onClick={() => setDismissGpsSearchingBanner(true)}
            className="p-1 text-amber-400 hover:text-white rounded transition"
            title="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!isDeviceOnline && !dismissOfflineBanner && (
        <div
          id="status-device-offline-banner"
          className="bg-slate-900 border-b border-red-500/30 px-4 py-1.5 text-xs text-red-300 flex items-center justify-between z-10"
        >
          <div className="flex items-center gap-2 mx-auto">
            <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              📡 Scooter offline — última telemetria às{' '}
              {telemetry?.gpsDateTime ? formatBrasiliaTimeOnly(telemetry.gpsDateTime) : '--:--:--'}.
            </span>
          </div>
          <button
            id="btn-close-offline-banner"
            onClick={() => setDismissOfflineBanner(true)}
            className="p-1 text-red-400 hover:text-white rounded transition"
            title="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4. Main Clean Cockpit Layout (Clean Grid) */}
      <main className="relative flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden p-3 md:p-4 gap-4">
        {/* Left / Center Map Section (8 cols on large screens) */}
        <div className="lg:col-span-8 relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-xl flex flex-col h-full">
          <div className="relative flex-1 w-full h-full">
            <BikeMap
              telemetry={telemetry}
              historyTrail={historyTrail}
              userLocation={userLocation}
              geofences={geofences}
              theftMode={isTheftActive}
              isOnline={isDeviceOnline}
              distanceToUserMeters={distanceToUser}
              onRequestUserLocation={handleRequestUserLocation}
              isLocatingUser={isLocatingUser}
            />

            {/* Overlaid Floating Status Pill (Top Left of Map) */}
            {telemetry && (
              <div className="absolute top-4 left-4 z-[400] hidden sm:flex items-center gap-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 shadow-lg backdrop-blur-md">
                <div className="flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-cyan-400" />
                  <span className="text-base font-bold font-mono text-white">
                    {telemetry.speedKmh.toFixed(1)} <span className="text-[10px] text-cyan-400">km/h</span>
                  </span>
                </div>
                <div className="w-px h-4 bg-slate-700" />
                <div className="flex items-center gap-1 text-xs text-slate-300">
                  <Satellite className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-mono">{telemetry.satellites} sats</span>
                </div>
                <div className="w-px h-4 bg-slate-700" />
                <div className="flex items-center gap-1 text-xs text-slate-300">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-mono">RSSI {telemetry.signalRssi || 22}</span>
                </div>
              </div>
            )}
          </div>

          {/* Telemetry Info Drawer (Opens on demand) */}
          <InfoDrawer
            telemetry={telemetry}
            isOpen={isInfoOpen}
            onClose={() => setIsInfoOpen(false)}
            theftMode={isTheftActive}
          />
        </div>

        {/* Right Sidebar Section (4 cols on large screens) */}
        <div className="hidden lg:flex lg:col-span-4 flex-col gap-3 overflow-y-auto pr-1">
          {/* Active Tracked ESP32 Card */}
          <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <Radio className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-bold text-slate-400">Rastreando Dispositivo</div>
                <div className="font-mono text-xs font-bold text-white flex items-center gap-1.5 truncate">
                  <span className="truncate">{activeDeviceId}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isDeviceOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
                    }`}
                  />
                </div>
              </div>
            </div>
            <button
              id="btn-sidebar-edit-device"
              onClick={() => setIsDeviceSelectorOpen(true)}
              className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 text-xs font-bold border border-slate-700 hover:border-cyan-500/40 transition-all flex items-center gap-1 cursor-pointer shrink-0"
              title="Trocar ou registrar ID do ESP32"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Trocar ID</span>
            </button>
          </div>

          {/* Cockpit Navigation Tabs (Categorized & Intuitive) */}
          <div className="grid grid-cols-3 p-1 bg-slate-900 rounded-2xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setCockpitTab('control')}
              className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                cockpitTab === 'control'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Controles
            </button>
            <button
              onClick={() => setCockpitTab('telemetry')}
              className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                cockpitTab === 'telemetry'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              Telemetria
            </button>
            <button
              onClick={() => setCockpitTab('safety')}
              className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                cockpitTab === 'safety'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Segurança
            </button>
          </div>

          {/* TAB 1: REMOTE CONTROLS */}
          {cockpitTab === 'control' && (
            <RemoteControlPanel
              device={device}
              telemetry={telemetry}
              isOnline={isDeviceOnline}
              onSendCommand={handleSendCommand}
              recentCommands={recentCommands}
              pendingCommandsCount={pendingCommandsCount}
              onRefresh={fetchScooterStatus}
            />
          )}

          {/* TAB 2: TELEMETRY SUMMARY */}
          {cockpitTab === 'telemetry' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3.5 shadow-xl">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Dados ao Vivo</h3>
                </div>
                <span className="text-[10px] font-mono text-cyan-400">ESP32 + NEO-6M</span>
              </div>

              {telemetry ? (
                <div className="space-y-3">
                  {/* Speed Card */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Velocidade</p>
                      <p className="text-2xl font-mono font-black text-white">
                        {telemetry.speedKmh.toFixed(1)}{' '}
                        <span className="text-xs font-normal text-cyan-400">km/h</span>
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        telemetry.speedKmh > 1
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {telemetry.speedKmh > 1 ? 'Em movimento' : 'Parada'}
                    </span>
                  </div>

                  {/* Grid Metrics */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Direção</p>
                      <p className="font-bold text-white mt-0.5">
                        {getCompassDirection(telemetry.courseDegrees)} ({telemetry.courseDegrees.toFixed(0)}°)
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Altitude</p>
                      <p className="font-bold text-white font-mono mt-0.5">
                        {telemetry.altitudeMeters.toFixed(1)} m
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Satélites Fixados</p>
                      <p className="font-bold text-cyan-400 font-mono mt-0.5">
                        {telemetry.satellites} satélites
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Sinal GSM (RSSI)</p>
                      <p className="font-bold text-emerald-400 font-mono mt-0.5">
                        {telemetry.signalRssi || 22} / 31
                      </p>
                    </div>
                  </div>

                  {/* Horário & Coordenadas */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Horário de Brasília</p>
                    <p className="font-mono text-white font-bold">
                      {telemetry?.gpsDateTime ? formatBrasiliaDateTime(telemetry.gpsDateTime) : '--:--:--'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Coordenadas GPS</p>
                    <p className="font-mono text-cyan-300 font-bold">
                      {telemetry.latitude.toFixed(6)}, {telemetry.longitude.toFixed(6)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-500">
                  Aguardando primeiro pacote de dados da scooter...
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SAFETY & HARDWARE CONFIG */}
          {cockpitTab === 'safety' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-800">
                Módulos de Segurança
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Cerca Virtual */}
                <button
                  id="card-btn-geofence"
                  onClick={() => setIsGeofenceOpen(true)}
                  className="p-3 flex flex-col gap-1 bg-slate-950 border border-slate-800 rounded-xl hover:border-cyan-500/50 hover:bg-slate-800 transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    <span className="text-[10px] font-mono text-cyan-400">
                      {geofences.filter((g) => g.active).length} Ativas
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-white">Cerca Virtual</span>
                </button>

                {/* Histórico */}
                <button
                  id="card-btn-history"
                  onClick={() => setIsHistoryOpen(true)}
                  className="p-3 flex flex-col gap-1 bg-slate-950 border border-slate-800 rounded-xl hover:border-cyan-500/50 hover:bg-slate-800 transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between">
                    <History className="w-4 h-4 text-cyan-400" />
                    <span className="text-[10px] font-mono text-slate-400">{historyTrail.length} pts</span>
                  </div>
                  <span className="text-xs font-semibold text-white">Histórico</span>
                </button>

                {/* Contatos SOS */}
                <button
                  id="card-btn-contacts"
                  onClick={() => setIsContactsOpen(true)}
                  className="p-3 flex flex-col gap-1 bg-slate-950 border border-slate-800 rounded-xl hover:border-cyan-500/50 hover:bg-slate-800 transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <span className="text-[10px] font-mono text-slate-400">{contacts.length} Contatos</span>
                  </div>
                  <span className="text-xs font-semibold text-white">Contatos SOS</span>
                </button>

                {/* ESP32 & SIM800L */}
                <button
                  id="card-btn-esp32"
                  onClick={() => setIsEsp32ModalOpen(true)}
                  className="p-3 flex flex-col gap-1 bg-slate-950 border border-slate-800 rounded-xl hover:border-cyan-500/50 hover:bg-slate-800 transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <span className="text-[10px] font-mono text-emerald-400">Firmware</span>
                  </div>
                  <span className="text-xs font-semibold text-white">ESP32 & 2G</span>
                </button>
              </div>

              {/* Database quick bar */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs mt-1">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <div>
                    <p className="font-bold text-white text-[11px]">Banco SQLite</p>
                    <p className="text-[10px] text-slate-400">scooter_link.db</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsDatabaseModalOpen(true)}
                    className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold border border-slate-700 cursor-pointer"
                  >
                    Ver Tabelas
                  </button>
                  <a
                    href="/api/database/download"
                    download="scooter_link.db"
                    className="py-1 px-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    .db
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 5. Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden h-16 px-4 bg-slate-900 border-t border-slate-800 flex items-center justify-around z-20 shrink-0">
        <button
          id="nav-btn-remote"
          onClick={() => setIsRemoteControlMobileOpen(!isRemoteControlMobileOpen)}
          className={`flex flex-col items-center gap-1 transition-colors cursor-pointer active:scale-95 ${
            isRemoteControlMobileOpen ? 'text-cyan-400' : 'text-slate-400 hover:text-cyan-400'
          }`}
        >
          <Zap className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Controles</span>
        </button>

        <button
          id="nav-btn-info"
          onClick={() => setIsInfoOpen(!isInfoOpen)}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer active:scale-95"
        >
          <Info className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Telemetria</span>
        </button>

        {/* Center Bike button */}
        <div className="flex flex-col items-center -mt-5">
          <button
            id="nav-btn-center-bike"
            onClick={() => {
              const btn = document.getElementById('btn-center-bike');
              if (btn) btn.click();
            }}
            className="w-12 h-12 rounded-2xl bg-cyan-500 text-slate-950 font-bold flex items-center justify-center text-xl shadow-lg active:scale-90 transition-transform cursor-pointer border-2 border-slate-900"
            title="Localizar Scooter"
          >
            🏍️
          </button>
        </div>

        <button
          id="nav-btn-geofence"
          onClick={() => setIsGeofenceOpen(true)}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer active:scale-95"
        >
          <ShieldCheck className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Cerca</span>
        </button>

        <button
          id="nav-btn-api-config"
          onClick={() => setIsApiConfigOpen(true)}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer active:scale-95"
        >
          <Server className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Config API</span>
        </button>

        <button
          id="nav-btn-database"
          onClick={() => setIsDatabaseModalOpen(true)}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer active:scale-95"
        >
          <Database className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Banco .DB</span>
        </button>
      </nav>

      {/* 6. Mobile Remote Control Slide-over Panel */}
      {isRemoteControlMobileOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm lg:hidden flex flex-col justify-end p-3 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <h3 className="font-bold text-white text-sm">Controle Remoto 2G</h3>
              <button
                onClick={() => setIsRemoteControlMobileOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <RemoteControlPanel
              device={device}
              telemetry={telemetry}
              isOnline={isDeviceOnline}
              onSendCommand={handleSendCommand}
              recentCommands={recentCommands}
              pendingCommandsCount={pendingCommandsCount}
              onRefresh={fetchScooterStatus}
            />
          </div>
        </div>
      )}

      {/* 7. Floating Modals */}
      <TheftModal
        isOpen={isTheftModalOpen}
        onClose={() => setIsTheftModalOpen(false)}
        theftMode={isTheftActive}
        onToggleTheftMode={handleToggleTheftMode}
        telemetry={telemetry}
      />

      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        historyTrail={historyTrail}
        onClearHistory={async () => {
          await fetch(`/api/scooters/${activeDeviceId}/telemetry/history`, { method: 'DELETE' });
          setHistoryTrail([]);
        }}
      />

      <GeofenceModal
        isOpen={isGeofenceOpen}
        onClose={() => setIsGeofenceOpen(false)}
        geofences={geofences}
        deviceId={activeDeviceId}
        onRefreshGeofences={fetchGeofences}
        currentLocation={telemetry ? { latitude: telemetry.latitude, longitude: telemetry.longitude } : undefined}
      />

      <ContactsModal
        isOpen={isContactsOpen}
        onClose={() => setIsContactsOpen(false)}
        contacts={contacts}
        deviceId={activeDeviceId}
        onRefreshContacts={fetchContacts}
      />

      <Esp32ConfigModal
        isOpen={isEsp32ModalOpen}
        onClose={() => setIsEsp32ModalOpen(false)}
        device={device}
        telemetry={telemetry}
        onSimulatePing={async ({ speed, deltaLat, deltaLng }) => {
          await fetch('/api/test/simulate-esp32-cycle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: activeDeviceId, speed, deltaLat, deltaLng }),
          });
          fetchScooterStatus();
        }}
        dbStatus={dbStatus}
        onSelectDeviceId={handleSelectDeviceId}
      />

      <DeviceSelectorModal
        isOpen={isDeviceSelectorOpen}
        onClose={() => setIsDeviceSelectorOpen(false)}
        activeDeviceId={activeDeviceId}
        onSelectDeviceId={handleSelectDeviceId}
        onOpenIdentityModal={() => setIsEsp32ModalOpen(true)}
      />

      <DatabaseModal
        isOpen={isDatabaseModalOpen}
        onClose={() => setIsDatabaseModalOpen(false)}
      />

      <ApiConfigModal
        isOpen={isApiConfigOpen}
        onClose={() => setIsApiConfigOpen(false)}
        activeDeviceId={activeDeviceId}
        onSelectDeviceId={handleSelectDeviceId}
        isAdminAuthenticated={user?.role === 'admin'}
      />
    </div>
  );
}
