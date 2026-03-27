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

### 3. Запустити додаток

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
templates/   — Шаблони документів (рапорт, скарга)
scripts/     — Парсер законів з zakon.rada.gov.ua
```

## База законів

Три закони покривають ~80% питань:

- `laws/pro-soczakhyst.json` — «Про соціальний і правовий захист військовослужбовців та членів їх сімей» (грошове забезпечення, відпустки, соцгарантії)
- `laws/pro-viyskovyy-obovyazok.json` — «Про військовий обов'язок і військову службу» (мобілізація, звільнення, переведення)
- `laws/pro-status-veteraniv.json` — «Про статус ветеранів війни, гарантії їх соціального захисту» (статус УБД, пільги)

### Додати новий закон

```bash
# Спарсити закон з rada.gov.ua
npx tsx scripts/parse-law.ts https://zakon.rada.gov.ua/laws/show/XXXXX > laws/nazva-zakonu.json
```

## Команди розробника

```bash
npm run dev          # Запустити клієнт і сервер одночасно
npm run test         # Запустити всі тести (Vitest)
```

## Стек

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, pdf-lib
- **Backend:** Node.js, Express, TypeScript
- **AI:** Claude API (claude-sonnet-4-20250514) через @anthropic-ai/sdk
- **Тести:** Vitest, @testing-library/react
