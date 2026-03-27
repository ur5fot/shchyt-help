import { useState } from 'react';
import { generatePdf } from '../services/pdfGenerator';

import raportNevyplata from '../../../templates/raport-nevyplata.json';
import raportVidpustka from '../../../templates/raport-vidpustka.json';
import skarga from '../../../templates/skarga.json';

interface TemplateField {
  id: string;
  label: string;
  type: 'text' | 'select';
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

interface Template {
  id: string;
  type: string;
  title: string;
  fields: TemplateField[];
  template_text: string;
  note: string;
}

const ШАБЛОНИ: Record<string, Template> = {
  'raport-nevyplata': raportNevyplata as Template,
  'raport-vidpustka': raportVidpustka as Template,
  skarga: skarga as Template,
};

interface DocGeneratorProps {
  templateId: string;
  onClose: () => void;
}

export default function DocGenerator({ templateId, onClose }: DocGeneratorProps) {
  const template = ШАБЛОНИ[templateId];

  const initialValues = Object.fromEntries(
    (template?.fields ?? []).map((f) => [f.id, f.type === 'select' ? (f.options?.[0] ?? '') : ''])
  );

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!template) {
    return (
      <div className="p-4 text-red-400">
        Шаблон не знайдено: {templateId}
      </div>
    );
  }

  function handleChange(id: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
    setError(null);
  }

  async function handleGenerate() {
    // Валідація обов'язкових полів
    const requiredFields = template.fields.filter((f) => f.required);
    const missing = requiredFields.filter((f) => !values[f.id]?.trim());
    if (missing.length > 0) {
      setError("Заповніть усі обов'язкові поля");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const pdfBytes = await generatePdf(template.template_text, values);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка генерації PDF');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-lg w-full">
      <h2 className="text-base font-semibold text-gray-100 mb-4">{template.title}</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleGenerate();
        }}
        className="flex flex-col gap-3"
      >
        {template.fields.map((field) => (
          <div key={field.id} className="flex flex-col gap-1">
            <label
              htmlFor={`field-${field.id}`}
              className="text-xs text-gray-400"
            >
              {field.label}
              {field.required && <span className="text-red-400 ml-1">*</span>}
            </label>

            {field.type === 'select' ? (
              <select
                id={`field-${field.id}`}
                value={values[field.id] ?? ''}
                onChange={(e) => handleChange(field.id, e.target.value)}
                className="bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
              >
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`field-${field.id}`}
                type="text"
                value={values[field.id] ?? ''}
                onChange={(e) => handleChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="bg-gray-800 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
              />
            )}
          </div>
        ))}

        {error && (
          <p className="text-red-400 text-xs">{error}</p>
        )}

        <p className="text-xs text-gray-500 italic mt-1">{template.note}</p>

        <div className="flex gap-2 mt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Генерація...' : 'Згенерувати PDF'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-xl transition-colors"
          >
            Скасувати
          </button>
        </div>
      </form>
    </div>
  );
}
