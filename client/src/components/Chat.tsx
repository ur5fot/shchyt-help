import { useState, useEffect, useRef } from 'react';
import Message, { type MessageRole } from './Message';
import Sources from './Sources';
import { sendMessage, type Source, type HistoryMessage } from '../services/api';
import { exportChatToPdf } from '../services/pdfGenerator';
import { generateDocx } from '../services/docxGenerator';
// TODO: увімкнути коли шаблони будуть доопрацьовані
// import { detectTemplate } from '../services/templateDetector';
import FeedbackModal from './FeedbackModal';
import { ПІДКАЗКИ, МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ } from '../constants';

interface ChatMessage {
  role: MessageRole;
  text: string;
  sources?: Source[];
  verifiedSources?: number;
  suggestedTemplate?: string | null;
}

interface ChatState {
  messages: ChatMessage[];
  summary: string | null;
  summarizedUpTo: number;
}

const STORAGE_KEY = 'shchyt-chat';

function loadChat(): ChatState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatState;
    if (!Array.isArray(parsed.messages)) return null;
    if (!parsed.messages.every((m: unknown) =>
      typeof m === 'object' && m !== null && 'role' in m && 'text' in m &&
      ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
      typeof (m as ChatMessage).text === 'string'
    )) return null;
    if (typeof parsed.summarizedUpTo !== 'number' || parsed.summarizedUpTo < 0 || parsed.summarizedUpTo > parsed.messages.length) return null;
    if (parsed.summary !== null && typeof parsed.summary !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveChat(state: ChatState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // QuotaExceededError — ігноруємо
  }
}

