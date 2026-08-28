import React, { useState } from 'react';
import { Geofence, TelemetryData } from '../types';
import {
  ShieldCheck,
  Plus,
  Trash2,
  MapPin,
  Bell,
  CheckCircle,
  X,
} from 'lucide-react';

interface GeofenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  geofences: Geofence[];
  onAddGeofence: (newFence: Partial<Geofence>) => Promise<void>;
  onDeleteGeofence: (id: string) => Promise<void>;
  telemetry: TelemetryData | null;
}

export const GeofenceModal: React.FC<GeofenceModalProps> = ({
  isOpen,
  onClose,
  geofences,
  onAddGeofence,
  onDeleteGeofence,
  telemetry,
}) => {
  if (!isOpen) return null;

  const [name, setName] = useState('');
  const [radiusMeters, setRadiusMeters] = useState(150);
  const [useCurrentBikePos, setUseCurrentBikePos] = useState(true);
  const [customLat, setCustomLat] = useState(telemetry?.latitude.toString() || '-15.7942');
  const [customLng, setCustomLng] = useState(telemetry?.longitude.toString() || '-47.8822');
  const [notifyOnExit, setNotifyOnExit] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const lat = useCurrentBikePos && telemetry ? telemetry.latitude : parseFloat(customLat);
      const lng = useCurrentBikePos && telemetry ? telemetry.longitude : parseFloat(customLng);

      await onAddGeofence({
        name: name.trim(),
        latitude: lat,
        longitude: lng,
        radiusMeters,
        active: true,
        notifyOnExit,
        notifyOnEntry: false,
      });

      setName('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div
        id="geofence-modal-content"
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl glass-panel-neon border border-cyan-500/40 p-5 md:p-6 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Cerca Virtual (Geofence)</h2>
              <p className="text-xs text-slate-400">
                Receba alertas se a bike sair do perímetro seguro
              </p>
            </div>
          </div>
          <button
            id="btn-close-geofence-modal"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="my-4 space-y-5 overflow-y-auto pr-1">
          {/* Create Form */}
          <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Criar Nova Cerca de Proteção
            </h3>

            <div>
              <label className="text-[11px] text-slate-300 font-medium">Nome do Local Seguro</label>
              <input
                id="input-geofence-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Garagem de Casa, Trabalho, Condomínio"
                className="w-full mt-1 px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 transition-colors"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-300 font-medium">Raio do Perímetro</label>
                <select
                  id="select-geofence-radius"
                  value={radiusMeters}
                  onChange={(e) => setRadiusMeters(parseInt(e.target.value, 10))}
                  className="w-full mt-1 px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value={50}>50 metros (Ultra Seguro)</option>
                  <option value={100}>100 metros</option>
                  <option value={150}>150 metros (Padrão)</option>
                  <option value={300}>300 metros</option>
                  <option value={500}>500 metros (Bairro)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-300 font-medium">Centro da Cerca</label>
                <div className="mt-1 flex items-center h-[34px]">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCurrentBikePos}
                      onChange={(e) => setUseCurrentBikePos(e.target.checked)}
                      className="accent-cyan-400 rounded"
                    />
                    <span>Posição atual da bike</span>
                  </label>
                </div>
              </div>
            </div>

            <button
              id="btn-submit-geofence"
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <CheckCircle className="w-4 h-4" />
              {isSubmitting ? 'Salvando...' : 'Adicionar Cerca Segura'}
            </button>
          </form>

          {/* Existing Geofences List */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Cercas Ativas ({geofences.length})
            </h4>

            {geofences.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Nenhuma cerca virtual cadastrada ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {geofences.map((fence) => (
                  <div
                    key={fence.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-bold text-white flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                        {fence.name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono-digits">
                        Raio: {fence.radiusMeters}m | Coords: {fence.latitude.toFixed(4)}, {fence.longitude.toFixed(4)}
                      </p>
                    </div>
                    <button
                      id={`btn-delete-geofence-${fence.id}`}
                      onClick={() => onDeleteGeofence(fence.id)}
                      className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Excluir cerca"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
