import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT } from '../prompts/system';

describe('SYSTEM_PROMPT', () => {
  it('є рядком', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('містить роль асистента — ЗСУ/військовослужбовці', () => {
    expect(SYSTEM_PROMPT).toContain('військовослужбовц');
  });

  it('вимагає цитувати конкретні статті законів', () => {
    const текст = SYSTEM_PROMPT.toLowerCase();
    expect(текст).toMatch(/статт|цитуй/);
  });

  it('забороняє вигадувати статті', () => {
    const текст = SYSTEM_PROMPT.toLowerCase();
    expect(текст).toMatch(/ніколи|не вигадуй|не придумуй/);
  });

  it('містить вимогу відповідати тільки на основі контексту', () => {
    const текст = SYSTEM_PROMPT.toLowerCase();
    expect(текст).toMatch(/контекст|наданого|законодавства/);
  });

  it('містить обов`язковий дисклеймер наприкінці', () => {
    expect(SYSTEM_PROMPT).toContain('⚠️');
    expect(SYSTEM_PROMPT).toContain('не юридична консультація');
    expect(SYSTEM_PROMPT).toContain('військового адвоката');
  });

  it('вимагає відповідати українською мовою', () => {
    const текст = SYSTEM_PROMPT.toLowerCase();
    expect(текст).toMatch(/украін|украïн|мовою/);
  });

  it('містить інструкцію про недостатній контекст', () => {
    const текст = SYSTEM_PROMPT.toLowerCase();
    expect(текст).toMatch(/недостатньо|не маю інформації|зверніться/);
  });

  it('містить інструкцію про деталізацію документів', () => {
    expect(SYSTEM_PROMPT).toContain('ДЕТАЛІЗАЦІЯ ДОКУМЕНТІВ');
    expect(SYSTEM_PROMPT).toContain('офіційну назву документа');
    expect(SYSTEM_PROMPT).toContain('Де отримати');
    expect(SYSTEM_PROMPT).toContain('Порядок отримання');
    // Містить приклади деталізації
    expect(SYSTEM_PROMPT).toContain('НЕ ПИШИ');
    expect(SYSTEM_PROMPT).toContain('ПИШИ');
    expect(SYSTEM_PROMPT).toContain('МСЕК');
  });

  it('містить інструкцію про контакти гарячих ліній', () => {
    expect(SYSTEM_PROMPT).toContain('КОНТАКТИ ГАРЯЧИХ ЛІНІЙ');
    expect(SYSTEM_PROMPT).toContain('Телефон');
    expect(SYSTEM_PROMPT).toContain('Email');
    expect(SYSTEM_PROMPT).toContain('Графік роботи');
    const текст = SYSTEM_PROMPT.toLowerCase();
    expect(текст).toMatch(/скарг|звернень|правової допомоги|психологічн/);
  });
});
