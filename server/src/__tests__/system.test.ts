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

  it('розрізняє контракти ДО та ПІД ЧАС воєнного стану', () => {
    expect(SYSTEM_PROMPT).toContain('укладені ДО 24.02.2022');
    expect(SYSTEM_PROMPT).toContain('укладені ПІД ЧАС воєнного стану');
    expect(SYSTEM_PROMPT).toContain('право на звільнення');
  });

  it('містить правило про умовне розмежування норм', () => {
    expect(SYSTEM_PROMPT).toContain('УМОВНЕ РОЗМЕЖУВАННЯ НОРМ');
    expect(SYSTEM_PROMPT).toContain('ДО воєнного стану vs ПІД ЧАС воєнного стану');
    expect(SYSTEM_PROMPT).toContain('контрактник vs мобілізований');
    expect(SYSTEM_PROMPT).toContain('ОБОВ\'ЯЗКОВО вкажи усі варіанти');
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
