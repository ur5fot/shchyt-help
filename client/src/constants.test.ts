// Тести для спільних клієнтських констант
import { describe, it, expect } from 'vitest';
import { ПІДКАЗКИ } from './constants';

describe('клієнтські константи', () => {
  it('ПІДКАЗКИ — масив з кількома елементами', () => {
    expect(Array.isArray(ПІДКАЗКИ)).toBe(true);
    expect(ПІДКАЗКИ.length).toBeGreaterThanOrEqual(3);
  });

  it('кожна підказка — непорожній рядок', () => {
    for (const підказка of ПІДКАЗКИ) {
      expect(typeof підказка).toBe('string');
      expect(підказка.trim().length).toBeGreaterThan(0);
    }
  });

  it('кожна підказка закінчується знаком питання', () => {
    for (const підказка of ПІДКАЗКИ) {
      expect(підказка).toMatch(/\?$/);
    }
  });

  it('підказки не дублюються', () => {
    const унікальні = new Set(ПІДКАЗКИ);
    expect(унікальні.size).toBe(ПІДКАЗКИ.length);
  });

  it('містить підказку про відпустку', () => {
    expect(ПІДКАЗКИ.some(п => п.includes('відпустк'))).toBe(true);
  });

  it('містить підказку про виплати', () => {
    expect(ПІДКАЗКИ.some(п => п.includes('виплат'))).toBe(true);
  });
});
