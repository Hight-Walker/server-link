import React, { useState } from 'react';
import { AlertLog } from '../types';
import { formatBrasiliaDateTime } from '../utils/dateFormatter';
import { Bell, ShieldAlert, Check, AlertTriangle, BatteryCharging, X } from 'lucide-react';

interface AlertsBadgeProps {
  alerts: AlertLog[];
  onResolveAlert: (id: string) => Promise<void>;
}

export const AlertsBadge: React.FC<AlertsBadgeProps> = ({ alerts, onResolveAlert }) => {
  const [isOpen, setIsOpen] = useState(false);
  const unresolvedCount = alerts.filter((a) => !a.resolved).length;

  return (
    <div className="relative">
      <button
        id="btn-alerts-popover-toggle"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 rounded-xl glass-panel text-slate-300 hover:text-white transition-all active:scale-95 flex items-center justify-center"
        title="Histórico de Alertas e Notificações"
      >
        <Bell className="w-5 h-5" />
        {unresolvedCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white font-bold text-[10px] flex items-center justify-center animate-pulse border-2 border-[#060913]">
            {unresolvedCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id="alerts-popover-dropdown"
          className="absolute right-0 mt-3 w-80 md:w-96 rounded-2xl glass-panel-neon border border-emerald-500/30 p-4 shadow-2xl z-[550] animate-in fade-in zoom-in-95"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              Notificações e Alertas ({alerts.length})
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Nenhum alerta registrado. Sua bike está segura! 🟢
              </div>
            ) : (
              alerts.map((alt) => (
                <div
                  key={alt.id}
                  className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                    alt.type === 'THEFT_TRIGGERED'
                      ? 'bg-red-950/50 border-red-500/50 text-red-100'
                      : alt.type === 'GEOFENCE_EXIT'
                      ? 'bg-amber-950/40 border-amber-500/40 text-amber-100'
                      : 'bg-slate-900/70 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] uppercase flex items-center gap-1">
                      {alt.type === 'THEFT_TRIGGERED' ? '🚨 MODO ROUBO' : alt.type === 'GEOFENCE_EXIT' ? '⚠️ CERCA VIRTUAL' : 'ℹ️ NOTIFICAÇÃO'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatBrasiliaDateTime(alt.createdAt).split(' ')[1]}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-300">{alt.message}</p>
                  {!alt.resolved && (
                    <button
                      onClick={() => onResolveAlert(alt.id)}
                      className="mt-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      Marcar como ciente
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