export default function Chat() {
  const [initialState] = useState(loadChat);
  const [messages, setMessages] = useState<ChatMessage[]>(initialState?.messages ?? []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(initialState?.summary ?? null);
  const [summarizedUpTo, setSummarizedUpTo] = useState(initialState?.summarizedUpTo ?? 0);
  const [quoteTooltip, setQuoteTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [showPrivacyWarning, setShowPrivacyWarning] = useState(() => !localStorage.getItem('shchyt-privacy-accepted'));
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Індикатор прогресу — змінює текст по таймеру під час очікування
  useEffect(() => {
    if (!loading) { setLoadingStatus(''); return; }
    const start = Date.now();
    const stages = [
      { after: 0, text: '🔍 Пошук у базі законів...' },
      { after: 6000, text: '⚖️ Аналіз релевантних норм...' },
      { after: 16000, text: '🤔 Формування відповіді...' },
      { after: 30000, text: '📝 Перевірка цитат...' },
      { after: 50000, text: '⏳ Майже готово...' },
    ];
    setLoadingStatus(stages[0].text);
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const current = [...stages].reverse().find(s => elapsed >= s.after);
      if (current) setLoadingStatus(current.text);
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (messages.length > 0) {
      saveChat({ messages, summary, summarizedUpTo });
    }
  }, [messages, summary, summarizedUpTo]);

  function очистити() {
    setMessages([]);
    setSummary(null);
    setSummarizedUpTo(0);
    setInput('');
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  useEffect(() => {
    const area = chatAreaRef.current;
    if (!area) return;
    function handleMouseUp() {
      if (!area) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) { setQuoteTooltip(null); return; }
      const anchor = sel.anchorNode?.parentElement?.closest('[data-role="assistant"]');
      const focus = sel.focusNode?.parentElement?.closest('[data-role="assistant"]');
      if (!anchor || anchor !== focus) { setQuoteTooltip(null); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const chatRect = area.getBoundingClientRect();
      setQuoteTooltip({ text: sel.toString().trim(), x: rect.left - chatRect.left + rect.width / 2, y: rect.top - chatRect.top + area.scrollTop - 8 });
    }
    function handleClear() { const s = window.getSelection(); if (!s || s.isCollapsed) setQuoteTooltip(null); }
    area.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleClear);
    return () => { area.removeEventListener('mouseup', handleMouseUp); document.removeEventListener('selectionchange', handleClear); };
  }, []);

  function handleQuote(text: string) {
    setInput((prev) => (prev ? `${prev} > ${text}` : `> ${text} `));
    setQuoteTooltip(null);
    window.getSelection()?.removeAllRanges();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleSend(text: string) {
    if (loading) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // Відправляємо тільки повідомлення після останнього стиснення
      const history: HistoryMessage[] = messages.slice(summarizedUpTo).map((msg) => ({
        role: msg.role,
        content: msg.text,
      }));

      const response = await sendMessage(trimmed, history, summary ?? undefined);

      if (response.summary) {
        setSummary(response.summary);
        // Стиснення покриває тільки history, яка була messages.slice(summarizedUpTo) зі стану до цього виклику.
        // Поточний user+assistant turn ще не стиснений — він потрапить у наступний history.
        setSummarizedUpTo(messages.length);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: response.answer,
          sources: response.sources,
          verifiedSources: response.verifiedSources,
          // TODO: увімкнути коли шаблони будуть доопрацьовані
          // suggestedTemplate: detectTemplate(response.answer),
          suggestedTemplate: null,
        },
      ]);
    } catch (err) {
      // Видаляємо user-повідомлення без відповіді — інакше порушиться чергування ролей
      setMessages((prev) => prev.slice(0, -1));
      const message = err instanceof Error ? err.message : 'Невідома помилка';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend(input);
    }
  }

  function summarizeChat(): string {
    const firstUserMsg = messages.find(m => m.role === 'user')?.text ?? '';
    return firstUserMsg
      .replace(/[?!.,;:()«»"'/\\]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 4)
      .join('-')
      .toLowerCase()
      .replace(/[^а-яіїєґa-z0-9-]/g, '')
      .slice(0, 50) || 'бесіда';
  }

  async function handleExportPdf() {
    try {
      const pdfBytes = await exportChatToPdf(messages.map(m => ({ role: m.role, text: m.text, sources: m.sources })));
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shchyt-${new Date().toISOString().slice(0, 10)}-${summarizeChat()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { console.error('PDF export failed', err); setError('Не вдалося згенерувати PDF'); }
  }

  async function handleDownloadDocx(templateId: string) {
    try {
      const blob = await generateDocx(templateId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateId}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { console.error('docx generation failed', err); setError('Не вдалося згенерувати документ'); }
  }

  function handleПідказка(підказка: string) {
    void handleSend(підказка);
  }

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <span className="font-semibold text-gray-100">Shchyt ⚖️</span>
        <span className="text-gray-500 text-sm flex-1">AI-асистент з прав військовослужбовців</span>
        {messages.length > 0 && (
          <>
            <button onClick={() => void handleExportPdf()} className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer" title="Зберегти бесіду в PDF">PDF</button>
            <button onClick={() => setShowFeedback(true)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer" title="Зворотній зв'язок">Відгук</button>
            <button onClick={() => setShowNewChatConfirm(true)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer" title="Почати новий чат">Новий чат</button>
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 relative" ref={chatAreaRef}>
        {messages.map((msg, i) => (
          <div key={i}>
            <Message role={msg.role} text={msg.text} />
            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
              <Sources sources={msg.sources} verifiedSources={msg.verifiedSources} />
            )}
            {msg.role === 'assistant' && msg.suggestedTemplate && (
              <div className="mb-3">
                <button
                  onClick={() => void handleDownloadDocx(msg.suggestedTemplate!)}
                  className="text-sm px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-blue-400 hover:text-blue-300 rounded-xl border border-gray-700 transition-colors"
                  data-testid="download-docx-button"
                >
                  📄 {msg.suggestedTemplate === 'skarga' ? 'Завантажити скаргу (.docx)' : 'Завантажити рапорт (.docx)'}
                </button>
              </div>
            )}
          </div>
        ))}

        {isEmpty && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 text-center">
              Типові питання
            </p>
            <ul className="flex flex-col gap-2">
              {ПІДКАЗКИ.map((підказка) => (
                <li key={підказка}>
                  <button
                    onClick={() => handleПідказка(підказка)}
                    className="w-full text-left px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors cursor-pointer"
                    data-testid="підказка"
                  >
                    {підказка}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading && (
          <div className="flex justify-start mb-3">
            <div className="bg-gray-800 text-gray-400 px-4 py-3 rounded-2xl rounded-bl-sm text-sm">
              {loadingStatus || 'AI друкує...'}
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start mb-3">
            <div className="bg-red-900 text-red-200 px-4 py-3 rounded-2xl text-sm">
              {error}
            </div>
          </div>
        )}

        {quoteTooltip && (
          <button
            onClick={() => handleQuote(quoteTooltip.text)}
            className="absolute z-10 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg shadow-lg -translate-x-1/2 -translate-y-full cursor-pointer"
            style={{ left: quoteTooltip.x, top: quoteTooltip.y }}
          >
            Цитувати
          </button>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-gray-800">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ}
            rows={input.includes('\n') ? Math.min(input.split('\n').length, 4) : 1}
            placeholder="Введіть ваше питання..."
            className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 resize-none"
          />
          <button
            onClick={() => void handleSend(input)}
            disabled={loading}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Надіслати
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-gray-600">
          ⚠️ Це не юридична консультація. Для прийняття рішень зверніться до військового адвоката.
        </p>
      </div>
      {showNewChatConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="mx-4 max-w-sm rounded-2xl bg-gray-900 border border-gray-700 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-100 mb-3">Новий чат</h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-5">
              Поточну бесіду буде видалено. Бажаєте спочатку зберегти її в PDF?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { void handleExportPdf(); очистити(); setShowNewChatConfirm(false); }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors cursor-pointer"
              >
                📄 Зберегти в PDF і почати новий
              </button>
              <button
                onClick={() => { очистити(); setShowNewChatConfirm(false); }}
                className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Почати новий без збереження
              </button>
              <button
                onClick={() => setShowNewChatConfirm(false)}
                className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors cursor-pointer"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {showFeedback && (
        <FeedbackModal
          onClose={() => setShowFeedback(false)}
          onExportPdf={() => exportChatToPdf(messages.map(m => ({ role: m.role, text: m.text, sources: m.sources })))}
        />
      )}

      {showPrivacyWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="mx-4 max-w-md rounded-2xl bg-gray-900 border border-gray-700 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-100 mb-3">🛡️ Безпека даних</h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-4">
              Не вводьте особисту інформацію: позивний, номер частини, місце дислокації, прізвище командира, координати.
            </p>
            <p className="text-gray-400 text-sm leading-relaxed mb-5">
              Формулюйте питання загально — наприклад, «як звільнитися за контрактом» замість «я Петренко з в/ч А1234, як мені звільнитися».
            </p>
            <button
              onClick={() => { localStorage.setItem('shchyt-privacy-accepted', '1'); setShowPrivacyWarning(false); }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Зрозуміло
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
