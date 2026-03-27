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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? 'Помилка запиту');
  }

  return data as ChatResponse;
}
