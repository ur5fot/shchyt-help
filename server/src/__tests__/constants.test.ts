// Тести для спільних серверних констант
import { describe, it, expect } from 'vitest';
import {
  МОДЕЛЬ_CLAUDE,
  МАКС_ТОКЕНІВ,
  МАКС_ПОВТОРІВ_CLAUDE,
  МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ,
  ТАЙМАУТ_ЗАПИТУ_CLAUDE_МС,
  ТАЙМАУТ_СТИСНЕННЯ_CLAUDE_МС,
  ТАЙМАУТ_HYDE_МС,
  RATE_LIMIT_ВІКНО_МС,
  RATE_LIMIT_МАКС_ЗАПИТІВ,
  JSON_ЛІМІТ,
  ПОРТ,
} from '../constants.ts';

describe('серверні константи', () => {
  it('МОДЕЛЬ_CLAUDE — валідний ідентифікатор моделі Claude', () => {
    expect(МОДЕЛЬ_CLAUDE).toMatch(/^claude-/);
  });

  it('МАКС_ТОКЕНІВ — позитивне число', () => {
    expect(МАКС_ТОКЕНІВ).toBeGreaterThan(0);
  });

  it('таймаути Claude та HyDE — позитивні числа', () => {
    expect(ТАЙМАУТ_ЗАПИТУ_CLAUDE_МС).toBeGreaterThan(0);
    expect(ТАЙМАУТ_СТИСНЕННЯ_CLAUDE_МС).toBeGreaterThan(0);
    expect(ТАЙМАУТ_HYDE_МС).toBeGreaterThan(0);
  });

  it('МАКС_ПОВТОРІВ_CLAUDE вимикає автоматичні retry', () => {
    expect(МАКС_ПОВТОРІВ_CLAUDE).toBe(0);
  });

  it('МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ — розумний ліміт для тексту', () => {
    expect(МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ).toBeGreaterThanOrEqual(100);
    expect(МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ).toBeLessThanOrEqual(10000);
  });

  it('RATE_LIMIT_ВІКНО_МС — одна хвилина в мілісекундах', () => {
    expect(RATE_LIMIT_ВІКНО_МС).toBe(60000);
  });

  it('RATE_LIMIT_МАКС_ЗАПИТІВ — позитивне число', () => {
    expect(RATE_LIMIT_МАКС_ЗАПИТІВ).toBeGreaterThan(0);
  });

  it('JSON_ЛІМІТ — рядок з одиницею виміру', () => {
    expect(JSON_ЛІМІТ).toMatch(/^\d+\w+$/);
  });

  it('ПОРТ — валідний номер порту', () => {
    expect(ПОРТ).toBeGreaterThanOrEqual(1024);
    expect(ПОРТ).toBeLessThanOrEqual(65535);
  });

  it('константи використовуються коректно — МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ = 2000', () => {
    expect(МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ).toBe(2000);
  });

  it('константи використовуються коректно — МАКС_ТОКЕНІВ = 4096', () => {
    expect(МАКС_ТОКЕНІВ).toBe(4096);
  });

  it('константи використовуються коректно — Claude timeout = 60000мс', () => {
    expect(ТАЙМАУТ_ЗАПИТУ_CLAUDE_МС).toBe(60000);
  });

  it('константи використовуються коректно — ПОРТ = 3001', () => {
    expect(ПОРТ).toBe(3001);
  });
});
