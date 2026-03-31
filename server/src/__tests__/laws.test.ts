import { describe, it, expect } from 'vitest';
import { loadAllLaws, type LawChunk } from '../../../laws/index';

describe('loadAllLaws', () => {
  it('повертає масив чанків', () => {
    const chunks = loadAllLaws();
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('кожен чанк має обов\'язкові поля', () => {
    const chunks = loadAllLaws();
    for (const chunk of chunks) {
      expect(chunk).toHaveProperty('id');
      expect(chunk).toHaveProperty('article');
      expect(chunk).toHaveProperty('part');
      expect(chunk).toHaveProperty('text');
      expect(chunk).toHaveProperty('keywords');
      expect(chunk).toHaveProperty('lawTitle');
      expect(chunk).toHaveProperty('sourceUrl');
    }
  });

  it('поля id, article, text, lawTitle, sourceUrl є непорожніми рядками', () => {
    const chunks = loadAllLaws();
    for (const chunk of chunks) {
      expect(typeof chunk.id).toBe('string');
      expect(chunk.id.length).toBeGreaterThan(0);
      expect(typeof chunk.article).toBe('string');
      expect(chunk.article.length).toBeGreaterThan(0);
      expect(typeof chunk.text).toBe('string');
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(typeof chunk.lawTitle).toBe('string');
      expect(chunk.lawTitle.length).toBeGreaterThan(0);
      expect(typeof chunk.sourceUrl).toBe('string');
      expect(chunk.sourceUrl.length).toBeGreaterThan(0);
    }
  });

  it('keywords є масивом рядків', () => {
    const chunks = loadAllLaws();
    for (const chunk of chunks) {
      expect(Array.isArray(chunk.keywords)).toBe(true);
      for (const kw of chunk.keywords) {
        expect(typeof kw).toBe('string');
      }
    }
  });

  it('part є рядком (може бути порожнім)', () => {
    const chunks = loadAllLaws();
    for (const chunk of chunks) {
      expect(typeof chunk.part).toBe('string');
    }
  });

  it('title є необов\'язковим полем типу string', () => {
    const chunks = loadAllLaws();
    for (const chunk of chunks) {
      if (chunk.title !== undefined) {
        expect(typeof chunk.title).toBe('string');
      }
    }
  });

  it('завантажує чанки з pro-soczakhyst.json — lawTitle відповідає назві закону', () => {
    const chunks = loadAllLaws();
    const soczakhystChunks = chunks.filter(c =>
      c.lawTitle.includes('соціальний і правовий захист')
    );
    expect(soczakhystChunks.length).toBeGreaterThan(0);
  });

  it('sourceUrl відповідає zakon.rada.gov.ua або internal://', () => {
    const chunks = loadAllLaws();
    for (const chunk of chunks) {
      expect(chunk.sourceUrl).toMatch(/zakon\.rada\.gov\.ua|internal:\/\//);
    }
  });

  it('завантажує статтю 9 (грошове забезпечення)', () => {
    const chunks = loadAllLaws();
    const st9 = chunks.filter(c => c.article === 'Стаття 9');
    expect(st9.length).toBeGreaterThan(0);
    const hasKeyword = st9.some(c =>
      c.keywords.some(k => k.includes('грошове забезпечення'))
    );
    expect(hasKeyword).toBe(true);
  });

  it('завантажує статтю 10-1 (відпустки)', () => {
    const chunks = loadAllLaws();
    const st10 = chunks.find(c => c.article === 'Стаття 10-1');
    expect(st10).toBeDefined();
    expect(st10!.keywords).toContain('відпустка');
  });

  it('id кожного чанку унікальний', () => {
    const chunks = loadAllLaws();
    const ids = chunks.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('hotlines.json', () => {
  const chunks = loadAllLaws();
  const hotlineChunks = chunks.filter(c => c.id.startsWith('hotlines-'));

  it('завантажує чанки з hotlines.json', () => {
    expect(hotlineChunks.length).toBeGreaterThan(0);
  });

  it('кожен чанк має обов\'язкові поля з непорожніми значеннями', () => {
    for (const chunk of hotlineChunks) {
      expect(chunk.id).toBeTruthy();
      expect(chunk.article).toBeTruthy();
      expect(typeof chunk.part).toBe('string');
      expect(chunk.text).toBeTruthy();
      expect(chunk.keywords.length).toBeGreaterThan(0);
      expect(chunk.lawTitle).toBe('Гарячі лінії та контакти для військовослужбовців');
      expect(chunk.sourceUrl).toBe('internal://hotlines');
      expect(chunk.documentId).toBe('Довідник контактів');
    }
  });

  it('містить ключові організації: МОУ, Омбудсман, БПД, психологічна допомога', () => {
    const ids = hotlineChunks.map(c => c.id);
    expect(ids).toContain('hotlines-mou');
    expect(ids).toContain('hotlines-ombudsman');
    expect(ids).toContain('hotlines-legal-aid');
    expect(ids).toContain('hotlines-lifeline');
  });

  it('кожен чанк містить телефонний номер у тексті', () => {
    for (const chunk of hotlineChunks) {
      expect(chunk.text).toMatch(/\d{3,}/);
    }
  });

  it('id кожного чанку унікальний серед hotlines', () => {
    const ids = hotlineChunks.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('LawChunk тип', () => {
  it('тип LawChunk є сумісним з даними з JSON', () => {
    const chunks = loadAllLaws();
    // Перевіряємо що TypeScript-тип збігається з реальними даними
    const chunk: LawChunk = chunks[0];
    expect(chunk).toBeDefined();
    // Перевіряємо структуру
    const keys = Object.keys(chunk);
    expect(keys).toContain('id');
    expect(keys).toContain('article');
    expect(keys).toContain('part');
    expect(keys).toContain('text');
    expect(keys).toContain('keywords');
    expect(keys).toContain('lawTitle');
    expect(keys).toContain('sourceUrl');
  });
});
