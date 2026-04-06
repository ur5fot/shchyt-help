# Виправлення знахідок з ревью коду

## Overview
Комплексне ревью виявило проблеми середнього пріоритету: відсутні тести для feedback, невикористаний JSON_ЛІМІТ, відсутність валідації type в feedback. Шаблони .docx залишаються як є (тимчасово вимкнені).

## Context
- `server/src/routes/feedback.ts` — немає unit-тестів
- `server/src/app.ts` — JSON_ЛІМІТ з constants не використовується для chat
- `server/src/routes/feedback.ts` — `type` не валідується як enum
- `server/src/services/hyde.ts` — немає тестів для основної функції

## Development Approach
- **Testing approach**: Regular (код → тести)
- Кожен task включає тести
- Всі тести повинні проходити перед наступним task

## Implementation Steps

### Task 1: Додати тести для feedback.ts
- [x] Створити `server/src/__tests__/feedback.test.ts`
- [x] Тест: повертає 503 якщо SMTP не налаштований
- [x] Тест: повертає 400 якщо повідомлення пусте або коротке
- [x] Тест: повертає 400 якщо повідомлення довше 5000 символів
- [x] Тест: повертає 400 якщо PDF більше 5MB
- [x] Тест: успішна відправка з моком nodemailer
- [x] Тест: успішна відправка з PDF вкладенням
- [x] Тест: повертає 500 при помилці SMTP
- [x] Додати runtime валідацію `type` (допустимі: 'good', 'bad', 'suggestion', default: 'suggestion')
- [x] Запустити `npm test` — всі тести проходять
- [x] Запустити `npm run lint` — без помилок

### Task 2: Виправити JSON ліміт для chat роуту
- [x] В `server/src/app.ts` — переконатись що `/api/chat` використовує `JSON_ЛІМІТ` з constants (10kb), а `/api/feedback` використовує 10mb
- [x] Перевірити що rate limit для chat та feedback працюють незалежно
- [x] Написати тест: chat відхиляє payload > 10kb
- [x] Написати тест: feedback приймає payload до 10mb
- [x] Запустити `npm test` — всі тести проходять
- [x] Запустити `npm run lint` — без помилок

### Task 3: Verify acceptance criteria
- [x] Feedback endpoint: всі error cases покриті тестами
- [x] JSON ліміт: chat = 10kb, feedback = 10mb
- [x] Type валідація: невідомий type → 'suggestion'
- [x] Всі тести проходять (`npm test`)
- [x] Лінтер проходить (`npm run lint`)
- [x] Жодних нових пропущених тестів (skip count не збільшився)

## Technical Details

**Тести feedback.ts — мок nodemailer:**
```typescript
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: vi.fn() })) },
}));
```

**Runtime валідація type:**
```typescript
const validTypes = ['good', 'bad', 'suggestion'] as const;
const safeType = validTypes.includes(type as any) ? type : 'suggestion';
```

## Post-Completion
- Оновити документацію якщо змінились ліміти
