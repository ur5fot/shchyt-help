import { useState, useEffect, useRef } from 'react';
import Message, { type MessageRole } from './Message';
import Sources from './Sources';
import DocGenerator from './DocGenerator';
import { sendMessage, type Source, type HistoryMessage } from '../services/api';
import { detectTemplate } from '../services/templateDetector';
import { ПІДКАЗКИ, МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ } from '../constants';

interface ChatMessage {
  role: MessageRole;
  text: string;
  sources?: Source[];
  suggestedTemplate?: string | null;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDocTemplate, setActiveDocTemplate] = useState<{ msgIndex: number; templateId: string } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizedUpTo, setSummarizedUpTo] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend(input);
    }
  }

  function handleПідказка(підказка: string) {
    setInput(підказка);
  }

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <span className="font-semibold text-gray-100">Shchyt ⚖️</span>
        <span className="text-gray-500 text-sm">AI-асистент з прав військовослужбовців</span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg, i) => (
          <div key={i}>
            <Message role={msg.role} text={msg.text} />
            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
              <Sources sources={msg.sources} />
            )}
            {msg.role === 'assistant' && msg.suggestedTemplate && (
              <div className="mb-3">
                {activeDocTemplate?.msgIndex === i ? (
                  <DocGenerator
                    templateId={activeDocTemplate.templateId}
                    onClose={() => setActiveDocTemplate(null)}
                  />
                ) : (
                  <button
                    onClick={() =>
                      setActiveDocTemplate({ msgIndex: i, templateId: msg.suggestedTemplate! })
                    }
                    className="text-sm px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-blue-400 hover:text-blue-300 rounded-xl border border-gray-700 transition-colors"
                    data-testid="generate-doc-button"
                  >
                    📄 {msg.suggestedTemplate === 'skarga' ? 'Згенерувати скаргу' : 'Згенерувати рапорт'}
                  </button>
                )}
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
                    className="w-full text-left px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
                    data-testid="підказка"
                  >
                    {підказка}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-center text-xs text-gray-600">
              ⚠️ Це не юридична консультація. Для прийняття рішень зверніться до військового адвоката.
            </p>
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

        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ}
            placeholder="Введіть ваше питання..."
            className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            onClick={() => void handleSend(input)}
            disabled={loading}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Надіслати
          </button>
        </div>
      </div>
    </div>
  );
}
