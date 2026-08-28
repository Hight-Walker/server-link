import React, { useState, useEffect } from 'react';
import {
  Database,
  Download,
  Server,
  HardDrive,
  Table,
  CheckCircle2,
  RefreshCw,
  X,
  FileCode,
  Layers,
  Radio,
  FileSpreadsheet,
  Terminal,
} from 'lucide-react';

import { safeFetchJson } from '../utils/api';

interface DatabaseStats {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  journalMode: string;
  tableCounts: {
    users: number;
    devices: number;
    telemetry: number;
    commands: number;
    commandAcks: number;
    alerts: number;
    geofences: number;
    authorizedContacts: number;
  };
  lastTelemetryTimestamp?: string;
  totalRecords: number;
}

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseModal: React.FC<DatabaseModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>('telemetry');
  const [tableData, setTableData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingTable, setLoadingTable] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState(false);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const result = await safeFetchJson('/api/database/stats');
      if (result.ok && result.data) {
        setStats(result.data);
      }
    } catch (e) {
      // Safe fallback
    } finally {
      setLoading(false);
    }
  };

  const fetchTableRows = async (tableName: string) => {
    try {
      setLoadingTable(true);
      const result = await safeFetchJson(`/api/database/tables/${tableName}?limit=25`);
      if (result.ok && result.data) {
        setTableData(result.data.rows || []);
      }
    } catch (e) {
      // Safe fallback
    } finally {
      setLoadingTable(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchTableRows(selectedTable);
  }, []);

  const handleSelectTable = (table: string) => {
    setSelectedTable(table);
    fetchTableRows(table);
  };

  const handleDownloadDb = () => {
    window.location.href = '/api/database/download';
  };

  const tableList = [
    { key: 'telemetry', label: 'telemetry (GPS & Dados)', count: stats?.tableCounts.telemetry || 0 },
    { key: 'commands', label: 'commands (Fila 2G/GPRS)', count: stats?.tableCounts.commands || 0 },
    { key: 'devices', label: 'devices (Scooter & Status)', count: stats?.tableCounts.devices || 0 },
    { key: 'alerts', label: 'alerts (Logs de Segurança)', count: stats?.tableCounts.alerts || 0 },
    { key: 'geofences', label: 'geofences (Cercas Virtuais)', count: stats?.tableCounts.geofences || 0 },
    { key: 'authorized_contacts', label: 'authorized_contacts (SOS)', count: stats?.tableCounts.authorizedContacts || 0 },
    { key: 'command_acks', label: 'command_acks (Confirmações)', count: stats?.tableCounts.commandAcks || 0 },
    { key: 'users', label: 'users (Contas de Acesso)', count: stats?.tableCounts.users || 0 },
  ];

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div
        id="database-modal-content"
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900/95 border border-cyan-500/40 p-5 md:p-6 shadow-2xl overflow-hidden text-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Banco de Dados SQLite Centralizado
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  scooter_link.db
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Todos os dados de telemetria, comandos, cercas e usuários são gravados e lidos diretamente deste arquivo .db
              </p>
            </div>
          </div>
          <button
            id="btn-close-database-modal"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Top Banner: Download .DB Button */}
        <div className="my-3 p-4 rounded-xl bg-gradient-to-r from-cyan-950/60 to-slate-900/90 border border-cyan-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <HardDrive className="w-7 h-7 text-cyan-400 shrink-0" />
            <div>
              <p className="text-xs font-bold text-white flex items-center gap-2">
                <span>Arquivo Central: <b>scooter_link.db</b></span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {stats?.fileSizeFormatted || '48 KB'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  ({stats?.totalRecords || 0} registros totais)
                </span>
              </p>
              <p className="text-[11px] text-slate-400">
                Compatível com DB Browser for SQLite, DBeaver, VSCode SQLite, Python, C++ e Node.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              id="btn-refresh-db-stats"
              onClick={() => {
                fetchStats();
                fetchTableRows(selectedTable);
              }}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="Atualizar Estatísticas"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              id="btn-download-sqlite-db"
              onClick={handleDownloadDb}
              className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 cursor-pointer active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Arquivo .db</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 overflow-hidden my-2">
          {/* Left Table Selector (4 cols) */}
          <div className="md:col-span-4 flex flex-col gap-2 overflow-y-auto pr-1">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold tracking-wider px-1">
              Tabelas do Banco ({tableList.length})
            </span>
            <div className="space-y-1.5">
              {tableList.map((t) => (
                <button
                  key={t.key}
                  onClick={() => handleSelectTable(t.key)}
                  className={`w-full p-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                    selectedTable === t.key
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                      : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700/50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Table className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.label.split(' ')[0]}</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      selectedTable === t.key
                        ? 'bg-slate-950 text-cyan-300'
                        : 'bg-slate-900 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Technical Database Specs Box */}
            <div className="mt-auto p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] space-y-1.5">
              <p className="text-[10px] uppercase font-bold text-cyan-400">Modo de Operação:</p>
              <div className="flex justify-between text-slate-400">
                <span>Engine:</span>
                <b className="text-slate-200">SQLite 3 (WAL Mode)</b>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Leitura/Escrita:</span>
                <b className="text-emerald-400">Direto no disco (.db)</b>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Integridade:</span>
                <b className="text-slate-200">ACID Transacional</b>
              </div>
            </div>
          </div>

          {/* Right Table Viewer (8 cols) */}
          <div className="md:col-span-8 flex flex-col bg-slate-950/90 rounded-xl border border-slate-800 overflow-hidden">
            {/* Table Header */}
            <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white font-mono uppercase">
                  Tabela: {selectedTable}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  (Exibindo {tableData.length} registros recentes)
                </span>
              </div>
            </div>

            {/* Table Rows Explorer */}
            <div className="flex-1 overflow-auto p-2">
              {loadingTable ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  Carregando dados da tabela...
                </div>
              ) : tableData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 py-10">
                  <FileSpreadsheet className="w-8 h-8 mb-2 opacity-40" />
                  Nenhum registro encontrado nesta tabela.
                </div>
              ) : (
                <div className="space-y-2">
                  {tableData.map((row, idx) => (
                    <div
                      key={row.id || idx}
                      className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 font-mono text-[11px] text-slate-300 overflow-x-auto hover:border-cyan-500/40 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[10px] text-cyan-400 font-bold mb-1.5 pb-1 border-b border-slate-800">
                        <span>Registro #{idx + 1} &bull; ID: {row.id || row.device_id || idx}</span>
                        <span className="text-slate-400 font-normal">{row.created_at || row.timestamp || ''}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                        {Object.entries(row).map(([key, val]) => (
                          <div key={key} className="truncate">
                            <span className="text-slate-500">{key}: </span>
                            <span className="text-slate-200">
                              {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Banco centralizado ativo: Todas as requisições gravam e leem de <b>scooter_link.db</b></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors cursor-pointer text-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
