# Автоматичне оновлення бази законів

## Overview
Додати скрипт автоперевірки оновлень законів з zakon.rada.gov.ua. Порівнює hash HTML сторінок з збереженими — якщо закон змінився, перепарсює його та оновлює LanceDB. Можна запускати вручну (`npm run check-updates`) або по cron (раз на тиждень).

## Context
- Зараз: оновлення тільки вручну через `npm run update-law -- <url> <title>`
- 10 законів з відомими URL у JSON файлах (`source_url`)
- Потрібно: автоматична перевірка чи змінився текст закону на rada.gov.ua
- Скрипт має працювати як вручну, так і в cron

## Development Approach
- **Testing approach**: Regular (code first, then tests)
- **CRITICAL: всі тести мають проходити перед початком наступного таску** (`npm test`)

## Progress Tracking
- Завершені елементи позначати `[x]` одразу

## Implementation Steps

### Task 1: Створити файл хешів (`data/law-hashes.json`)
- [x] Формат: `{ "<source_url>": { "hash": "<sha256>", "lastChecked": "2026-03-30", "chunksCount": 185 } }`
- [x] Скрипт для початкової генерації хешів з існуючих законів
- [x] Завантажити HTML кожного закону, обчислити sha256, зберегти
- [x] Додати `data/law-hashes.json` в `.gitignore` (генерується локально)

### Task 2: Створити скрипт перевірки оновлень (`scripts/check-updates.ts`)
- [x] Завантажити `data/law-hashes.json` (якщо немає — створити)
- [x] Для кожного JSON файлу в `laws/`:
  - Завантажити HTML з `source_url`
  - Обчислити sha256
  - Порівняти з збереженим хешем
  - Якщо змінився — вивести повідомлення і запропонувати оновити
- [x] Режим `--auto` — автоматично перепарсити змінені закони (без підтвердження):
  - Перепарсити HTML через `parseLaw()`
  - Згенерувати ембеддинги
  - Upsert в LanceDB
  - Оновити JSON файл
  - Оновити хеш
- [x] Режим без `--auto` — тільки показати які закони змінились
- [x] Логування: "Перевірено N законів, змінено M, оновлено K"
- [x] Graceful: якщо rada.gov.ua недоступна — пропустити з warning
- [x] Додати npm script: `"check-updates": "tsx scripts/check-updates.ts"` в root package.json
- [x] `npm test` — всі тести проходять

### Task 3: Ініціалізація хешів для існуючих законів
- [x] При першому запуску `npm run check-updates` — створити `data/law-hashes.json` з поточними хешами
- [x] Скрипт `npm run init-hashes` для примусової переініціалізації
- [x] Додати npm script в root package.json

### Task 4: Тести та документація
- [x] Написати тести для функцій хешування та порівняння
- [x] Оновити `CLAUDE.md` — додати опис `npm run check-updates`
- [x] Оновити `README.md` — додати команду
- [x] `npm test` — всі тести проходять
- [x] `npm run lint` — без помилок

## Verification
1. `npm run check-updates` → показує статус кожного закону (без змін / змінено)
2. `npm run check-updates -- --auto` → автоматично оновлює змінені закони
3. `npm test` → всі тести проходять
4. Повторний запуск `npm run check-updates` після оновлення → "без змін"
