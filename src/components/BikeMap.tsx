import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { TelemetryData, UserLocation, Geofence } from '../types';
import { isMobileDevice, formatDistance, formatBrasiliaDateTime, getCompassDirection } from '../utils/dateFormatter';
import { Crosshair, Locate, Compass, Layers, ShieldAlert, Radio, AlertTriangle, X, MapPin } from 'lucide-react';

interface BikeMapProps {
  telemetry: TelemetryData | null;
  historyTrail: TelemetryData[];
  userLocation: UserLocation | null;
  geofences: Geofence[];
  theftMode: boolean;
  isOnline: boolean;
  distanceToUserMeters: number | null;
  onRequestUserLocation: () => void;
  isLocatingUser: boolean;
}

export const BikeMap: React.FC<BikeMapProps> = ({
  telemetry,
  historyTrail,
  userLocation,
  geofences,
  theftMode,
  isOnline,
  distanceToUserMeters,
  onRequestUserLocation,
  isLocatingUser,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const bikeMarkerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyCircleRef = useRef<L.Circle | null>(null);
  const trailPolylineRef = useRef<L.Polyline | null>(null);
  const geofenceLayersRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [mapStyle, setMapStyle] = useState<'dark' | 'standard' | 'satellite'>('dark');
  const [followBike, setFollowBike] = useState(true);
  const [isOfflineOverlayDismissed, setIsOfflineOverlayDismissed] = useState(false);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {}
      mapInstanceRef.current = null;
    }

    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    // Default center: coordinates if available, otherwise Sao Paulo
    const defaultCenter: L.LatLngExpression = telemetry && telemetry.latitude && telemetry.longitude
      ? [telemetry.latitude, telemetry.longitude]
      : [-23.55052, -46.63331];

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    const tileLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        maxZoom: 19,
        subdomains: 'abcd',
      }
    ).addTo(map);

    tileLayerRef.current = tileLayer;
    geofenceLayersRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    // On user drag, disable auto-following temporarily
    map.on('dragstart', () => {
      setFollowBike(false);
    });

    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {}
        mapInstanceRef.current = null;
      }
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, []);

  // Change Map Layer Style
  const handleToggleMapStyle = () => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const map = mapInstanceRef.current;
    map.removeLayer(tileLayerRef.current);

    let nextStyle: 'dark' | 'standard' | 'satellite' = 'dark';
    let url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    if (mapStyle === 'dark') {
      nextStyle = 'standard';
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    } else if (mapStyle === 'standard') {
      nextStyle = 'satellite';
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    } else {
      nextStyle = 'dark';
      url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    }

    const newLayer = L.tileLayer(url, { maxZoom: 19, subdomains: 'abcd' }).addTo(map);
    tileLayerRef.current = newLayer;
    setMapStyle(nextStyle);
  };

  // Update Bike Marker Position & Icon (Moto preta, sem borda colorida)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (!telemetry || telemetry.latitude === undefined || telemetry.longitude === undefined) {
      if (bikeMarkerRef.current) {
        map.removeLayer(bikeMarkerRef.current);
        bikeMarkerRef.current = null;
      }
      return;
    }

    const { latitude, longitude, speedKmh = 0, courseDegrees = 0, altitudeMeters = 0, satellites = 0, hdop = 1 } = telemetry;
    const pos: L.LatLngExpression = [latitude, longitude];

    // Moto preta, sem borda colorida
    const bikeIcon = L.divIcon({
      className: 'scooter-black-marker-container',
      html: `
        <div style="position:relative; width:44px; height:44px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
          <div style="width:40px; height:40px; border-radius:50%; background:#000000; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(0,0,0,0.85);">
            <svg viewBox="0 0 24 24" style="width:24px; height:24px; fill:#ffffff;" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.44 16.5C18.06 16.5 16.94 17.62 16.94 19C16.94 20.38 18.06 21.5 19.44 21.5C20.82 21.5 21.94 20.38 21.94 19C21.94 17.62 20.82 16.5 19.44 16.5ZM4.44 16.5C3.06 16.5 1.94 17.62 1.94 19C1.94 20.38 3.06 21.5 4.44 21.5C5.82 21.5 6.94 20.38 6.94 19C6.94 17.62 5.82 16.5 4.44 16.5ZM9.74 11L12.44 5.5L14.14 8.5H18.94V10.5H15.04L13.64 8L11.44 12.5H16.14C16.54 11.3 17.74 10.5 19.14 10.5C20.94 10.5 22.44 12 22.44 13.8C22.44 14.5 22.24 15.1 21.84 15.6L19.14 14.5H11.94L9.74 11ZM6.74 9.5C7.94 9.5 8.94 10.5 8.94 11.8C8.94 12.3 8.74 12.8 8.44 13.2L6.14 12.2C5.84 11.2 4.94 10.5 3.84 10.5C3.24 10.5 2.64 10.7 2.24 11.1L3.44 9.7C4.34 9.6 5.54 9.5 6.74 9.5Z"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    const gpsDateTimeFormatted = formatBrasiliaDateTime(telemetry.timestamp || telemetry.gpsDateTime);

    if (!bikeMarkerRef.current) {
      const marker = L.marker(pos, { icon: bikeIcon, zIndexOffset: 1000 }).addTo(map);
      marker.bindPopup(`
        <div style="background:#090d16; color:#f8fafc; padding:10px 14px; border-radius:12px; border:1px solid #1e293b; font-family:monospace; min-width:200px;">
          <div style="font-weight:bold; color:#ffffff; font-size:13px; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
            🏍️ Scooter (${telemetry.deviceId || 'scooter-001'})
          </div>
          <div style="font-size:11px; color:#94a3b8; line-height:1.6;">
            <div>Velocidade: <b style="color:#ffffff;">${speedKmh.toFixed(1)} km/h</b></div>
            <div>Altitude: <b style="color:#ffffff;">${altitudeMeters.toFixed(1)} m</b></div>
            <div>Rumo: <b style="color:#ffffff;">${getCompassDirection(courseDegrees)}</b></div>
            <div>Satélites: <b style="color:#ffffff;">${satellites} (HDOP: ${hdop.toFixed(2)})</b></div>
            <div>Horário GPS (BRT): <b style="color:#38bdf8;">${gpsDateTimeFormatted}</b></div>
          </div>
        </div>
      `, { className: 'custom-popup', closeButton: false });
      bikeMarkerRef.current = marker;
    } else {
      bikeMarkerRef.current.setLatLng(pos);
      bikeMarkerRef.current.setIcon(bikeIcon);
    }

    if (followBike) {
      map.panTo(pos, { animate: true, duration: 0.8 });
    }
  }, [telemetry, theftMode, followBike]);

  // Update Trajectory Polyline Trail
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (historyTrail && historyTrail.length > 1) {
      const latlngs: L.LatLngExpression[] = historyTrail.map((t) => [t.latitude, t.longitude]);

      if (trailPolylineRef.current) {
        trailPolylineRef.current.setLatLngs(latlngs);
      } else {
        trailPolylineRef.current = L.polyline(latlngs, {
          color: theftMode ? '#ef4444' : '#38bdf8',
          weight: 3.5,
          opacity: 0.8,
          smoothFactor: 1,
          dashArray: theftMode ? '6, 8' : undefined,
        }).addTo(map);
      }
    }
  }, [historyTrail, theftMode]);

  // Update User Location Marker
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (userLocation) {
      const userPos: L.LatLngExpression = [userLocation.latitude, userLocation.longitude];
      const isMobile = isMobileDevice();
      const userEmoji = isMobile ? '📱' : '💻';

      const userIcon = L.divIcon({
        className: 'user-emoji-marker',
        html: `
          <div class="relative flex items-center justify-center">
            <span style="font-size: 28px; filter: drop-shadow(0 0 8px #38bdf8);">
              ${userEmoji}
            </span>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (!userMarkerRef.current) {
        userMarkerRef.current = L.marker(userPos, { icon: userIcon, zIndexOffset: 900 }).addTo(map);
        userMarkerRef.current.bindPopup(`
          <div style="background:#090d16; color:#f8fafc; padding:6px 10px; border-radius:8px; border:1px solid #38bdf8; font-size:12px;">
            <b>${userEmoji} Seu Aparelho</b>
          </div>
        `);
      } else {
        userMarkerRef.current.setLatLng(userPos);
        userMarkerRef.current.setIcon(userIcon);
      }

      // Accuracy circle
      if (userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current.setLatLng(userPos);
        userAccuracyCircleRef.current.setRadius(userLocation.accuracy || 20);
      } else {
        userAccuracyCircleRef.current = L.circle(userPos, {
          radius: userLocation.accuracy || 20,
          color: '#38bdf8',
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(map);
      }
    } else {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      if (userAccuracyCircleRef.current) {
        map.removeLayer(userAccuracyCircleRef.current);
        userAccuracyCircleRef.current = null;
      }
    }
  }, [userLocation]);

  // Update Geofence Circles
  useEffect(() => {
    if (!geofenceLayersRef.current) return;
    const group = geofenceLayersRef.current;
    group.clearLayers();

    geofences.forEach((fence) => {
      if (!fence.active) return;
      const circle = L.circle([fence.latitude, fence.longitude], {
        radius: fence.radiusMeters,
        color: theftMode ? '#ef4444' : '#06b6d4',
        fillColor: theftMode ? '#ef4444' : '#06b6d4',
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: '4, 6',
      });

      circle.bindTooltip(`🛡️ ${fence.name} (${fence.radiusMeters}m)`, {
        permanent: false,
        direction: 'top',
        className: 'geofence-tooltip',
      });

      group.addLayer(circle);
    });
  }, [geofences, theftMode]);

  // Center on Bike
  const centerOnBike = () => {
    if (!mapInstanceRef.current || !telemetry) return;
    setFollowBike(true);
    mapInstanceRef.current.setView([telemetry.latitude, telemetry.longitude], 17, {
      animate: true,
      duration: 0.8,
    });
  };

  // Center on User
  const centerOnUser = () => {
    if (!mapInstanceRef.current || !userLocation) {
      onRequestUserLocation();
      return;
    }
    setFollowBike(false);
    mapInstanceRef.current.setView([userLocation.latitude, userLocation.longitude], 17, {
      animate: true,
      duration: 0.8,
    });
  };

  // Fit Both Bike & User in View
  const fitBothInView = () => {
    if (!mapInstanceRef.current || !telemetry || !userLocation) return;
    setFollowBike(false);
    const bounds = L.latLngBounds([
      [telemetry.latitude, telemetry.longitude],
      [userLocation.latitude, userLocation.longitude],
    ]);
    mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
  };

  return (
    <div id="scooter-map-wrapper" className="relative w-full h-full min-h-[360px] overflow-hidden bg-[#020617] isolate z-0">
      {/* Map Canvas */}
      <div id="scooter-map" ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Offline / Aguardando Telemetria Warning if no telemetry */}
      {!telemetry && !isOfflineOverlayDismissed && (
        <div
          id="offline-overlay-backdrop"
          className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 text-center animate-in fade-in"
        >
          <div
            id="offline-overlay-card"
            className="relative max-w-md w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl"
          >
            {/* Close Button X */}
            <button
              id="btn-close-offline-overlay"
              onClick={() => setIsOfflineOverlayDismissed(true)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Fechar aviso e explorar mapa"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Radio className="w-6 h-6 animate-pulse text-amber-400" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Scooter offline / aguardando dados</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              O servidor está aguardando o primeiro pacote de telemetria GPS enviado pelo ESP32 via SIM800L 2G/GPRS.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 text-[11px] font-mono text-cyan-400 border border-cyan-500/20">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                Aguardando POST /api/telemetry
              </div>
            </div>

            {/* Dismiss Button */}
            <button
              id="btn-dismiss-offline-overlay-action"
              onClick={() => setIsOfflineOverlayDismissed(true)}
              className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-xs rounded-xl border border-cyan-500/30 hover:border-cyan-500/60 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <MapPin className="w-4 h-4" />
              Fechar Aviso e Explorar Mapa
            </button>
          </div>
        </div>
      )}

      {/* Minimized Pill when dismissed and still no telemetry */}
      {!telemetry && isOfflineOverlayDismissed && (
        <button
          id="btn-reopen-offline-overlay"
          onClick={() => setIsOfflineOverlayDismissed(false)}
          className="absolute top-4 left-4 z-20 glass-panel px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-semibold text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-500/60 shadow-lg cursor-pointer transition active:scale-95 animate-in fade-in"
          title="Clique para ver o status de conexão"
        >
          <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Scooter Offline (Aguardando dados)</span>
        </button>
      )}

      {/* Floating Distance Badge (if user location is active) */}
      {distanceToUserMeters !== null && telemetry && (
        <div
          id="distance-badge"
          className="absolute top-4 left-4 z-20 glass-panel px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold text-cyan-300 shadow-lg border border-cyan-500/30 animate-in fade-in slide-in-from-top-2"
        >
          <Compass className="w-4 h-4 text-cyan-400 animate-spin-slow" />
          <span>
            Distância até a scooter:{' '}
            <b className="text-white font-mono-digits">{formatDistance(distanceToUserMeters)}</b>
          </span>
        </div>
      )}

      {/* Map Controls (Floating Top-Right) */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
        {/* Layer Style Toggle */}
        <button
          id="btn-map-style"
          onClick={handleToggleMapStyle}
          className="glass-panel p-2.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-cyan-400 transition-all shadow-md active:scale-95 flex items-center justify-center border-slate-700 cursor-pointer"
          title={`Estilo do Mapa (${mapStyle.toUpperCase()})`}
        >
          <Layers className="w-5 h-5" />
        </button>

        {/* Center on Bike */}
        <button
          id="btn-center-bike"
          onClick={centerOnBike}
          disabled={!telemetry}
          className={`glass-panel p-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center cursor-pointer ${
            followBike && telemetry
              ? 'text-cyan-400 border-cyan-500/60 neon-glow-teal bg-cyan-500/10'
              : 'text-slate-300 hover:text-cyan-400 border-slate-700'
          } ${!telemetry ? 'opacity-40 cursor-not-allowed' : ''}`}
          title="Centralizar na Scooter"
        >
          <Crosshair className="w-5 h-5" />
        </button>

        {/* Show / Center My Location */}
        <button
          id="btn-center-user"
          onClick={centerOnUser}
          className={`glass-panel p-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center cursor-pointer ${
            userLocation
              ? 'text-cyan-400 border-cyan-500/60 bg-cyan-500/10'
              : 'text-slate-400 hover:text-cyan-300 border-slate-700'
          } ${isLocatingUser ? 'animate-pulse text-cyan-400' : ''}`}
          title="Minha Localização (GPS do Aparelho)"
        >
          <Locate className="w-5 h-5" />
        </button>

        {/* Fit Both (Visible if user location exists) */}
        {userLocation && telemetry && (
          <button
            id="btn-fit-both"
            onClick={fitBothInView}
            className="glass-panel p-2.5 rounded-xl hover:bg-slate-800 text-amber-300 hover:text-amber-200 transition-all shadow-md active:scale-95 flex items-center justify-center text-xs font-bold border-slate-700 cursor-pointer"
            title="Ver Scooter e Meu Aparelho Juntos"
          >
            ↔️
          </button>
        )}
      </div>

      {/* Follow Mode Indicator Pill */}
      {followBike && telemetry && (
        <div className="absolute bottom-4 left-4 z-20 glass-panel px-3 py-1 rounded-xl flex items-center gap-1.5 text-[11px] text-cyan-400 font-medium border-cyan-500/30">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <span>Acompanhando em Tempo Real</span>
        </div>
      )}

      {/* Theft Mode Alert Banner Overlay on Map */}
      {theftMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass-panel-red px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold text-red-100 border border-red-500/80 shadow-2xl animate-bounce">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          <span>🚨 MODO ROUBO ATIVO: Rastreamento 1s</span>
        </div>
      )}
    </div>
  );
};
