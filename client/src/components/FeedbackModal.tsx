import { useState, useRef } from 'react';

interface FeedbackModalProps {
  onClose: () => void;
  onExportPdf: () => Promise<Uint8Array>;
}

type FeedbackType = 'good' | 'bad' | 'suggestion';

export default function FeedbackModal({ onClose, onExportPdf }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [message, setMessage] = useState('');
  const [attachPdf, setAttachPdf] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [customPdf, setCustomPdf] = useState<{ name: string; base64: string } | null>(null);

  async function handleSend() {
    if (message.trim().length < 5) { setError('Напишіть хоча б кілька слів'); return; }
    setSending(true);
    setError('');

    try {
      let pdfBase64: string | undefined;
      let pdfFilename: string | undefined;

      if (customPdf) {
        pdfBase64 = customPdf.base64;
        pdfFilename = customPdf.name;
      } else if (attachPdf) {
        const bytes = await onExportPdf();
        // chunk-based btoa — spread operator не витримує великих масивів
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        pdfBase64 = btoa(binary);
        pdfFilename = `shchyt-${new Date().toISOString().slice(0, 10)}.pdf`;
      }

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, type, pdfBase64, pdfFilename }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Помилка відправки');
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка відправки');
    } finally {
      setSending(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.pdf')) { setError('Тільки PDF файли'); return; }
    if (file.size > 5_000_000) { setError('Файл занадто великий (макс. 5MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setCustomPdf({ name: file.name, base64 });
      setAttachPdf(false);
    };
    reader.readAsDataURL(file);
  }

  if (sent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="mx-4 max-w-sm rounded-2xl bg-gray-900 border border-gray-700 p-6 shadow-2xl text-center">
          <p className="text-2xl mb-2">✅</p>
          <p className="text-gray-200 mb-4">Дякуємо за зворотній зв'язок!</p>
          <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer">OK</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="mx-4 max-w-md w-full rounded-2xl bg-gray-900 border border-gray-700 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">Зворотній зв'язок</h2>

        <div className="flex gap-2 mb-4">
          {([['good', '👍 Корисно'], ['bad', '👎 Некорисно'], ['suggestion', '💡 Пропозиція']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${type === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Опишіть що було добре, що не так, або що можна покращити..."
          className="w-full h-24 bg-gray-800 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 resize-none mb-3"
          maxLength={5000}
        />

        <div className="mb-3 space-y-2">
          <p className="text-xs text-gray-500">📎 Додати PDF (необов'язково):</p>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input type="checkbox" checked={attachPdf} onChange={e => { setAttachPdf(e.target.checked); setCustomPdf(null); }} className="rounded" />
            Прикріпити поточну бесіду
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => fileRef.current?.click()} className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">
              або завантажити свій PDF
            </button>
            {customPdf && <span className="text-xs text-gray-500">{customPdf.name}</span>}
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
          </div>
          <p className="text-[10px] text-gray-600">Збережіть бесіду в PDF (кнопка PDF у шапці) і завантажте сюди, або поставте галочку вище.</p>
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors cursor-pointer"
          >
            {sending ? 'Відправляю...' : 'Відправити'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl transition-colors cursor-pointer">
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}
