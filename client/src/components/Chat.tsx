import { useState, useEffect, useRef } from 'react';
import Message, { type MessageRole } from './Message';
import Sources from './Sources';
import { sendMessage, type Source, type HistoryMessage } from '../services/api';
import { exportChatToPdf } from '../services/pdfGenerator';
import { generateDocx } from '../services/docxGenerator';
import { detectTemplate } from '../services/templateDetector';
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
      typeof m === 'object' && m !== null && 'role' in m && 'text' in m
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
  const [saved] = useState(loadChat);
  const [messages, setMessages] = useState<ChatMessage[]>(saved?.messages ?? []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(saved?.summary ?? null);
  const [summarizedUpTo, setSummarizedUpTo] = useState(saved?.summarizedUpTo ?? 0);
  const [quoteTooltip, setQuoteTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
          suggestedTemplate: detectTemplate(response.answer),
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

  async function handleExportPdf() {
    try {
      const pdfBytes = await exportChatToPdf(messages.map(m => ({ role: m.role, text: m.text, sources: m.sources })));
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shchyt-${new Date().toISOString().slice(0, 10)}.pdf`;
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
            <button onClick={очистити} className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer" title="Почати новий чат">Новий чат</button>
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
              AI друкує...
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
    </div>
  );
}
