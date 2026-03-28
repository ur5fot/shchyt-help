import { describe, it, expect } from 'vitest';
import { detectTemplate, ШАБЛОНИ_ПАТТЕРНИ } from './templateDetector';

describe('detectTemplate', () => {
  describe('raport-nevyplata (рапорт про невиплату)', () => {
    it('виявляє "невиплата"', () => {
      expect(detectTemplate('Це невиплата грошового забезпечення')).toBe('raport-nevyplata');
    });

    it('виявляє "не виплатили"', () => {
      expect(detectTemplate('Мені не виплатили бойові')).toBe('raport-nevyplata');
    });

    it('виявляє "бойові виплати"', () => {
      expect(detectTemplate('Бойові виплати затримують')).toBe('raport-nevyplata');
    });

    it('виявляє "заборгованість"', () => {
      expect(detectTemplate('Виникла заборгованість по виплатах')).toBe('raport-nevyplata');
    });

    it('виявляє "затримування"', () => {
      expect(detectTemplate('Затримування грошового забезпечення')).toBe('raport-nevyplata');
    });

    it('виявляє "не нараховано"', () => {
      expect(detectTemplate('Додаткову винагороду не нараховано')).toBe('raport-nevyplata');
    });

    it('виявляє "не виплачують"', () => {
      expect(detectTemplate('Не виплачують надбавку')).toBe('raport-nevyplata');
    });
  });

  describe('raport-vidpustka (рапорт про відпустку)', () => {
    it('виявляє "відпустка"', () => {
      expect(detectTemplate('Ви маєте право на відпустку')).toBe('raport-vidpustka');
    });

    it('виявляє "надати відпустку"', () => {
      expect(detectTemplate('Командир зобовʼязаний надати відпустку')).toBe('raport-vidpustka');
    });

    it('виявляє "право на відпустку"', () => {
      expect(detectTemplate('Право на відпустку гарантовано')).toBe('raport-vidpustka');
    });
  });

  describe('skarga (скарга)', () => {
    it('виявляє "оскаржити"', () => {
      expect(detectTemplate('Ви можете оскаржити це рішення')).toBe('skarga');
    });

    it('виявляє "скаргу"', () => {
      expect(detectTemplate('Подати скаргу до командира')).toBe('skarga');
    });

    it('виявляє "неправомірні дії"', () => {
      expect(detectTemplate('Це неправомірні дії командира')).toBe('skarga');
    });

    it('виявляє "оскарження"', () => {
      expect(detectTemplate('Порядок оскарження наказу')).toBe('skarga');
    });
  });

  describe('регістронезалежність', () => {
    it('працює з великими літерами', () => {
      expect(detectTemplate('НЕВИПЛАТА грошового забезпечення')).toBe('raport-nevyplata');
    });

    it('працює зі змішаним регістром', () => {
      expect(detectTemplate('Не Виплатили бойові')).toBe('raport-nevyplata');
    });

    it('працює з великими для відпустки', () => {
      expect(detectTemplate('ВІДПУСТКА положена')).toBe('raport-vidpustka');
    });

    it('працює з великими для скарги', () => {
      expect(detectTemplate('Подати СКАРГУ')).toBe('skarga');
    });
  });

  describe('edge cases', () => {
    it('повертає null для тексту без ключових слів', () => {
      expect(detectTemplate('Загальна інформація про службу')).toBeNull();
    });

    it('повертає null для порожнього рядка', () => {
      expect(detectTemplate('')).toBeNull();
    });

    it('повертає null для тексту з "грошове забезпечення" без контексту невиплати', () => {
      // 'грошове забезпечення' навмисно виключено — занадто широке
      expect(detectTemplate('Грошове забезпечення складається з окладу')).toBeNull();
    });

    it('повертає null для тексту з "порушення" без контексту скарги', () => {
      // 'порушен' навмисно виключено — занадто широке
      expect(detectTemplate('Порушення прав військовослужбовців')).toBeNull();
    });

    it('при наявності кількох шаблонів повертає перший за пріоритетом', () => {
      // Текст містить ключові слова і для невиплати, і для скарги
      const текст = 'Невиплату можна оскаржити через скаргу';
      expect(detectTemplate(текст)).toBe('raport-nevyplata');
    });

    it('працює з довгим текстом', () => {
      const довгийТекст = 'А'.repeat(10000) + ' невиплата ' + 'Б'.repeat(10000);
      expect(detectTemplate(довгийТекст)).toBe('raport-nevyplata');
    });
  });

  describe('структура ШАБЛОНИ_ПАТТЕРНИ', () => {
    it('містить 3 шаблони', () => {
      expect(ШАБЛОНИ_ПАТТЕРНИ).toHaveLength(3);
    });

    it('кожен шаблон має id та ключові слова', () => {
      for (const шаблон of ШАБЛОНИ_ПАТТЕРНИ) {
        expect(шаблон.id).toBeTruthy();
        expect(шаблон.ключовіСлова.length).toBeGreaterThan(0);
      }
    });

    it('всі id унікальні', () => {
      const ids = ШАБЛОНИ_ПАТТЕРНИ.map((ш) => ш.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
