export interface Source {
  law: string;
  article: string;
  sourceUrl: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  answer: string;
  sources: Source[];
  summary?: string;
}

export async function sendMessage(
  message: string,
  history?: HistoryMessage[],
  summary?: string,
): Promise<ChatResponse> {
  const body: Record<string, unknown> = { message };
  if (history && history.length > 0) body.history = history;
  if (summary) body.summary = summary;

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMessage = `Помилка запиту (${response.status})`;
    try {
      const data = await response.json();
      errorMessage = data.error ?? errorMessage;
    } catch {
      // відповідь не є JSON (наприклад, HTML від проксі)
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data as ChatResponse;
}
