import type { Source } from '../services/api';

interface SourcesProps {
  sources: Source[];
}

export default function Sources({ sources }: SourcesProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2 px-4 py-3 bg-gray-850 border border-gray-700 rounded-xl text-xs text-gray-400">
      <p className="font-semibold text-gray-500 uppercase tracking-wide mb-2">Джерела</p>
      <ul className="flex flex-col gap-1">
        {sources.map((джерело, i) => (
          <li key={i}>
            <a
              href={джерело.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              {джерело.article}
            </a>
            <span className="text-gray-600"> — {джерело.law}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
