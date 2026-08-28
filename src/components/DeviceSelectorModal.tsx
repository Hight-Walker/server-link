import React, { useState, useEffect } from 'react';
import { Device } from '../types';
import {
  Radio,
  X,
  Search,
  Plus,
  Check,
  Edit3,
  Cpu,
  ShieldCheck,
  Clock,
  ArrowRight,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { formatBrasiliaDateTime } from '../utils/dateFormatter';
import { safeFetchJson } from '../utils/api';

interface DeviceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDeviceId: string;
  onSelectDeviceId: (deviceId: string) => void;
  onOpenIdentityModal?: () => void;
}

export const DeviceSelectorModal: React.FC<DeviceSelectorModalProps> = ({
  isOpen,
  onClose,
  activeDeviceId,
  onSelectDeviceId,
  onOpenIdentityModal,
}) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [customInput, setCustomInput] = useState(activeDeviceId);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchDevices = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const result = await safeFetchJson<{ devices: Device[] }>('/api/devices');
      if (result.ok && result.data) {
        setDevices(result.data.devices || []);
      } else {
        setDevices([]);
        setFeedback({
          type: 'error',
          text: `Não foi possível ler os dispositivos: ${result.error || 'erro desconhecido'}`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDevices();
      setCustomInput(activeDeviceId);
    }
  }, [isOpen, activeDeviceId]);

  const handleApplyCustomId = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customInput.trim();
    if (!clean) return;

    onSelectDeviceId(clean);
    setFeedback({
      type: 'success',
      text: `Rastreador alterado para "${clean}". O app agora monitora este ID.`,
    });
    setTimeout(() => {
      onClose();
    }, 900);
  };

  const handleRegisterNewDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = customInput.trim();
    if (!cleanId) return;

    setIsAdding(true);
    setFeedback(null);

    try {
      const result = await safeFetchJson<{ ok: boolean; error?: string; message?: string }>('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: cleanId,
          displayName: newDeviceName.trim() || cleanId,
          model: 'ESP32 + SIM800L + NEO-6M',
        }),
      });

      if (result.ok && result.data?.ok) {
        setFeedback({
          type: 'success',
          text: `Dispositivo "${cleanId}" cadastrado e ativado!`,
        });
        await fetchDevices();
        onSelectDeviceId(cleanId);
        setShowAddForm(false);
        setNewDeviceName('');
        setTimeout(() => {
          onClose();
        }, 900);
      } else {
        setFeedback({
          type: 'error',
          text: result.data?.error || result.data?.message || result.error || 'Falha ao cadastrar dispositivo.',
        });
      }
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Selecionar ESP32 Rastreado
              </h2>
              <p className="text-xs text-slate-400">
                Alterne ou digite o <b>deviceId</b> que o painel deve buscar e monitorar
              </p>
            </div>
          </div>
          <button
            id="btn-close-device-selector"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Quick Direct Edit Form */}
          <form onSubmit={handleApplyCustomId} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              ID do ESP em Rastreamento Ativo
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Radio className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Ex: scooter-001, tracker-02"
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
              <button
                type="submit"
                disabled={!customInput.trim() || customInput.trim() === activeDeviceId}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow"
              >
                Buscar Este ID
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              O painel consultará imediatamente telemetria, comandos e histórico deste identificador.
            </p>
          </form>

          {/* Feedback Message */}
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs font-mono flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/30 text-red-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Registered Devices List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Dispositivos no Banco ({devices.length})
              </span>
              <button
                onClick={fetchDevices}
                className="text-slate-400 hover:text-cyan-400 p-1 cursor-pointer flex items-center gap-1 text-[11px]"
                title="Recarregar lista"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            {devices.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                Nenhum dispositivo cadastrado ainda.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {devices.map((d) => {
                  const isSelected = d.deviceId === activeDeviceId;
                  return (
                    <div
                      key={d.id || d.deviceId}
                      onClick={() => {
                        onSelectDeviceId(d.deviceId);
                        setCustomInput(d.deviceId);
                        setFeedback({
                          type: 'success',
                          text: `Dispositivo "${d.deviceId}" selecionado!`,
                        });
                        setTimeout(() => onClose(), 600);
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm'
                          : 'bg-slate-950/80 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            isSelected
                              ? 'bg-cyan-500 text-slate-950 font-bold'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          <Cpu className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white text-xs">{d.deviceId}</span>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500 text-slate-950">
                                ATUAL
                              </span>
                            )}
                            <span
                              className={`w-2 h-2 rounded-full ${
                                d.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                              }`}
                            />
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>{d.displayName || d.model}</span>
                            {d.lastSeenAt && (
                              <span className="text-[10px] text-slate-500">
                                • Visto: {formatBrasiliaDateTime(d.lastSeenAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isSelected ? (
                          <Check className="w-5 h-5 text-cyan-400" />
                        ) : (
                          <span className="text-[11px] text-slate-400 group-hover:text-white flex items-center gap-1 font-semibold">
                            Selecionar <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add New Device Form Collapsible */}
          <div className="pt-2 border-t border-slate-800">
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Novo ESP32 no Banco</span>
              </button>
            ) : (
              <form onSubmit={handleRegisterNewDevice} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Cadastrar Novo Dispositivo</span>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="deviceId (ex: scooter-002)"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Nome amigável (opcional)"
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAdding || !customInput.trim()}
                  className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs transition-all cursor-pointer"
                >
                  {isAdding ? 'Salvando...' : 'Confirmar e Rastrear'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono">
            ID Ativo: <b className="text-cyan-400">{activeDeviceId}</b>
          </span>
          {onOpenIdentityModal && (
            <button
              onClick={() => {
                onClose();
                onOpenIdentityModal();
              }}
              className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer text-xs"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Gerenciar Chave & Firmware</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
