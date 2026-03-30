import { describe, it, expect } from 'vitest';
import { computeHash, type LawHashes } from '../../../scripts/generate-hashes';

describe('checkUpdates — хешування та порівняння', () => {
  describe('computeHash', () => {
    it('повертає sha256 hex рядок довжиною 64 символи', () => {
      const hash = computeHash('тестовий текст');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('повертає однаковий хеш для однакового вмісту', () => {
      const hash1 = computeHash('Стаття 1. Право на відпустку');
      const hash2 = computeHash('Стаття 1. Право на відпустку');
      expect(hash1).toBe(hash2);
    });

    it('повертає різні хеші для різного вмісту', () => {
      const hash1 = computeHash('Стаття 1. Право на відпустку');
      const hash2 = computeHash('Стаття 2. Грошове забезпечення');
      expect(hash1).not.toBe(hash2);
    });

    it('коректно обробляє порожній рядок', () => {
      const hash = computeHash('');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('коректно обробляє Unicode (кирилиця, спецсимволи)', () => {
      const hash = computeHash('Закон України «Про мобілізацію» — стаття №5');
      expect(hash).toHaveLength(64);
    });
  });

  describe('порівняння хешів', () => {
    it('визначає зміну коли хеш відрізняється', () => {
      const savedHash = computeHash('старий текст закону');
      const newHash = computeHash('новий текст закону');
      expect(savedHash !== newHash).toBe(true);
    });

    it('визначає відсутність змін коли хеш однаковий', () => {
      const content = '<html>Стаття 1. Текст закону</html>';
      const savedHash = computeHash(content);
      const newHash = computeHash(content);
      expect(savedHash === newHash).toBe(true);
    });

    it('визначає зміну коли запис відсутній (перший запуск)', () => {
      const hashes: LawHashes = {};
      const url = 'https://zakon.rada.gov.ua/laws/show/test';
      const savedEntry = hashes[url];
      const changed = !savedEntry || savedEntry.hash !== 'abc123';
      expect(changed).toBe(true);
    });

    it('визначає відсутність змін коли хеш збігається', () => {
      const hash = computeHash('текст закону');
      const hashes: LawHashes = {
        'https://zakon.rada.gov.ua/laws/show/test': {
          hash,
          lastChecked: '2026-03-30',
          chunksCount: 50,
        },
      };
      const savedEntry = hashes['https://zakon.rada.gov.ua/laws/show/test'];
      const changed = !savedEntry || savedEntry.hash !== hash;
      expect(changed).toBe(false);
    });
  });
});
