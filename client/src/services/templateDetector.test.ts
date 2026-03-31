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

  describe('raport-zvilnennya (рапорт про звільнення)', () => {
    it('виявляє "звільнення"', () => {
      expect(detectTemplate('Порядок звільнення з військової служби')).toBe('raport-zvilnennya');
    });

    it('виявляє "демобілізація"', () => {
      expect(detectTemplate('Демобілізація після 36 місяців служби')).toBe('raport-zvilnennya');
    });

    it('виявляє "закінчення служби" (regex)', () => {
      expect(detectTemplate('Після закінчення строкової служби')).toBe('raport-zvilnennya');
    });

    it('виявляє "закінчення військової служби" (regex)', () => {
      expect(detectTemplate('Порядок закінчення військової служби')).toBe('raport-zvilnennya');
    });

    it('виявляє "звільнений"', () => {
      expect(detectTemplate('Він був звільнений зі служби')).toBe('raport-zvilnennya');
    });
  });

  describe('raport-rotatsia (рапорт про ротацію)', () => {
    it('виявляє "ротація"', () => {
      expect(detectTemplate('Ротація підрозділу кожні 6 місяців')).toBe('raport-rotatsia');
    });

    it('виявляє "ротації"', () => {
      expect(detectTemplate('Право на ротації передбачено Положенням')).toBe('raport-rotatsia');
    });

    it('виявляє "заміна на позиції"', () => {
      expect(detectTemplate('Заміна на позиції повинна відбутися')).toBe('raport-rotatsia');
    });
  });

  describe('raport-vlk (рапорт про ВЛК)', () => {
    it('виявляє "ВЛК" (великими)', () => {
      expect(detectTemplate('Направлення на ВЛК для огляду')).toBe('raport-vlk');
    });

    it('виявляє "влк" (малими)', () => {
      expect(detectTemplate('Потрібно пройти влк')).toBe('raport-vlk');
    });

    it('виявляє "лікарська комісія" (regex)', () => {
      expect(detectTemplate('Військово-лікарська комісія визначає придатність')).toBe('raport-vlk');
    });

    it('виявляє "лікарській комісії" (regex)', () => {
      expect(detectTemplate('На лікарській комісії визначили')).toBe('raport-vlk');
    });

    it('виявляє "лікарську комісію" (regex)', () => {
      expect(detectTemplate('Направили на лікарську комісію')).toBe('raport-vlk');
    });

    it('виявляє "придатність до служби" (regex)', () => {
      expect(detectTemplate('Визначення придатності до служби')).toBe('raport-vlk');
    });

    it('виявляє "придатний до служби" (regex)', () => {
      expect(detectTemplate('Визнаний придатний до служби з обмеженнями')).toBe('raport-vlk');
    });

    it('виявляє "медичний огляд" (regex)', () => {
      expect(detectTemplate('Направлення на медичний огляд')).toBe('raport-vlk');
    });

    it('виявляє "медичного огляду" (regex)', () => {
      expect(detectTemplate('Результати медичного огляду')).toBe('raport-vlk');
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

    it('працює з великими для звільнення', () => {
      expect(detectTemplate('ЗВІЛЬНЕННЯ зі служби')).toBe('raport-zvilnennya');
    });

    it('працює з великими для ротації', () => {
      expect(detectTemplate('РОТАЦІЯ підрозділу')).toBe('raport-rotatsia');
    });

    it('працює з великими для ВЛК regex', () => {
      expect(detectTemplate('ЛІКАРСЬКА КОМІСІЯ визначила')).toBe('raport-vlk');
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

    it('звільнення має пріоритет над скаргою', () => {
      const текст = 'Звільнення можна оскаржити';
      expect(detectTemplate(текст)).toBe('raport-zvilnennya');
    });
  });

  describe('структура ШАБЛОНИ_ПАТТЕРНИ', () => {
    it('містить 6 шаблонів', () => {
      expect(ШАБЛОНИ_ПАТТЕРНИ).toHaveLength(6);
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
