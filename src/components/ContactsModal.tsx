import React, { useState } from 'react';
import { AuthorizedContact } from '../types';
import {
  Users,
  Plus,
  Trash2,
  Phone,
  MessageSquare,
  Send,
  CheckCircle2,
  X,
} from 'lucide-react';

interface ContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: AuthorizedContact[];
  onAddContact: (contact: Partial<AuthorizedContact>) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
}

export const ContactsModal: React.FC<ContactsModalProps> = ({
  isOpen,
  onClose,
  contacts,
  onAddContact,
  onDeleteContact,
}) => {
  if (!isOpen) return null;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [notifySms, setNotifySms] = useState(true);
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testSent, setTestSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    setIsSubmitting(true);
    try {
      await onAddContact({
        name: name.trim(),
        phone: phone.trim(),
        telegramChatId: telegramChatId.trim(),
        notifySms,
        notifyCall: false,
        notifyTelegram,
      });

      setName('');
      setPhone('');
      setTelegramChatId('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendTestSms = () => {
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div
        id="contacts-modal-content"
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl glass-panel-neon border border-emerald-500/40 p-5 md:p-6 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Contatos Autorizados</h2>
              <p className="text-xs text-slate-400">
                Pessoas que recebem SMS e avisos em caso de roubo
              </p>
            </div>
          </div>
          <button
            id="btn-close-contacts-modal"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="my-4 space-y-5 overflow-y-auto pr-1">
          {/* Add Contact Form */}
          <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Adicionar Contato de Emergência
            </h3>

            <div>
              <label className="text-[11px] text-slate-300 font-medium">Nome do Contato</label>
              <input
                id="input-contact-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Gustavo (Proprietário)"
                className="w-full mt-1 px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-400 transition-colors"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-300 font-medium">Telefone / WhatsApp</label>
                <input
                  id="input-contact-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+55 (61) 99999-9999"
                  className="w-full mt-1 px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-400"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-300 font-medium">Telegram Chat ID (Opcional)</label>
                <input
                  id="input-contact-telegram"
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="Ex: 123456789"
                  className="w-full mt-1 px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-400"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifySms}
                  onChange={(e) => setNotifySms(e.target.checked)}
                  className="accent-emerald-400 rounded"
                />
                <span>SMS SIM800L</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyTelegram}
                  onChange={(e) => setNotifyTelegram(e.target.checked)}
                  className="accent-emerald-400 rounded"
                />
                <span>Telegram Bot</span>
              </label>
            </div>

            <button
              id="btn-submit-contact"
              type="submit"
              disabled={isSubmitting || !name.trim() || !phone.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Salvando...' : 'Salvar Contato'}
            </button>
          </form>

          {/* Contact List */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Lista de Telefones ({contacts.length})
              </h4>
              <button
                id="btn-test-alert-sms"
                onClick={handleSendTestSms}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
              >
                <Send className="w-3 h-3" />
                {testSent ? 'SMS de teste simulado!' : 'Testar Envio SMS'}
              </button>
            </div>

            {contacts.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Nenhum contato cadastrado ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-bold text-white flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        {contact.name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono-digits">
                        {contact.phone} {contact.telegramChatId ? `• TG: ${contact.telegramChatId}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                        {contact.notifySms ? 'SMS' : ''} {contact.notifyTelegram ? '+ TG' : ''}
                      </span>
                      <button
                        id={`btn-delete-contact-${contact.id}`}
                        onClick={() => onDeleteContact(contact.id)}
                        className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Excluir contato"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
