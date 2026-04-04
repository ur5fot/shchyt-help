import type { Source } from '../services/api';

interface SourcesProps {
  sources: Source[];
  verifiedSources?: number;
}

export default function Sources({ sources, verifiedSources }: SourcesProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2 mb-3 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-xs text-gray-400">
      <div className="flex items-center justify-between mb-2">
        <p className="font-semibold text-gray-500 uppercase tracking-wide">Джерела</p>
        {verifiedSources != null && verifiedSources > 0 && (
          <span className="text-green-500">&#10003; Перевірено: {verifiedSources} {(() => { const n = verifiedSources % 100; const d = n % 10; if (n >= 11 && n <= 19) return 'джерел'; if (d === 1) return 'джерело'; if (d >= 2 && d <= 4) return 'джерела'; return 'джерел'; })()}</span>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {sources.map((джерело, i) => (
          <li key={i}>
            <div>
              {джерело.sourceUrl.startsWith('http') ? (
                <a
                  href={джерело.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {джерело.article}
                </a>
              ) : (
                <span className="text-blue-400">{джерело.article}</span>
              )}
              <span className="text-gray-600"> — {джерело.law}</span>
              {джерело.documentId && (
                <span className="text-gray-600"> ({джерело.documentId})</span>
              )}
              {джерело.lastUpdated && (
                <span className="text-gray-500 text-xs ml-1">ред. {джерело.lastUpdated}</span>
              )}
            </div>
            {джерело.quote && (
              <p className="text-gray-600 mt-0.5 italic line-clamp-2">«{джерело.quote}»</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
