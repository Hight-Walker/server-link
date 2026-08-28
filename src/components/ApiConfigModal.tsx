import React, { useState, useEffect } from 'react';
import {
  Server,
  Key,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Radio,
  RefreshCw,
  Power,
  Plus,
  Send,
  Code,
  Terminal,
  AlertTriangle,
  Lock,
  Cpu,
  Eye,
  EyeOff,
  Edit3,
  Save,
  Clock,
  MapPin,
  Compass,
  Zap,
  X
} from 'lucide-react';
import { formatBrasiliaDateTime } from '../utils/dateFormatter';

interface ApiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDeviceId: string;
  onSelectDeviceId?: (id: string) => void;
  isAdminAuthenticated?: boolean;
}

interface ApiInfoData {
  baseApiUrl: string;
  telemetryUrl: string;
  statusUrl: string;
  deviceId: string;
  displayName: string;
  status: 'active' | 'disabled';
  statusDisplay: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  lastLocation: {
    latitude: number;
    longitude: number;
    speedKmh: number;
    altitudeMeters?: number;
    courseDegrees?: number;
    satellites?: number;
    hdop?: number;
  } | null;
  deviceKey: string;
  deviceKeyMasked: string;
  cppSnippet: string;
}

export const ApiConfigModal: React.FC<ApiConfigModalProps> = ({
  isOpen,
  onClose,
  activeDeviceId,
  onSelectDeviceId,
  isAdminAuthenticated = true,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'code' | 'test' | 'register'>('info');
  const [apiInfo, setApiInfo] = useState<ApiInfoData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Key visibility & custom editing states
  const [isKeyRevealed, setIsKeyRevealed] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Rotating Key states
  const [isRotatingKey, setIsRotatingKey] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [showRotateConfirmation, setShowRotateConfirmation] = useState(false);

  // Status toggle state
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Register state
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registeredKey, setRegisteredKey] = useState<{ id: string; key: string } | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Test Ingestion state
  const [testKey, setTestKey] = useState('');
  const [showTestKey, setShowTestKey] = useState(false);
  const [testLat, setTestLat] = useState('-23.55052');
  const [testLng, setTestLng] = useState('-46.63331');
  const [testSpeed, setTestSpeed] = useState('22.4');
  const [testResponse, setTestResponse] = useState<any | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Load API Info
  const loadApiInfo = async () => {
    if (!activeDeviceId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(activeDeviceId)}/api-info`);
      if (res.ok) {
        const data = await res.json();
        setApiInfo(data);
        if (data.deviceKey) {
          setCustomKeyInput(data.deviceKey);
          setTestKey((prev) => prev || data.deviceKey);
        }
      }
    } catch (e) {
      console.error('Failed to load api info:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadApiInfo();
    } else {
      setNewlyGeneratedKey(null);
      setShowRotateConfirmation(false);
      setIsEditingKey(false);
      setIsKeyRevealed(false);
      setKeyFeedback(null);
      setRegisteredKey(null);
      setTestResponse(null);
    }
  }, [isOpen, activeDeviceId]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2500);
  };

  // Rotate Key
  const handleRotateKey = async () => {
    if (!activeDeviceId) return;
    setIsRotatingKey(true);
    setKeyFeedback(null);
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(activeDeviceId)}/rotate-key`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok && data.newDeviceKey) {
        setNewlyGeneratedKey(data.newDeviceKey);
        setShowRotateConfirmation(false);
        setKeyFeedback({
          type: 'success',
          message: 'Nova chave aleatória gerada e salva com sucesso!',
        });
        setTestKey(data.newDeviceKey);
        setCustomKeyInput(data.newDeviceKey);
        loadApiInfo();
      } else {
        setKeyFeedback({
          type: 'error',
          message: data.message || 'Erro ao rotacionar chave.',
        });
      }
    } catch (e: any) {
      setKeyFeedback({
        type: 'error',
        message: `Falha na requisição: ${e.message}`,
      });
    } finally {
      setIsRotatingKey(false);
    }
  };

  // Save Custom Key
  const handleSaveCustomKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = customKeyInput.trim();
    if (!cleanKey || cleanKey.length < 4) {
      setKeyFeedback({
        type: 'error',
        message: 'A chave deve ter pelo menos 4 caracteres.',
      });
      return;
    }
    setIsSavingKey(true);
    setKeyFeedback(null);
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(activeDeviceId)}/key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceKey: cleanKey }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setKeyFeedback({
          type: 'success',
          message: 'Chave do dispositivo alterada e salva com sucesso!',
        });
        setIsEditingKey(false);
        setTestKey(cleanKey);
        loadApiInfo();
      } else {
        setKeyFeedback({
          type: 'error',
          message: data.error || data.message || 'Erro ao salvar chave.',
        });
      }
    } catch (err: any) {
      setKeyFeedback({
        type: 'error',
        message: `Falha na comunicação: ${err.message}`,
      });
    } finally {
      setIsSavingKey(false);
    }
  };

  // Toggle Device Status (active / disabled)
  const handleToggleStatus = async () => {
    if (!apiInfo) return;
    const nextStatus = apiInfo.status === 'active' ? 'disabled' : 'active';
    setIsTogglingStatus(true);
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(activeDeviceId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        loadApiInfo();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Register New Device
  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    setRegisterError(null);
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: newDeviceId || undefined,
          displayName: newDisplayName || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setRegisteredKey({
          id: data.device.deviceId,
          key: data.rawDeviceKey,
        });
        if (onSelectDeviceId) {
          onSelectDeviceId(data.device.deviceId);
        }
        setNewDeviceId('');
        setNewDisplayName('');
        loadApiInfo();
      } else {
        setRegisterError(data.error || 'Erro ao cadastrar scooter.');
      }
    } catch (err: any) {
      setRegisterError(`Falha na comunicação: ${err.message}`);
    } finally {
      setIsRegistering(false);
    }
  };

  // Send Test Telemetry
  const handleSendTestTelemetry = async () => {
    if (!apiInfo) return;
    setIsSendingTest(true);
    setTestResponse(null);

    const payload = {
      deviceId: apiInfo.deviceId,
      timestamp: new Date().toISOString(),
      gps: {
        latitude: parseFloat(testLat) || -23.55052,
        longitude: parseFloat(testLng) || -46.63331,
        altitudeMeters: 760.4,
        speedKmh: parseFloat(testSpeed) || 0,
        courseDegrees: 120,
        satellites: 9,
        hdop: 0.9,
        gpsDateUtc: new Date().toISOString().split('T')[0],
        gpsTimeUtc: new Date().toISOString().split('T')[1].slice(0, 8),
      },
      network: {
        signalRssi: 24,
        registered: true,
      },
    };

    try {
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Key': testKey.trim(),
        },
        body: JSON.stringify(payload),
      });

      const responseJson = await res.json().catch(() => ({}));
      setTestResponse({
        httpStatus: res.status,
        statusText: res.statusText,
        ok: res.ok,
        data: responseJson,
      });

      if (res.ok) {
        loadApiInfo();
      }
    } catch (err: any) {
      setTestResponse({
        httpStatus: 500,
        ok: false,
        error: err.message,
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://meu-dominio.com';
  const baseApiUrl = apiInfo?.baseApiUrl || `${originUrl}/api`;
  const telemetryUrl = apiInfo?.telemetryUrl || `${originUrl}/api/telemetry`;
  const statusUrl = apiInfo?.statusUrl || `${originUrl}/api/status/${activeDeviceId}`;

  return (
    <div
      id="api-config-modal-backdrop"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div
        id="api-config-modal-card"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">Configuração da API</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider font-semibold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Protegido
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Endereços de ingestão, chaves seguras e integração para ESP32 + SIM800L
              </p>
            </div>
          </div>

          <button
            id="close-api-config-modal-btn"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center px-6 border-b border-slate-800 bg-slate-900/60 overflow-x-auto gap-2">
          <button
            id="tab-api-info"
            onClick={() => setActiveTab('info')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'info'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4" />
            Visão Geral & URLs
          </button>

          <button
            id="tab-api-code"
            onClick={() => setActiveTab('code')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'code'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-4 h-4" />
            Código ESP32 C++
          </button>

          <button
            id="tab-api-test"
            onClick={() => setActiveTab('test')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'test'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-4 h-4" />
            Testar Telemetria
          </button>

          <button
            id="tab-api-register"
            onClick={() => setActiveTab('register')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'register'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            Nova Scooter
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: VISÃO GERAL & ENDPOINTS */}
          {activeTab === 'info' && (
            <div className="space-y-6">
              {/* Newly rotated key alert */}
              {newlyGeneratedKey && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm text-amber-300">
                    <Key className="w-4 h-4" />
                    Nova Chave Secreta Gerada com Sucesso!
                  </div>
                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    Copie esta chave e atualize o cabeçalho <code>X-Device-Key</code> no firmware do seu ESP32. Por segurança, apenas o hash SHA-256 é armazenado no servidor e esta chave não será exibida novamente.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      readOnly
                      value={newlyGeneratedKey}
                      className="w-full bg-slate-950 px-3 py-2 text-xs font-mono text-cyan-300 rounded-lg border border-amber-500/30 select-all"
                    />
                    <button
                      onClick={() => copyToClipboard(newlyGeneratedKey, 'rotated-key')}
                      className="px-3 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-amber-400 transition flex items-center gap-1.5 shrink-0"
                    >
                      {copiedField === 'rotated-key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedField === 'rotated-key' ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Endpoints Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Base API */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-slate-300">URL Base da API</span>
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px] text-slate-400">REST</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-900/90 rounded-lg border border-slate-800/80">
                    <span className="text-xs font-mono text-cyan-300 truncate select-all">{baseApiUrl}</span>
                    <button
                      onClick={() => copyToClipboard(baseApiUrl, 'base-api')}
                      className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
                      title="Copiar URL Base"
                    >
                      {copiedField === 'base-api' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Ingestion Telemetry URL */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-slate-300">URL para Telemetria</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold rounded text-[10px]">POST</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-900/90 rounded-lg border border-slate-800/80">
                    <span className="text-xs font-mono text-emerald-300 truncate select-all">{telemetryUrl}</span>
                    <button
                      onClick={() => copyToClipboard(telemetryUrl, 'telemetry-url')}
                      className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
                      title="Copiar Endpoint de Telemetria"
                    >
                      {copiedField === 'telemetry-url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Status URL */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider text-slate-300">URL para Consultar Status</span>
                      <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-300 font-bold rounded text-[10px]">GET</span>
                    </div>
                    <a
                      href={statusUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 text-xs flex items-center gap-1 transition"
                    >
                      Abrir JSON <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-900/90 rounded-lg border border-slate-800/80">
                    <span className="text-xs font-mono text-sky-300 truncate select-all">{statusUrl}</span>
                    <button
                      onClick={() => copyToClipboard(statusUrl, 'status-url')}
                      className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
                      title="Copiar Endpoint de Status"
                    >
                      {copiedField === 'status-url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Device Info Box */}
              <div className="p-5 rounded-xl bg-slate-950/40 border border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-5 h-5 text-cyan-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        ID da Scooter: <span className="font-mono text-cyan-300">{activeDeviceId}</span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        {apiInfo?.displayName || activeDeviceId} • ESP32 + SIM800L
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    {apiInfo?.status === 'disabled' ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" /> Dispositivo Desativado
                      </span>
                    ) : apiInfo?.statusDisplay === 'awaiting_first_connection' ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Aguardando primeira conexão
                      </span>
                    ) : apiInfo?.isOnline ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        Online (&le; 60s)
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        Offline (&gt; 60s)
                      </span>
                    )}
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" /> Última Conexão
                    </div>
                    <div className="text-xs font-mono font-medium text-slate-200">
                      {apiInfo?.lastSeenAt ? formatBrasiliaDateTime(apiInfo.lastSeenAt) : 'Nenhuma conexão registrada'}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Última Localização
                    </div>
                    <div className="text-xs font-mono font-medium text-slate-200">
                      {apiInfo?.lastLocation ? (
                        <>
                          {apiInfo.lastLocation.latitude.toFixed(5)}, {apiInfo.lastLocation.longitude.toFixed(5)} ({apiInfo.lastLocation.speedKmh.toFixed(1)} km/h)
                        </>
                      ) : (
                        'Aguardando coordenadas GPS'
                      )}
                    </div>
                  </div>
                </div>

                {/* Key Management Box */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800/90 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-amber-400" /> Chave de Segurança do Dispositivo
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      SHA-256 Hash Protegido
                    </span>
                  </div>

                  {/* Feedback message */}
                  {keyFeedback && (
                    <div
                      className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                        keyFeedback.type === 'success'
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                          : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {keyFeedback.type === 'success' ? (
                        <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      )}
                      <span>{keyFeedback.message}</span>
                    </div>
                  )}

                  {!isEditingKey ? (
                    <div className="space-y-3">
                      <div
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border transition-all ${
                          isKeyRevealed
                            ? 'bg-amber-950/40 border-amber-500/50 shadow-inner'
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden flex-1">
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                              isKeyRevealed
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isKeyRevealed ? 'Visível' : 'Oculta'}
                          </span>
                          <span
                            className={`text-xs font-mono select-all truncate ${
                              isKeyRevealed
                                ? 'text-amber-200 font-bold tracking-wider'
                                : 'text-slate-400'
                            }`}
                          >
                            {isKeyRevealed
                              ? (apiInfo?.deviceKey || customKeyInput || 'scooter_secret_key_001')
                              : (apiInfo?.deviceKeyMasked || '••••••••••••••••')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                          {/* Reveal/Hide Toggle with explicit label */}
                          <button
                            id="btn-toggle-key-visibility"
                            type="button"
                            onClick={() => setIsKeyRevealed(!isKeyRevealed)}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                              isKeyRevealed
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
                            }`}
                            title={isKeyRevealed ? 'Ocultar Chave de Segurança' : 'Mostrar Chave de Segurança Completa'}
                          >
                            {isKeyRevealed ? (
                              <>
                                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                <span>Ocultar</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Mostrar</span>
                              </>
                            )}
                          </button>

                          {/* Copy Key */}
                          <button
                            id="btn-copy-device-key"
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                apiInfo?.deviceKey || customKeyInput || 'scooter_secret_key_001',
                                'device-key'
                              )
                            }
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                            title="Copiar Chave do Dispositivo"
                          >
                            {copiedField === 'device-key' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Edit Custom Key Trigger */}
                        <button
                          id="btn-open-edit-key"
                          type="button"
                          onClick={() => {
                            setCustomKeyInput(apiInfo?.deviceKey || 'scooter_secret_key_001');
                            setIsEditingKey(true);
                            setKeyFeedback(null);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Alterar Chave
                        </button>

                        {/* Rotate Key Button */}
                        {!showRotateConfirmation ? (
                          <button
                            id="rotate-key-btn"
                            onClick={() => setShowRotateConfirmation(true)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Gerar Chave Aleatória
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 p-1.5 rounded-lg bg-amber-950/60 border border-amber-500/50 text-xs">
                            <span className="text-amber-200 font-medium px-1">Confirmar nova chave?</span>
                            <button
                              onClick={handleRotateKey}
                              disabled={isRotatingKey}
                              className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold rounded hover:bg-amber-400 transition cursor-pointer"
                            >
                              {isRotatingKey ? 'Gerando...' : 'Sim, Gerar'}
                            </button>
                            <button
                              onClick={() => setShowRotateConfirmation(false)}
                              className="px-2 py-1 text-slate-400 hover:text-white transition cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Inline Key Editor Form */
                    <form onSubmit={handleSaveCustomKey} className="space-y-3 p-3 rounded-lg bg-slate-950 border border-cyan-500/40 animate-in fade-in">
                      <div>
                        <label className="block text-[11px] font-semibold text-cyan-300 mb-1">
                          Digitar Nova Chave de Autenticação para {activeDeviceId}:
                        </label>
                        <input
                          type="text"
                          value={customKeyInput}
                          onChange={(e) => setCustomKeyInput(e.target.value)}
                          placeholder="Ex: scooter_secret_key_001"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                          autoFocus
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          A chave informada será gravada e protegida com hash SHA-256 no banco SQLite Cloud.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={isSavingKey || !customKeyInput.trim()}
                          className="px-3 py-1.5 bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-cyan-400 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {isSavingKey ? 'Salvando...' : 'Salvar Chave'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingKey(false);
                            setKeyFeedback(null);
                          }}
                          className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:text-white text-xs rounded-lg hover:bg-slate-700 transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Actions Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    {/* Toggle Status Button */}
                    <button
                      id="toggle-status-btn"
                      onClick={handleToggleStatus}
                      disabled={isTogglingStatus}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                        apiInfo?.status === 'active'
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {apiInfo?.status === 'active' ? 'Desativar Dispositivo' : 'Ativar Dispositivo'}
                    </button>
                  </div>

                  <button
                    onClick={loadApiInfo}
                    disabled={isLoading}
                    className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
                    title="Atualizar Informações"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CÓDIGO C++ ARDUINO / ESP32 */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Trecho C++ Pronto para ESP32</h3>
                  <p className="text-xs text-slate-400">
                    Copie estas variáveis para o cabeçalho do seu firmware Arduino/ESP-IDF
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(apiInfo?.cppSnippet || '', 'cpp-snippet')}
                  className="px-3 py-1.5 bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-cyan-400 transition flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedField === 'cpp-snippet' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedField === 'cpp-snippet' ? 'Copiado!' : 'Copiar Código'}
                </button>
              </div>

              <div className="relative p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 leading-relaxed overflow-x-auto select-all">
                <pre>{apiInfo?.cppSnippet || `const char* DEVICE_ID = "${activeDeviceId}";\nconst char* TELEMETRY_URL = "${telemetryUrl}";\nconst char* DEVICE_KEY = "${apiInfo?.deviceKey || 'SUA_CHAVE_SECRETA'}";`}</pre>
              </div>

              {/* Sample ESP32 Ingestion Sketch explanation */}
              <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Como o ESP32 deve enviar o HTTP POST</h4>
                <div className="text-xs text-slate-400 space-y-1.5 font-mono">
                  <div className="text-slate-300 font-semibold">Cabeçalhos HTTP Obrigatórios:</div>
                  <div className="pl-3 border-l-2 border-slate-700">
                    <div>Content-Type: application/json</div>
                    <div>X-Device-Key: {apiInfo?.deviceKey || '[CHAVE_SECRETA_DA_SCOOTER]'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TESTAR TELEMETRIA */}
          {activeTab === 'test' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Simulador de Telemetria (ESP32 Test)</h3>
                <p className="text-xs text-slate-400">
                  Envie uma requisição real de telemetria para verificar a validação de chave e coordenadas
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      Chave Secreta da Scooter (X-Device-Key)
                    </label>
                    {apiInfo?.deviceKey && (
                      <button
                        type="button"
                        onClick={() => setTestKey(apiInfo.deviceKey)}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                      >
                        Usar Chave Atual ({apiInfo.deviceKeyMasked})
                      </button>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type={showTestKey ? 'text' : 'password'}
                      placeholder="Cole a chave da scooter para teste..."
                      value={testKey}
                      onChange={(e) => setTestKey(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTestKey(!showTestKey)}
                      className="absolute right-2.5 p-1 text-slate-400 hover:text-white transition cursor-pointer"
                      title={showTestKey ? 'Ocultar Senha' : 'Ver Senha'}
                    >
                      {showTestKey ? <EyeOff className="w-3.5 h-3.5 text-cyan-400" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    A chave deve corresponder ao hash SHA-256 registrado no banco de dados.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Latitude</label>
                  <input
                    type="text"
                    value={testLat}
                    onChange={(e) => setTestLat(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Longitude</label>
                  <input
                    type="text"
                    value={testLng}
                    onChange={(e) => setTestLng(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Velocidade (km/h)</label>
                  <input
                    type="text"
                    value={testSpeed}
                    onChange={(e) => setTestSpeed(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    id="send-test-telemetry-btn"
                    onClick={handleSendTestTelemetry}
                    disabled={isSendingTest || !testKey.trim()}
                    className="w-full px-4 py-2 bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-cyan-400 disabled:opacity-50 transition flex items-center justify-center gap-2 h-[38px]"
                  >
                    <Send className="w-4 h-4" />
                    {isSendingTest ? 'Enviando...' : 'Disparar POST /api/telemetry'}
                  </button>
                </div>
              </div>

              {/* Test Response View */}
              {testResponse && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">Resposta do Servidor:</span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                        testResponse.ok
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      HTTP {testResponse.httpStatus}
                    </span>
                  </div>
                  <pre className="p-3 bg-slate-900 rounded-lg text-xs font-mono text-slate-200 overflow-x-auto">
                    {JSON.stringify(testResponse.data || testResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CADASTRAR NOVA SCOOTER */}
          {activeTab === 'register' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Cadastrar Nova Scooter</h3>
                <p className="text-xs text-slate-400">
                  Gere um identificador exclusivo e chave secreta criptograficamente forte para seu ESP32
                </p>
              </div>

              {registeredKey ? (
                <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <ShieldCheck className="w-5 h-5" /> Scooter {registeredKey.id} Cadastrada com Sucesso!
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Copie a chave secreta gerada abaixo e grave no seu ESP32. Esta chave nunca mais será exibida pelo servidor (apenas seu hash SHA-256 é armazenado).
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={registeredKey.key}
                      className="w-full bg-slate-950 px-3 py-2 text-xs font-mono text-emerald-300 rounded-lg border border-emerald-500/30 select-all"
                    />
                    <button
                      onClick={() => copyToClipboard(registeredKey.key, 'new-registered-key')}
                      className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-emerald-400 transition flex items-center gap-1.5 shrink-0"
                    >
                      {copiedField === 'new-registered-key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedField === 'new-registered-key' ? 'Copiado!' : 'Copiar Chave'}
                    </button>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={() => setRegisteredKey(null)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:text-white transition"
                    >
                      Cadastrar outra scooter
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRegisterDevice} className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                  {registerError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {registerError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Identificador da Scooter (deviceId)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: scooter-002 (deixe vazio para gerar automático)"
                      value={newDeviceId}
                      onChange={(e) => setNewDeviceId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nome Amigável de Exibição
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Scooter Cidade / Trabalho"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isRegistering}
                    className="w-full py-2.5 bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-cyan-400 disabled:opacity-50 transition flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {isRegistering ? 'Cadastrando e Gerando Chave...' : 'Criar Scooter e Gerar Chave Forte'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>SQLite Cloud Sync • Criptografia SHA-256</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
