import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseLawHtml, parseLaw, extractKeywords } from '../../../scripts/parse-law';

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

// HTML що імітує положення/постанову з пунктами замість статей
const PUNKT_HTML = `
<html>
<head><title>Тестове положення</title></head>
<body>
<h1>Положення про тестове</h1>
<div>
  <p>I. Загальні положення</p>
  <p>1. Це Положення визначає порядок проходження військової служби в Україні.</p>
  <p>2. Дія цього Положення поширюється на всіх військовослужбовців.</p>
  <p>II. Порядок укладення контракту</p>
  <p>3. Контракт укладається між громадянином та відповідним командиром.</p>
  <p>XVI. Грошове забезпечення та виплати</p>
  <p>4. Грошове забезпечення нараховується з дня зарахування на службу.</p>
  <p>XXVIII. Додаткові гарантії військовослужбовцям</p>
  <p>5. Військовослужбовцям надаються додаткові соціальні гарантії відповідно до закону.</p>
</div>
</body>
</html>
`;

// HTML з редакційними примітками
const EDITORIAL_HTML = `
<html>
<body>
<h1>Закон з примітками</h1>
<div>
  <p>Стаття 1. Загальні положення</p>
  <p>1. Цей Закон регулює відносини щодо проходження військової служби.</p>
  <p>{Частину другу статті 1 виключено на підставі Закону № 1234-IX}</p>
  <p>3. Третя частина залишається чинною та регулює відносини.</p>
</div>
</body>
</html>
`;

// HTML з Прикінцевими положеннями
const PRYKINTSEVI_HTML = `
<html>
<body>
<h1>Закон з прикінцевими</h1>
<div>
  <p>Стаття 1. Загальні положення</p>
  <p>1. Цей Закон регулює відносини щодо проходження військової служби.</p>
  <p>Прикінцеві положення</p>
  <p>1. Цей Закон набирає чинності з дня опублікування та застосовується.</p>
</div>
</body>
</html>
`;

// HTML з HTML-ентітями
const ENTITIES_HTML = `
<html>
<body>
<h1>Закон з ентітями</h1>
<div>
  <p>Стаття 1. Медичні показники</p>
  <p>1. Підвищення АЛТ &ge; 10 верхніх меж норми та загальний білок &le; 50 г/л &mdash; ознака важкого перебігу.</p>
</div>
</body>
</html>
`;

describe('parseLawHtml — пункт-based документи', () => {
  it('парсить пункти з розділами', () => {
    const result = parseLawHtml(PUNKT_HTML, 'https://zakon.rada.gov.ua/test', 'Тестове положення');

    expect(result.chunks.length).toBe(5);
    expect(result.chunks[0].article).toBe('Пункт 1');
    expect(result.chunks[0].part).toBe('Розділ I');
    expect(result.chunks[2].article).toBe('Пункт 3');
    expect(result.chunks[2].part).toBe('Розділ II');
  });

  it('розпізнає розділ XVI (римські числа з V після X)', () => {
    const result = parseLawHtml(PUNKT_HTML, 'https://zakon.rada.gov.ua/test', 'Тестове положення');

    const xvi = result.chunks.find(c => c.part === 'Розділ XVI');
    expect(xvi).toBeDefined();
    expect(xvi!.article).toBe('Пункт 4');
  });

  it('розпізнає розділ XXVIII (високі римські числа)', () => {
    const result = parseLawHtml(PUNKT_HTML, 'https://zakon.rada.gov.ua/test', 'Тестове положення');

    const xxviii = result.chunks.find(c => c.part === 'Розділ XXVIII');
    expect(xxviii).toBeDefined();
    expect(xxviii!.article).toBe('Пункт 5');
  });

  it('id чанків пункт-based документу унікальні', () => {
    const result = parseLawHtml(PUNKT_HTML, 'https://zakon.rada.gov.ua/test', 'Тестове положення');

    const ids = result.chunks.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id містить номер пункту та розділ', () => {
    const result = parseLawHtml(PUNKT_HTML, 'https://zakon.rada.gov.ua/test', 'Тестове положення');

    expect(result.chunks[0].id).toContain('-p1-');
    expect(result.chunks[0].id).toContain('-rI-');
  });
});

describe('parseLawHtml — редакційні примітки', () => {
  it('фільтрує текст у фігурних дужках', () => {
    const result = parseLawHtml(EDITORIAL_HTML, 'https://zakon.rada.gov.ua/test', 'Тест');

    const allText = result.chunks.map(c => c.text).join(' ');
    expect(allText).not.toContain('виключено');
    expect(allText).not.toContain('{');
  });
});

describe('parseLawHtml — Прикінцеві положення', () => {
  it('парсить Прикінцеві положення як окремий чанк', () => {
    const result = parseLawHtml(PRYKINTSEVI_HTML, 'https://zakon.rada.gov.ua/test', 'Тест');

    const pp = result.chunks.find(c => c.article === 'Прикінцеві положення');
    expect(pp).toBeDefined();
    expect(pp!.text).toContain('набирає чинності');
  });
});

