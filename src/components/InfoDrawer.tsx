import React from 'react';
import { TelemetryData } from '../types';
import {
  formatBrasiliaDateTime,
  getCompassDirection,
} from '../utils/dateFormatter';
import {
  Gauge,
  Compass,
  Mountain,
  Satellite,
  Clock,
  MapPin,
  Radio,
  Copy,
  ExternalLink,
  X,
  Activity,
  Navigation,
} from 'lucide-react';

interface InfoDrawerProps {
  telemetry: TelemetryData | null;
  isOpen: boolean;
  onClose: () => void;
  theftMode: boolean;
}

export const InfoDrawer: React.FC<InfoDrawerProps> = ({
  telemetry,
  isOpen,
  onClose,
  theftMode,
}) => {
  if (!isOpen) return null;

  const [copied, setCopied] = React.useState(false);

  const handleCopyCoords = () => {
    if (!telemetry) return;
    const text = `${telemetry.latitude.toFixed(6)}, ${telemetry.longitude.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openGoogleMaps = () => {
    if (!telemetry) return;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${telemetry.latitude},${telemetry.longitude}`,
      '_blank'
    );
  };

  // Signal quality text
  const getHdopStatus = (hdop: number) => {
    if (hdop <= 1.0) return { label: 'Alta precisão (Fix ideal)', color: 'text-emerald-400' };
    if (hdop <= 2.0) return { label: 'Boa', color: 'text-cyan-400' };
    if (hdop <= 5.0) return { label: 'Moderada', color: 'text-amber-400' };
    return { label: 'Baixa', color: 'text-red-400' };
  };

  const hdopInfo = telemetry ? getHdopStatus(telemetry.hdop) : { label: '--', color: 'text-slate-400' };

  return (
    <div
      id="telemetry-info-drawer"
      className="fixed inset-x-0 bottom-0 md:bottom-6 md:right-6 md:left-auto md:w-[400px] z-[900] max-h-[85vh] overflow-y-auto rounded-t-3xl md:rounded-2xl bg-slate-900/95 border border-slate-700/80 p-5 shadow-2xl backdrop-blur-xl transition-all animate-in slide-in-from-bottom duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2 uppercase">
              Telemetria GPS Detalhada
              {theftMode && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 font-bold animate-pulse">
                  Modo Roubo
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">ESP32 + NEO-6M + SIM800L</p>
          </div>
        </div>
        <button
          id="btn-close-info-drawer"
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Fechar painel de informações"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {!telemetry ? (
        <div className="py-12 text-center text-slate-400 text-sm">
          <Satellite className="w-8 h-8 text-cyan-500 mx-auto mb-2 animate-bounce" />
          <p>Aguardando primeiro pacote de telemetria do ESP32...</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3.5">
          {/* Main Hero Card: Speed & Dynamic Status */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <Gauge className="w-4 h-4 text-cyan-400" />
                Velocidade Atual
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-mono-digits">
                  {telemetry.speedKmh.toFixed(1)}
                </span>
                <span className="text-sm font-semibold text-cyan-400 font-mono">km/h</span>
              </div>
            </div>
            <div className="text-right">
              <span
                className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                  telemetry.speedKmh > 1
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}
              >
                {telemetry.speedKmh > 1 ? '⚡ Em Movimento' : '🛑 Parada'}
              </span>
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                Satélites: {telemetry.satellites}
              </p>
            </div>
          </div>

          {/* Precision and Signal Grid */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            {/* Heading / Direction */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold">Direção / Rumo</p>
                <p className="font-bold text-white">
                  {getCompassDirection(telemetry.courseDegrees)} ({telemetry.courseDegrees.toFixed(0)}°)
                </p>
              </div>
            </div>

            {/* Altitude */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                <Mountain className="w-4 h-4" />
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold">Altitude</p>
                <p className="font-bold text-white font-mono-digits">
                  {telemetry.altitudeMeters.toFixed(1)} m
                </p>
              </div>
            </div>

            {/* Satellites */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                <Satellite className="w-4 h-4" />
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold">Satélites Fixados</p>
                <p className="font-bold text-white font-mono-digits">
                  {telemetry.satellites} sats
                </p>
              </div>
            </div>

            {/* GSM Signal RSSI */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold">Sinal GSM SIM800L</p>
                <p className="font-bold text-emerald-400 font-mono-digits">
                  RSSI {telemetry.signalRssi || 22} / 31
                </p>
              </div>
            </div>
          </div>

          {/* Date and Time */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold">Horário de Brasília</p>
                <p className="font-bold text-white font-mono-digits">
                  {formatBrasiliaDateTime(telemetry.gpsDateTime || telemetry.createdAt)}
                </p>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
              Sincronizado
            </span>
          </div>

          {/* Geographic Coordinates & Google Maps */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                Coordenadas GPS (Lat / Long)
              </span>
              <span className={`text-[10px] font-mono ${hdopInfo.color}`}>
                HDOP: {telemetry.hdop.toFixed(2)}
              </span>
            </div>
            <div className="font-mono-digits text-sm text-white font-bold">
              {telemetry.latitude.toFixed(6)}, {telemetry.longitude.toFixed(6)}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                id="btn-copy-coords"
                onClick={handleCopyCoords}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                {copied ? 'Copiado!' : 'Copiar Coordenadas'}
              </button>
              <button
                id="btn-open-gmaps"
                onClick={openGoogleMaps}
                className="py-2 px-3.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                title="Abrir no Google Maps"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir Maps
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
