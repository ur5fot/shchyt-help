# SHCHYT — AI-асистент з прав військовослужбовців ЗСУ

Локальний веб-додаток: задаєш питання — отримуєш відповідь з посиланням на конкретну статтю закону. Може згенерувати рапорт або скаргу у PDF.

> ⚠️ Це не юридична консультація. Для прийняття рішень зверніться до військового адвоката.

## Швидкий старт

### 1. Встановити залежності

```bash
npm install
```

### 2. Налаштувати API ключ

```bash
cp .env.example .env
# Відкрити .env та вставити свій ANTHROPIC_API_KEY
```

Отримати ключ можна на [console.anthropic.com](https://console.anthropic.com/).

### 3. Ініціалізувати векторну базу

```bash
npm run init-vector-db
```

Генерує ембеддинги для всіх законів та створює локальну базу LanceDB в `data/lancedb/`. Без цього кроку працюватиме лише keyword-пошук (без семантичного).

### 4. Запустити додаток

```bash
npm run dev
```

Фронтенд: http://localhost:5173
Бекенд API: http://localhost:3001

## Функціональність

- Відповіді на питання про права військовослужбовців з цитатами конкретних статей законів
- Пошук по трьох законах: соціальний захист, військовий обов'язок, статус ветеранів
- Генерація PDF-документів: рапорт про невиплату, рапорт про відпустку, скарга
- Підказки типових питань для швидкого старту

## Структура проекту

```
client/      — React + Vite фронтенд (TypeScript, Tailwind CSS, pdf-lib)
server/      — Express бекенд (TypeScript, Claude API)
laws/        — JSON-файли законів (чанки з ключовими словами)
data/lancedb/— Векторна база LanceDB (генерується локально через init-vector-db)
templates/   — Шаблони документів (рапорт, скарга)
scripts/     — Парсер законів, ініціалізація векторної бази, оновлення законів
```

## База законів

Три закони покривають ~80% питань:

- `laws/pro-soczakhyst.json` — «Про соціальний і правовий захист військовослужбовців та членів їх сімей» (грошове забезпечення, відпустки, соцгарантії)
- `laws/pro-viyskovyy-obovyazok.json` — «Про військовий обов'язок і військову службу» (мобілізація, звільнення, переведення)
- `laws/pro-status-veteraniv.json` — «Про статус ветеранів війни, гарантії їх соціального захисту» (статус УБД, пільги)

### Додати новий закон

```bash
# Додати/оновити закон (парсинг + ембеддинги + запис у LanceDB)
npm run update-law -- https://zakon.rada.gov.ua/laws/show/XXXXX "Коротка назва закону"
```

## Команди розробника

```bash
npm run dev              # Запустити клієнт і сервер одночасно
npm run test             # Запустити всі тести (Vitest)
npm run lint             # Перевірити код ESLint
npm run lint:fix         # Автоматично виправити ESLint-помилки
npm run format           # Форматувати код Prettier
npm run init-vector-db   # Ініціалізувати векторну базу LanceDB
npm run update-law -- <url> <назва>  # Оновити/додати закон з rada.gov.ua
```

## Стек

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, pdf-lib
- **Backend:** Node.js, Express, TypeScript
- **AI:** Claude API (claude-sonnet-4-20250514) через @anthropic-ai/sdk
- **Векторний пошук:** LanceDB + @xenova/transformers (Xenova/multilingual-e5-small, 384d)
- **Логування:** pino (JSON в production, pretty в dev)
- **Тести:** Vitest, @testing-library/react
- **Лінтинг:** ESLint + Prettier
