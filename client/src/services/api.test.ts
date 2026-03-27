import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMessage } from './api';

describe('sendMessage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('надсилає POST-запит на /api/chat з текстом повідомлення', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ answer: 'Відповідь', sources: [] }),
    } as Response);

    await sendMessage('Яке моє право на відпустку?');

    expect(mockFetch).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Яке моє право на відпустку?' }),
    });
  });

  it('повертає відповідь та джерела', async () => {
    const mockFetch = vi.mocked(fetch);
    const mockResponse = {
      answer: 'Згідно зі статтею 10...',
      sources: [{ law: 'ЗУ про соцзахист', article: 'Стаття 10', sourceUrl: 'https://zakon.rada.gov.ua' }],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await sendMessage('Яке моє право?');

    expect(result).toEqual(mockResponse);
  });

  it('кидає помилку при HTTP-помилці (4xx/5xx)', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Помилка сервера' }),
    } as Response);

    await expect(sendMessage('Питання')).rejects.toThrow('Помилка сервера');
  });

  it('кидає помилку при мережевій помилці', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(sendMessage('Питання')).rejects.toThrow('Network error');
  });

  it('кидає загальну помилку якщо сервер не повертає error', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({}),
    } as Response);

    await expect(sendMessage('Питання')).rejects.toThrow('Помилка запиту');
  });
});