describe('parseLawHtml — HTML ентітї', () => {
  it('декодує HTML ентітї в тексті чанків', () => {
    const result = parseLawHtml(ENTITIES_HTML, 'https://zakon.rada.gov.ua/test', 'Тест');

    const text = result.chunks[0].text;
    expect(text).toContain('\u2265'); // ≥
    expect(text).toContain('\u2264'); // ≤
    expect(text).toContain('\u2014'); // —
    expect(text).not.toContain('&ge;');
    expect(text).not.toContain('&le;');
    expect(text).not.toContain('&mdash;');
  });
});

describe('parseLawHtml — дедуплікація ID', () => {
  it('додає суфікс -d1 до дублікатних ID', () => {
    // Два розділи з однаковим пунктом 1 — створюють дублікатні базові ID
    const html = `
    <html><body><h1>Постанова з додатками</h1>
    <p>I. Перший додаток</p>
    <p>1. Текст першого пункту першого додатку, достатньо довгий щоб пройти фільтр.</p>
    <p>II. Другий додаток</p>
    <p>1. Текст першого пункту другого додатку, достатньо довгий щоб пройти фільтр.</p>
    </body></html>`;

    const result = parseLawHtml(html, 'https://zakon.rada.gov.ua/test', 'Тест');

    expect(result.chunks.length).toBe(2);
    const ids = result.chunks.map(c => c.id);
    // ID повинні бути різними завдяки різним розділам (rI vs rII)
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('parseLaw — /print fallback', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('спробує /print URL якщо основна сторінка дала 0 чанків', async () => {
    const emptyHtml = '<html><body><p>Порожня сторінка без статей</p></body></html>';
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => emptyHtml })
      .mockResolvedValueOnce({ ok: true, text: async () => SAMPLE_HTML });
    vi.stubGlobal('fetch', mockFetch);

    const result = await parseLaw('https://zakon.rada.gov.ua/laws/show/test', 'Тест');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toContain('/print');
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('повертає 0 чанків якщо і /print не допоміг', async () => {
    const emptyHtml = '<html><body><p>Порожня сторінка без статей</p></body></html>';
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => emptyHtml })
      .mockResolvedValueOnce({ ok: true, text: async () => emptyHtml });
    vi.stubGlobal('fetch', mockFetch);

    const result = await parseLaw('https://zakon.rada.gov.ua/laws/show/test', 'Тест');

    expect(result.chunks).toEqual([]);
  });
});

describe('extractKeywords', () => {
  it('повертає ключові слова зі значущих слів', () => {
    const kw = extractKeywords('Мобілізація проводиться у разі збройної агресії проти України');
    expect(kw.length).toBeGreaterThan(0);
    expect(kw.some(k => k.includes('мобілізац'))).toBe(true);
  });

  it('повертає порожній масив для порожнього тексту', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  it('фільтрує стоп-слова та короткі слова', () => {
    const kw = extractKeywords('та або що як це для від до');
    expect(kw).toEqual([]);
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

describe('stripEditorialNotes (інлайн)', () => {
  it('видаляє інлайн редакційну примітку з тексту', () => {
    const html = `<html><body>
      <h1>Тест</h1>
      <p>Стаття 1. Тестова стаття</p>
      <p>1. Текст статті {Статтю виключено на підставі Закону} продовження тексту.</p>
    </body></html>`;
    const result = parseLawHtml(html, 'https://test.ua', 'Тест');
    const chunk = result.chunks[0];
    expect(chunk).toBeDefined();
    expect(chunk.text).not.toContain('{');
    expect(chunk.text).toContain('продовження тексту');
  });

  it('видаляє кілька інлайн приміток', () => {
    const html = `<html><body>
      <h1>Тест</h1>
      <p>Стаття 1. Тестова стаття</p>
      <p>1. Перша {примітка один} середина {примітка два} кінець тексту.</p>
    </body></html>`;
    const result = parseLawHtml(html, 'https://test.ua', 'Тест');
    const chunk = result.chunks[0];
    expect(chunk).toBeDefined();
    expect(chunk.text).not.toContain('{');
    expect(chunk.text).toContain('Перша');
    expect(chunk.text).toContain('кінець');
  });
});

describe('splitLargeChunks', () => {
  it('розбиває великий чанк по підпунктах', () => {
    // Створюємо HTML з однією великою статтею з підпунктами 1) 2) 3)...
    const longItems = Array.from({ length: 30 }, (_, i) =>
      `${i + 1}) Підпункт номер ${i + 1} з достатньо довгим текстом щоб набрати потрібну кількість символів для розбивки.`
    ).join(' ');
    const html = `<html><body>
      <h1>Тест</h1>
      <p>Стаття 1. Велика стаття</p>
      <p>1. ${longItems}</p>
    </body></html>`;
    const result = parseLawHtml(html, 'https://test.ua', 'Тест');
    expect(result.chunks.length).toBeGreaterThan(1);
    // Цифрові маркери розбиваються як пункти (п.)
    const splitChunks = result.chunks.filter(c => c.part.includes('п.'));
    expect(splitChunks.length).toBeGreaterThan(0);
  });

  it('не розбиває маленький чанк', () => {
    const html = `<html><body>
      <h1>Тест</h1>
      <p>Стаття 1. Коротка стаття</p>
      <p>1. Короткий текст статті про військову службу в Україні.</p>
    </body></html>`;
    const result = parseLawHtml(html, 'https://test.ua', 'Тест');
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].part).not.toContain('пп.');
  });
});
