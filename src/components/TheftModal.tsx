import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  PhoneCall,
  Share2,
  BellRing,
  CheckCircle2,
  Lock,
  Radio,
  X,
} from 'lucide-react';
import { TelemetryData } from '../types';

interface TheftModalProps {
  isOpen: boolean;
  onClose: () => void;
  theftMode: boolean;
  onToggleTheftMode: (enable: boolean) => Promise<void>;
  telemetry: TelemetryData | null;
}

export const TheftModal: React.FC<TheftModalProps> = ({
  isOpen,
  onClose,
  theftMode,
  onToggleTheftMode,
  telemetry,
}) => {
  if (!isOpen) return null;

  const [confirmStep, setConfirmStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleAction = async () => {
    setLoading(true);
    try {
      await onToggleTheftMode(!theftMode);
      setConfirmStep(false);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleShareLiveTrack = () => {
    const coords = telemetry ? `${telemetry.latitude},${telemetry.longitude}` : '';
    const shareUrl = `${window.location.origin}/?track=SL-EBIKE-2026`;
    const shareText = `🚨 ALERTA DE ROUBO DE BIKE ELÉTRICA (Scooter Link)!\nÚltima localização GPS: https://maps.google.com/?q=${coords}\nRastreamento ao vivo: ${shareUrl}`;

    if (navigator.share) {
      navigator.share({
        title: 'ALERTA DE ROUBO - Scooter Link',
        text: shareText,
        url: shareUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div
        id="theft-modal-content"
        className={`w-full max-w-lg rounded-2xl p-6 shadow-2xl transition-all border ${
          theftMode
            ? 'glass-panel-red border-red-500/80 neon-glow-red'
            : 'glass-panel border-red-500/40'
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-red-500/20">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                theftMode ? 'bg-red-600 text-white animate-pulse' : 'bg-red-500/20 text-red-400'
              }`}
            >
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {theftMode ? '🚨 Modo Roubo ATIVADO' : 'Proteção Antifurto & Alerta'}
              </h2>
              <p className="text-xs text-red-200/80">
                {theftMode
                  ? 'Rastreamento contínuo em 1 segundo'
                  : 'Acione em caso de emergência ou suspeita'}
              </p>
            </div>
          </div>
          <button
            id="btn-close-theft-modal"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="my-5 space-y-4 text-sm text-slate-200">
          {!theftMode ? (
            !confirmStep ? (
              <>
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1.5 text-red-200">
                    <p className="font-semibold text-white">O que acontece ao ativar o Modo Roubo?</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-300">
                      <li>O ESP32 acelera a telemetria GPS para <b>1 segundo</b>.</li>
                      <li>Alertas urgentes com coordenadas são enviados via <b>SMS e Telegram</b> para contatos autorizados.</li>
                      <li>O mapa entra em modo vigilância com rastro vermelho de alta frequência.</li>
                    </ul>
                  </div>
                </div>

                <button
                  id="btn-trigger-theft-confirm-step"
                  onClick={() => setConfirmStep(true)}
                  className="w-full py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                >
                  <ShieldAlert className="w-5 h-5" />
                  ATIVAR MODO ROUBO
                </button>
              </>
            ) : (
              <div className="space-y-4 text-center py-2 animate-in zoom-in-95">
                <div className="w-14 h-14 rounded-2xl bg-red-600/30 border border-red-500 text-red-400 flex items-center justify-center mx-auto animate-bounce">
                  <Lock className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Confirmação de Segurança</h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
                    Você tem certeza de que deseja disparar o alerta de roubo para esta e-bike?
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    id="btn-cancel-theft"
                    onClick={() => setConfirmStep(false)}
                    className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    id="btn-confirm-theft-now"
                    onClick={handleAction}
                    disabled={loading}
                    className="py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all shadow-lg shadow-red-600/40 flex items-center justify-center gap-1.5"
                  >
                    {loading ? 'Disparando...' : 'SIM, ATIVAR AGORA'}
                  </button>
                </div>
              </div>
            )
          ) : (
            <>
              {/* Active Theft Mode Status & Emergency actions */}
              <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/70 space-y-3">
                <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                  <Radio className="w-4 h-4 animate-ping" />
                  <span>EMISSÃO DE ALERTA ATIVA</span>
                </div>
                <p className="text-xs text-red-200">
                  A bike está transmitindo coordenadas a cada segundo. Use os botões abaixo para agir imediatamente:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Call Police 190 */}
                <a
                  id="btn-call-police-190"
                  href="tel:190"
                  className="py-3 px-4 rounded-xl bg-red-600/30 hover:bg-red-600/40 border border-red-500/60 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors active:scale-95"
                >
                  <PhoneCall className="w-4 h-4 text-red-400" />
                  Ligar Polícia Militar (190)
                </a>

                {/* Share Live Track */}
                <button
                  id="btn-share-live-track"
                  onClick={handleShareLiveTrack}
                  className="py-3 px-4 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/40 border border-cyan-500/60 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors active:scale-95"
                >
                  <Share2 className="w-4 h-4" />
                  {copiedLink ? 'Link Copiado!' : 'Compartilhar Rastreamento'}
                </button>
              </div>

              {/* Deactivate Button */}
              <button
                id="btn-deactivate-theft"
                onClick={handleAction}
                disabled={loading}
                className="w-full mt-3 py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-600/30"
              >
                <CheckCircle2 className="w-4 h-4" />
                {loading ? 'Desativando...' : 'Recuperei a Bike / Desativar Alerta'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
