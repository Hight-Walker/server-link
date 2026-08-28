import React, { useState } from 'react';
import { TelemetryData } from '../types';
import {
  formatBrasiliaDateTime,
  formatDistance,
} from '../utils/dateFormatter';
import {
  History,
  Play,
  Pause,
  RotateCcw,
  Gauge,
  MapPin,
  Clock,
  Zap,
  X,
} from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyTrail: TelemetryData[];
  onSelectPoint?: (point: TelemetryData) => void;
}

export function calculateTotalDistanceKm(points: TelemetryData[]): number {
  if (!points || points.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const R = 6371e3;
    const φ1 = (p1.latitude * Math.PI) / 180;
    const φ2 = (p2.latitude * Math.PI) / 180;
    const Δφ = ((p2.latitude - p1.latitude) * Math.PI) / 180;
    const Δλ = ((p2.longitude - p1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalMeters += R * c;
  }
  return totalMeters / 1000;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  historyTrail,
  onSelectPoint,
}) => {
  if (!isOpen) return null;

  // Reverse chronological list for playback (oldest to newest)
  const sortedPoints = [...historyTrail].sort(
    (a, b) => new Date(a.createdAt || a.gpsDateTime).getTime() - new Date(b.createdAt || b.gpsDateTime).getTime()
  );

  const [currentIndex, setCurrentIndex] = useState(sortedPoints.length - 1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Playback loop
  React.useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= sortedPoints.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          const next = prev + 1;
          if (onSelectPoint && sortedPoints[next]) {
            onSelectPoint(sortedPoints[next]);
          }
          return next;
        });
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, sortedPoints.length, onSelectPoint]);

  const currentPoint = sortedPoints[currentIndex] || sortedPoints[0];
  const maxSpeed = Math.max(...sortedPoints.map((p) => p.speedKmh), 0);
  const avgSpeed =
    sortedPoints.length > 0
      ? sortedPoints.reduce((acc, p) => acc + p.speedKmh, 0) / sortedPoints.length
      : 0;
  const totalKm = calculateTotalDistanceKm(sortedPoints);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div
        id="history-modal-content"
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl glass-panel-neon border border-emerald-500/40 p-5 md:p-6 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Histórico de Trajetos</h2>
              <p className="text-xs text-slate-400">
                {sortedPoints.length} pontos de GPS gravados
              </p>
            </div>
          </div>
          <button
            id="btn-close-history-modal"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Scrollable */}
        <div className="my-4 space-y-5 overflow-y-auto pr-1">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <p className="text-[11px] text-slate-400">Distância Total</p>
              <p className="text-lg font-extrabold text-emerald-400 font-mono-digits">
                {totalKm.toFixed(2)} km
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <p className="text-[11px] text-slate-400">Velocidade Máx.</p>
              <p className="text-lg font-extrabold text-cyan-400 font-mono-digits">
                {maxSpeed.toFixed(1)} km/h
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <p className="text-[11px] text-slate-400">Velocidade Média</p>
              <p className="text-lg font-extrabold text-white font-mono-digits">
                {avgSpeed.toFixed(1)} km/h
              </p>
            </div>
          </div>

          {/* Interactive Player Controls */}
          {sortedPoints.length > 0 && currentPoint && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  {formatBrasiliaDateTime(currentPoint.gpsDateTime || currentPoint.createdAt)}
                </span>
                <span className="text-emerald-400 font-mono-digits font-bold">
                  {currentPoint.speedKmh.toFixed(1)} km/h | {currentPoint.altitudeMeters.toFixed(0)}m alt
                </span>
              </div>

              {/* Slider Scrubber */}
              <input
                id="history-time-scrubber"
                type="range"
                min={0}
                max={sortedPoints.length - 1}
                value={currentIndex}
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  setCurrentIndex(idx);
                  if (onSelectPoint && sortedPoints[idx]) {
                    onSelectPoint(sortedPoints[idx]);
                  }
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <button
                    id="btn-history-play-pause"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center transition-colors active:scale-95"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <button
                    id="btn-history-reset"
                    onClick={() => {
                      setCurrentIndex(0);
                      setIsPlaying(false);
                      if (onSelectPoint && sortedPoints[0]) {
                        onSelectPoint(sortedPoints[0]);
                      }
                    }}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors active:scale-95"
                    title="Reiniciar início do trajeto"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                {/* Playback speed buttons */}
                <div className="flex items-center gap-1 text-xs">
                  {[1, 2, 5].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                        playbackSpeed === speed
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Telemetry Point List */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Pontos Registrados
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {[...sortedPoints].reverse().slice(0, 15).map((pt, i) => (
                <div
                  key={pt.id || i}
                  onClick={() => {
                    const idx = sortedPoints.findIndex((p) => p.id === pt.id);
                    if (idx !== -1) {
                      setCurrentIndex(idx);
                      if (onSelectPoint) onSelectPoint(pt);
                    }
                  }}
                  className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-slate-800/80 flex items-center justify-between text-xs cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-mono-digits text-slate-300">
                      {pt.latitude.toFixed(5)}, {pt.longitude.toFixed(5)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 font-mono-digits">
                    <span>{pt.speedKmh.toFixed(1)} km/h</span>
                    <span>{formatBrasiliaDateTime(pt.gpsDateTime || pt.createdAt).split(' ')[1]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
