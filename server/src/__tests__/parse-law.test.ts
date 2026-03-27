import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseLawHtml, parseLaw } from '../../../scripts/parse-law';

// Мінімальний HTML що імітує структуру zakon.rada.gov.ua
const SAMPLE_HTML = `
<html>
<head><title>Тестовий закон</title></head>
<body>
<h1>Закон України «Тестовий закон»</h1>
<div class="b-textof-document">
  <p>Стаття 1. Загальні положення</p>
  <p>1. Цей Закон регулює відносини у сфері військової служби України.</p>
  <p>2. Дія цього Закону поширюється на всіх військовослужбовців Збройних Сил України.</p>
  <p>Стаття 2. Визначення термінів</p>
  <p>1. У цьому Законі терміни вживаються в такому значенні:</p>
  <p>2. Військова служба — державна служба особливого характеру.</p>
  <p>Стаття 3. Мобілізація та демобілізація</p>
  <p>1. Мобілізація проводиться у разі збройної агресії проти України або загрози нападу.</p>
  <p>2. Строки мобілізації встановлюються Президентом України.</p>
</div>
</body>
</html>
`;

describe('parseLawHtml', () => {
  it('повертає структуру LawFile з правильними полями', () => {
    const result = parseLawHtml(SAMPLE_HTML, 'https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('short_title', 'Тестовий закон');
    expect(result).toHaveProperty('source_url', 'https://zakon.rada.gov.ua/laws/show/test');
    expect(result).toHaveProperty('last_updated');
    expect(result).toHaveProperty('chunks');
    expect(Array.isArray(result.chunks)).toBe(true);
  });

  it('парсить статті на чанки', () => {
    const result = parseLawHtml(SAMPLE_HTML, 'https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    expect(result.chunks.length).toBeGreaterThan(0);
    const articles = result.chunks.map(c => c.article);
    expect(articles.some(a => a.includes('Стаття 1'))).toBe(true);
    expect(articles.some(a => a.includes('Стаття 2'))).toBe(true);
  });

  it('кожен чанк має обов\'язкові поля', () => {
    const result = parseLawHtml(SAMPLE_HTML, 'https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    for (const chunk of result.chunks) {
      expect(typeof chunk.id).toBe('string');
      expect(chunk.id.length).toBeGreaterThan(0);
      expect(typeof chunk.article).toBe('string');
      expect(chunk.article.length).toBeGreaterThan(0);
      expect(typeof chunk.part).toBe('string');
      expect(typeof chunk.text).toBe('string');
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(Array.isArray(chunk.keywords)).toBe(true);
    }
  });

  it('витягає title статті з її заголовку', () => {
    const result = parseLawHtml(SAMPLE_HTML, 'https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    const st1 = result.chunks.find(c => c.article === 'Стаття 1');
    expect(st1).toBeDefined();
    expect(st1!.title).toBe('Загальні положення');
  });

  it('part містить номер частини для пронумерованих абзаців', () => {
    const result = parseLawHtml(SAMPLE_HTML, 'https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    const numberedParts = result.chunks.filter(c => c.part !== '');
    expect(numberedParts.length).toBeGreaterThan(0);
    expect(numberedParts.some(c => c.part.includes('1'))).toBe(true);
  });

  it('генерує keywords зі значущих слів тексту', () => {
    const result = parseLawHtml(SAMPLE_HTML, 'https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    for (const chunk of result.chunks) {
      expect(chunk.keywords.length).toBeGreaterThan(0);
      for (const kw of chunk.keywords) {
        expect(typeof kw).toBe('string');
        expect(kw.length).toBeGreaterThan(0);
      }
    }
  });

  it('id кожного чанку унікальний', () => {
    const result = parseLawHtml(SAMPLE_HTML, 'https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    const ids = result.chunks.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('last_updated має формат YYYY-MM-DD', () => {
    const result = parseLawHtml(SAMPLE_HTML, 'https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    expect(result.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('стаття з ключовим словом мобілізація має відповідний keyword', () => {
    const result = parseLawHtml(SAMPLE_HTML, 'https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    const mobChunks = result.chunks.filter(c => c.article === 'Стаття 3');
    expect(mobChunks.length).toBeGreaterThan(0);
    const hasMob = mobChunks.some(c =>
      c.keywords.some(k => k.toLowerCase().includes('мобілізац'))
    );
    expect(hasMob).toBe(true);
  });
});

describe('parseLawHtml — edge cases', () => {
  it('кидає помилку для порожньої сторінки', () => {
    expect(() => parseLawHtml('', 'https://zakon.rada.gov.ua/test', 'Тест')).toThrow();
  });

  it('кидає помилку для порожнього рядка', () => {
    expect(() => parseLawHtml('   ', 'https://zakon.rada.gov.ua/test', 'Тест')).toThrow();
  });

  it('повертає порожній масив чанків для HTML без статей', () => {
    const html = '<html><body><p>Просто текст без статей</p></body></html>';
    const result = parseLawHtml(html, 'https://zakon.rada.gov.ua/test', 'Тест');
    expect(result.chunks).toEqual([]);
  });

  it('коректно обробляє статтю без частин', () => {
    const html = `<html><body>
      <p>Стаття 5. Виняткова стаття</p>
      <p>Ця стаття містить один нерозбитий текст без нумерації частин.</p>
    </body></html>`;

    const result = parseLawHtml(html, 'https://zakon.rada.gov.ua/test', 'Тест');
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0].article).toBe('Стаття 5');
  });
});

describe('parseLaw', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('викликає fetch з правильним URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_HTML,
    });
    vi.stubGlobal('fetch', mockFetch);

    await parseLaw('https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    expect(mockFetch).toHaveBeenCalledWith('https://zakon.rada.gov.ua/laws/show/test');
  });

  it('повертає розпарсений закон', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_HTML,
    }));

    const result = await parseLaw('https://zakon.rada.gov.ua/laws/show/test', 'Тестовий закон');

    expect(result.short_title).toBe('Тестовий закон');
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('кидає помилку при HTTP помилці (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }));

    await expect(parseLaw('https://zakon.rada.gov.ua/laws/show/невалідний', 'Тест'))
      .rejects.toThrow('404');
  });

  it('кидає помилку при мережевій помилці', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await expect(parseLaw('https://zakon.rada.gov.ua/laws/show/test', 'Тест'))
      .rejects.toThrow('Network error');
  });
});
