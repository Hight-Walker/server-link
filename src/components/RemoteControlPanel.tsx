import React, { useState, useEffect } from 'react';
import { Device, TelemetryData, ScooterCommand, CommandType } from '../types';
import {
  Power,
  Zap,
  Sun,
  Moon,
  ArrowLeft,
  ArrowRight,
  Volume2,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Radio,
  RefreshCw,
  Sliders,
  History,
} from 'lucide-react';
import { formatBrasiliaDateTime } from '../utils/dateFormatter';

interface RemoteControlPanelProps {
  device: Device | null;
  telemetry: TelemetryData | null;
  isOnline: boolean;
  onSendCommand: (type: CommandType, payload?: Record<string, any>) => Promise<ScooterCommand | null>;
  recentCommands: ScooterCommand[];
  pendingCommandsCount: number;
  onRefresh: () => void;
}

export const RemoteControlPanel: React.FC<RemoteControlPanelProps> = ({
  device,
  telemetry,
  isOnline,
  onSendCommand,
  recentCommands,
  pendingCommandsCount,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'controls' | 'history'>('controls');
  const [loadingCommand, setLoadingCommand] = useState<string | null>(null);
  const [commandFeedback, setCommandFeedback] = useState<{
    type: string;
    status: 'pending' | 'delivered' | 'executed' | 'error';
    msg: string;
  } | null>(null);

  // Auto-clear feedback after 6 seconds
  useEffect(() => {
    if (commandFeedback) {
      const timer = setTimeout(() => setCommandFeedback(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [commandFeedback]);

  const handleCommandClick = async (type: CommandType, payload: Record<string, any> = {}) => {
    setLoadingCommand(type);
    try {
      const cmd = await onSendCommand(type, payload);
      if (cmd) {
        setCommandFeedback({
          type,
          status: 'pending',
          msg: `Comando enviado. ESP32 executará em até 5s.`,
        });
      }
    } catch (err: any) {
      setCommandFeedback({
        type,
        status: 'error',
        msg: `Erro: ${err.message || 'Falha de conexão'}`,
      });
    } finally {
      setLoadingCommand(null);
    }
  };

  const isOn = Boolean(device?.isOn ?? telemetry?.isOn);
  const isHeadlightOn = Boolean(device?.headlight);
  const isTheftMode = Boolean(device?.theftMode ?? telemetry?.theftMode);

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 md:p-5 flex flex-col gap-4 shadow-xl">
      {/* Header with Title & Tabs */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Controle Remoto
            </h3>
            <p className="text-[11px] text-slate-400">Fila de comandos 2G / SIM800L</p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('controls')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'controls'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Comandos
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Histórico
            {recentCommands.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-slate-800 text-cyan-400 text-[10px] flex items-center justify-center font-mono">
                {recentCommands.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Latency Reminder Banner */}
      <div className="px-3.5 py-2 rounded-xl bg-slate-950 border border-cyan-500/20 text-[11px] text-slate-300 flex items-center gap-2">
        <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
        <span>
          <b>Tempo de resposta:</b> o ESP32 consulta comandos a cada <b>5 segundos</b>.
        </span>
      </div>

      {/* Immediate Command Feedback Pill */}
      {commandFeedback && (
        <div
          className={`px-3.5 py-2 rounded-xl text-xs flex items-center justify-between border transition-all animate-in fade-in ${
            commandFeedback.status === 'error'
              ? 'bg-red-500/15 border-red-500/40 text-red-300'
              : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {commandFeedback.status === 'pending' ? (
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            ) : commandFeedback.status === 'executed' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
            <span className="text-[11px] font-medium">{commandFeedback.msg}</span>
          </div>
          <button
            onClick={() => setCommandFeedback(null)}
            className="text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {activeTab === 'controls' ? (
        <div className="flex flex-col gap-3">
          {/* Main Power (Start / Stop) */}
          <div className="grid grid-cols-2 gap-3">
            <button
              id="btn-cmd-start"
              onClick={() => handleCommandClick('start')}
              disabled={loadingCommand === 'start'}
              className={`p-3.5 rounded-xl border font-bold text-xs flex flex-col items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-md ${
                isOn
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-800 hover:bg-slate-700/90 border-slate-700 text-slate-200 hover:border-emerald-500/40'
              }`}
            >
              <Zap className={`w-5 h-5 ${isOn ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
              <span>{loadingCommand === 'start' ? 'Enviando...' : 'Ligar Scooter'}</span>
            </button>

            <button
              id="btn-cmd-stop"
              onClick={() => handleCommandClick('stop')}
              disabled={loadingCommand === 'stop'}
              className="p-3.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700/90 text-slate-200 hover:border-red-500/40 font-bold text-xs flex flex-col items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-md"
            >
              <Power className="w-5 h-5 text-red-400" />
              <span>{loadingCommand === 'stop' ? 'Enviando...' : 'Desligar Scooter'}</span>
            </button>
          </div>

          {/* Headlights (Farol) */}
          <div className="grid grid-cols-2 gap-3">
            <button
              id="btn-cmd-headlight-on"
              onClick={() => handleCommandClick('headlight_on')}
              disabled={loadingCommand === 'headlight_on'}
              className={`p-3 rounded-xl border font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 ${
                isHeadlightOn
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              <Sun className="w-4 h-4 text-amber-400" />
              <span>Farol Ligado</span>
            </button>

            <button
              id="btn-cmd-headlight-off"
              onClick={() => handleCommandClick('headlight_off')}
              disabled={loadingCommand === 'headlight_off'}
              className="p-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <Moon className="w-4 h-4 text-slate-400" />
              <span>Farol Desligado</span>
            </button>
          </div>

          {/* Turn Signals (Setas) */}
          <div className="grid grid-cols-3 gap-2">
            <button
              id="btn-cmd-turn-left"
              onClick={() => handleCommandClick('turn_left_on')}
              disabled={loadingCommand === 'turn_left_on'}
              className="p-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:border-cyan-500/50 font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-400" />
              <span>Seta Esq.</span>
            </button>

            <button
              id="btn-cmd-turn-off"
              onClick={() => handleCommandClick('turn_off')}
              disabled={loadingCommand === 'turn_off'}
              className="p-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
            >
              <span className="text-sm font-bold">✕</span>
              <span>Desligar</span>
            </button>

            <button
              id="btn-cmd-turn-right"
              onClick={() => handleCommandClick('turn_right_on')}
              disabled={loadingCommand === 'turn_right_on'}
              className="p-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:border-cyan-500/50 font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
            >
              <ArrowRight className="w-4 h-4 text-cyan-400" />
              <span>Seta Dir.</span>
            </button>
          </div>

          {/* Horn & Theft Mode Toggle */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              id="btn-cmd-horn"
              onClick={() => handleCommandClick('horn')}
              disabled={loadingCommand === 'horn'}
              className="p-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:border-amber-500/50 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <Volume2 className="w-4 h-4 text-amber-400" />
              <span>Buzinar (Beep)</span>
            </button>

            <button
              id="btn-cmd-theft-toggle"
              onClick={() => handleCommandClick(isTheftMode ? 'theft_mode_off' : 'theft_mode_on')}
              disabled={loadingCommand?.startsWith('theft_mode')}
              className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 ${
                isTheftMode
                  ? 'bg-red-600/30 border-red-500 text-red-200 animate-pulse'
                  : 'bg-red-600/10 hover:bg-red-600/20 border-red-500/40 text-red-400'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>{isTheftMode ? 'Desativar Roubo' : 'Ativar Roubo'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* History & Queue Tab */
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
          <div className="flex justify-between items-center px-1 mb-1">
            <span className="text-[10px] font-bold uppercase text-slate-400">Últimos Comandos</span>
            <button
              onClick={onRefresh}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer font-medium"
            >
              <RefreshCw className="w-3 h-3" /> Atualizar
            </button>
          </div>

          {recentCommands.length === 0 ? (
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500">
              Nenhum comando enviado recentemente.
            </div>
          ) : (
            recentCommands.map((cmd) => (
              <div
                key={cmd.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-cyan-300">{cmd.type}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      cmd.status === 'executed'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : cmd.status === 'delivered'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : cmd.status === 'failed'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                    }`}
                  >
                    {cmd.status === 'executed'
                      ? '✅ Executado'
                      : cmd.status === 'delivered'
                      ? '📡 Entregue'
                      : cmd.status === 'failed'
                      ? '❌ Falha'
                      : '⏳ Pendente'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Criado: {formatBrasiliaDateTime(cmd.createdAt).split(' ')[1]}</span>
                  {cmd.executedAt && (
                    <span className="text-emerald-400">
                      Executado: {formatBrasiliaDateTime(cmd.executedAt).split(' ')[1]}
                    </span>
                  )}
                </div>

                {cmd.message && (
                  <p className="text-[10px] text-slate-300 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    {cmd.message}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
