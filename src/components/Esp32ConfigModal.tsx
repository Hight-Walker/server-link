import React, { useState, useEffect } from 'react';
import { Device, TelemetryData, DeviceIdentityHistory } from '../types';
import {
  Cpu,
  Code,
  Radio,
  Copy,
  Check,
  Send,
  Sliders,
  Sparkles,
  Server,
  X,
  RefreshCw,
  Key,
  ShieldCheck,
  Zap,
  Download,
  Fingerprint,
  History,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';
import { formatBrasiliaDateTime } from '../utils/dateFormatter';

interface Esp32ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device | null;
  telemetry: TelemetryData | null;
  onSimulatePing: (options: { speed: number; deltaLat: number; deltaLng: number }) => Promise<void>;
  dbStatus: { database: string; status: string } | null;
  onSelectDeviceId?: (deviceId: string) => void;
}

export const Esp32ConfigModal: React.FC<Esp32ConfigModalProps> = ({
  isOpen,
  onClose,
  device,
  telemetry,
  onSimulatePing,
  dbStatus,
  onSelectDeviceId,
}) => {
  if (!isOpen) return null;

  const currentDeviceId = device?.deviceId || 'scooter-001';
  const [tab, setTab] = useState<'simulator' | 'identity' | 'firmware'>('simulator');
  const [sketchCode, setSketchCode] = useState<string>('Carregando código C++...');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(24);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);

  // Identity change state
  const [newIdInput, setNewIdInput] = useState<string>('');
  const [isUpdatingIdentity, setIsUpdatingIdentity] = useState(false);
  const [identityMessage, setIdentityMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [historyList, setHistoryList] = useState<DeviceIdentityHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deviceKey, setDeviceKey] = useState<string>('scooter_secret_key_001');
  const [isKeyRevealed, setIsKeyRevealed] = useState(false);

  // Fetch API Info / Key for device
  useEffect(() => {
    if (isOpen && currentDeviceId) {
      fetch(`/api/devices/${encodeURIComponent(currentDeviceId)}/api-info`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.deviceKey) {
            setDeviceKey(data.deviceKey);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, currentDeviceId]);

  // Fetch generated ESP32 sketch
  useEffect(() => {
    fetch(`/api/esp32/firmware?deviceId=${currentDeviceId}`)
      .then((res) => res.text())
      .then((code) => setSketchCode(code))
      .catch((err) => console.error(err));
  }, [currentDeviceId]);

  // Fetch audit history on identity tab
  const fetchAuditHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/scooters/${currentDeviceId}/identity/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data.history || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (tab === 'identity') {
      fetchAuditHistory();
    }
  }, [tab, currentDeviceId]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(sketchCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText('TROCAR_POR_CHAVE_SECRETA');
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleUpdateIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdInput.trim()) return;

    setIsUpdatingIdentity(true);
    setIdentityMessage(null);

    try {
      const res = await fetch(`/api/scooters/${currentDeviceId}/identity`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newDeviceId: newIdInput.trim(),
          changedBy: 'Admin (Painel Web)',
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setIdentityMessage({
          type: 'success',
          text: `Identificador alterado com sucesso para "${data.newDeviceId}". Registrado na auditoria.`,
        });
        if (onSelectDeviceId) {
          onSelectDeviceId(data.newDeviceId);
        }
        setNewIdInput('');
        fetchAuditHistory();
      } else {
        setIdentityMessage({
          type: 'error',
          text: data.message || 'Falha ao alterar identificador.',
        });
      }
    } catch (err: any) {
      setIdentityMessage({
        type: 'error',
        text: `Erro de conexão: ${err.message}`,
      });
    } finally {
      setIsUpdatingIdentity(false);
    }
  };

  const handleTriggerSimCycle = async () => {
    setIsSimulating(true);
    setSimResult(null);
    try {
      const res = await fetch('/api/test/simulate-esp32-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: currentDeviceId,
          speed: simSpeed,
          deltaLat: (Math.random() - 0.45) * 0.0006,
          deltaLng: (Math.random() - 0.45) * 0.0006,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const execCount = data.pendingCommandsExecuted?.length || 0;
        setSimResult(
          `✅ Ciclo concluído: Telemetria autenticada com sucesso no backend e ${execCount} comando(s) pendente(s) executado(s) pelo ESP32.`
        );
      } else {
        const data = await res.json();
        setSimResult(`❌ Rejeitado pelo backend: ${data.message || data.error || 'Autenticação falhou'}`);
      }
    } catch (e: any) {
      console.error(e);
      setSimResult(`❌ Erro no ciclo de simulação: ${e.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div
        id="esp32-config-modal-content"
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl glass-panel-neon border border-cyan-500/40 p-5 md:p-6 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Hardware ESP32 & Segurança</h2>
              <p className="text-xs text-slate-400">
                Autenticação Segura via Chave Secreta // Polling a cada 5s // Identificador Seguro
              </p>
            </div>
          </div>
          <button
            id="btn-close-esp32-modal"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 py-2.5 shrink-0 text-xs font-semibold">
          <button
            id="tab-btn-simulator"
            onClick={() => setTab('simulator')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              tab === 'simulator'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Simulador de Ciclo ESP32 (5s)
          </button>
          <button
            id="tab-btn-identity"
            onClick={() => setTab('identity')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              tab === 'identity'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" />
            Identidade & Auditoria
          </button>
          <button
            id="tab-btn-firmware"
            onClick={() => setTab('firmware')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              tab === 'firmware'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            Firmware C++ (ESP32)
          </button>
        </div>

        {/* Content Area */}
        <div className="my-4 space-y-4 overflow-y-auto pr-1">
          {tab === 'simulator' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                    <Radio className="w-4 h-4" />
                    Simular Ciclo Periódico do ESP32
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">deviceId: {currentDeviceId}</span>
                </div>
                <p className="text-xs text-slate-300">
                  O ESP32 envia telemetria via <b>POST /api/telemetry</b> com <b>X-Device-Key</b> no cabeçalho e consulta a cada <b>5 segundos</b> os comandos pendentes via <b>GET /api/scooters/{currentDeviceId}/commands?status=pending</b>, respondendo com <b>POST /api/commands/:id/ack</b>.
                </p>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Velocidade de Teste:</span>
                    <b className="text-cyan-400 font-mono-digits">{simSpeed} km/h</b>
                  </div>
                  <input
                    id="input-sim-speed"
                    type="range"
                    min={0}
                    max={65}
                    value={simSpeed}
                    onChange={(e) => setSimSpeed(parseInt(e.target.value, 10))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                <button
                  id="btn-simulate-esp32-cycle"
                  onClick={handleTriggerSimCycle}
                  disabled={isSimulating}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <RefreshCw className={`w-4 h-4 ${isSimulating ? 'animate-spin' : ''}`} />
                  {isSimulating ? 'Executando ciclo ESP32...' : 'Simular Ciclo ESP32 (Telemetria + Execução de Fila)'}
                </button>

                {simResult && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-cyan-500/30 text-xs font-mono text-cyan-300 animate-in fade-in">
                    {simResult}
                  </div>
                )}
              </div>

              {/* Status do Banco de Dados Centralizado .DB */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-200">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <div>
                    <p className="font-semibold text-white">Banco Centralizado: <span className="text-cyan-400 font-mono">scooter_link.db</span></p>
                    <p className="text-[11px] text-slate-400">Gravando e lendo todas as telemetrias e comandos no arquivo SQLite local</p>
                  </div>
                </div>
                <a
                  id="btn-modal-download-db"
                  href="/api/database/download"
                  download="scooter_link.db"
                  className="font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar .db
                </a>
              </div>
            </div>
          )}

          {tab === 'identity' && (
            <div className="space-y-4 text-xs">
              {/* Security info card */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">
                      Identificação Segura do ESP32
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Status: {device?.status || 'active'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 font-semibold block mb-1">Identificador Atual (deviceId)</label>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-cyan-400 font-bold">
                      {currentDeviceId}
                    </div>
                  </div>
                  <div>
                    <label className="text-slate-400 font-semibold block mb-1">Chave de Segurança (X-Device-Key)</label>
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                      <span className="font-mono text-amber-300 font-semibold truncate text-[11px] select-all">
                        {isKeyRevealed
                          ? (deviceKey || 'scooter_secret_key_001')
                          : (deviceKey.length > 4 ? `••••••••••••${deviceKey.slice(-4)}` : '••••••••••••••••')}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsKeyRevealed(!isKeyRevealed)}
                          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                          title={isKeyRevealed ? 'Ocultar Chave' : 'Mostrar Chave Completa'}
                        >
                          {isKeyRevealed ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-cyan-400" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(deviceKey || 'scooter_secret_key_001');
                            setCopiedKey(true);
                            setTimeout(() => setCopiedKey(false), 2000);
                          }}
                          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                          title="Copiar Chave de Segurança"
                        >
                          {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  <b>Importante:</b> <code>deviceId</code> não é senha. Cada scooter possui uma chave secreta única (<code>X-Device-Key</code>) validada criptograficamente por tempo constante (<code>crypto.timingSafeEqual</code>) contra o hash gravado no banco de dados.
                </p>

                {/* Change Device ID form */}
                <form onSubmit={handleUpdateIdentity} className="pt-3 border-t border-slate-800 space-y-2">
                  <label className="text-slate-300 font-bold block text-[11px] uppercase">
                    Alterar Identificador da Scooter (PUT /api/scooters/:deviceId/identity)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Novo deviceId (ex: scooter-002)"
                      value={newIdInput}
                      onChange={(e) => setNewIdInput(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={isUpdatingIdentity || !newIdInput.trim()}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl transition-all cursor-pointer text-xs"
                    >
                      {isUpdatingIdentity ? 'Atualizando...' : 'Atualizar ID'}
                    </button>
                  </div>
                </form>

                {identityMessage && (
                  <div
                    className={`p-3 rounded-xl text-xs font-mono flex items-center gap-2 ${
                      identityMessage.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/10 border border-red-500/30 text-red-300'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{identityMessage.text}</span>
                  </div>
                )}
              </div>

              {/* Audit History table */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-cyan-400" />
                    <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">
                      Histórico de Alterações de Identidade (Auditoria)
                    </h3>
                  </div>
                  <button
                    onClick={fetchAuditHistory}
                    className="text-slate-400 hover:text-cyan-400 p-1 cursor-pointer"
                    title="Atualizar histórico"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {historyList.length === 0 ? (
                  <p className="text-[11px] text-slate-500 py-3 text-center">
                    Nenhuma alteração de identificador registrada para este dispositivo.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {historyList.map((h) => (
                      <div
                        key={h.id}
                        className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between font-mono text-[10px]"
                      >
                        <div>
                          <span className="text-slate-400">{h.oldDeviceId}</span>
                          <span className="text-cyan-400 mx-1.5">➔</span>
                          <span className="text-emerald-400 font-bold">{h.newDeviceId}</span>
                        </div>
                        <div className="text-right text-slate-500">
                          <div>{formatBrasiliaDateTime(h.changedAt)}</div>
                          <div className="text-[9px]">{h.changedBy || 'Sistema'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'firmware' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Sketch Arduino C++ oficial configurado para SIM800L e ESP32:
                </span>
                <button
                  id="btn-copy-firmware"
                  onClick={handleCopyCode}
                  className="py-1.5 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Código Copiado!' : 'Copiar Código C++'}
                </button>
              </div>

              <div className="relative">
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 max-h-72 overflow-y-auto leading-relaxed">
                  {sketchCode}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
