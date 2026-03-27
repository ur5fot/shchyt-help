export interface Source {
  law: string;
  article: string;
  sourceUrl: string;
}

export interface ChatResponse {
  answer: string;
  sources: Source[];
}

export async function sendMessage(message: string): Promise<ChatResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
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
