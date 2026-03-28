# Векторний пошук через LanceDB + @xenova/transformers

## Overview
Додати семантичний пошук по законах через ембеддинги. Гібридний підхід: існуючий keyword пошук + cosine similarity через LanceDB. Ембеддинги генеруються локально через `@xenova/transformers` (модель `Xenova/multilingual-e5-small`, 384 виміри). Без зовнішніх API, працює офлайн.

## Context (from discovery)
- Проект: AI-асистент з прав військовослужбовців ЗСУ
- Стек: React + Vite (клієнт), Express + TypeScript (сервер), Claude API
- Зараз: keyword-based пошук, 45 чанків у 3 JSON файлах (~37.5 KB)
- Проблема: keyword пошук не знаходить релевантні статті коли користувач описує ситуацію своїми словами
- LanceDB — вбудована векторна БД (як SQLite), один npm пакет, zero config, файлова

## Development Approach
- **Testing approach**: Regular (code first, then tests)
- Кожен таск — конкретна одиниця роботи
- **CRITICAL: всі тести мають проходити перед початком наступного таску** (`npm test`)
- **CRITICAL: оновлювати цей план при зміні скоупу**

## Testing Strategy
- **Unit tests**: обов'язкові для кожного таску де є логіка
- Запускати: `npm test` (root workspace — запускає тести клієнта і сервера)

## Progress Tracking
- Завершені елементи позначати `[x]` одразу
- Нові знахідки додавати з ➕ префіксом
- Блокери документувати з ⚠️ префіксом

## Implementation Steps

### Task 1: Встановити залежності
- [x] `npm install @lancedb/lancedb --workspace=server`
- [x] `npm install @xenova/transformers --workspace=server`
- [x] `npm install apache-arrow --workspace=server` (peer dependency для LanceDB)
- [x] перевірити що `npm test` проходить (нові залежності не ламають існуючий код)

### Task 2: Створити модуль ембеддингів (`server/src/services/embeddings.ts`)
- [x] функція `завантажитиМодель()` — lazy singleton, pipeline `feature-extraction` з `Xenova/multilingual-e5-small`
- [x] функція `створитиЕмбеддинг(текст: string, тип: 'query' | 'passage'): Promise<number[]>` — генерує вектор 384d, з префіксом `"query: "` або `"passage: "` (вимога моделі E5)
- [x] функція `створитиЕмбеддинги(тексти: string[], тип: 'query' | 'passage'): Promise<number[][]>` — батч-генерація
- [x] написати тести: перевірити розмірність вектора, різні вектори для різних текстів
- [x] `npm test` — всі тести проходять

### Task 3: Створити модуль LanceDB (`server/src/services/vectorStore.ts`)
- [x] функція `ініціалізуватиБД()` — створює/відкриває LanceDB в `data/lancedb/`
- [x] функція `створитиТаблицю(чанки: LawChunk[], ембеддинги: number[][])` — створює таблицю з полями: id, article, part, title, text, keywords, lawTitle, sourceUrl, vector
- [x] функція `пошукПоВектору(queryVector: number[], topK?: number): Promise<VectorSearchResult[]>` — cosine similarity пошук, повертає чанки з distance
- [x] функція `оновитиЧанки(чанки: LawChunk[], ембеддинги: number[][])` — upsert для автооновлення
- [x] написати тести з mock даними
- [x] `npm test` — всі тести проходять

### Task 4: Скрипт ініціалізації бази (`scripts/init-vector-db.ts`)
- [ ] завантажити всі чанки через `loadAllLaws()`
- [ ] для кожного чанка скласти текст: `"passage: {lawTitle}. {article}. {title}. {text}"`
- [ ] згенерувати ембеддинги батчем
- [ ] створити LanceDB таблицю з чанками та ембеддингами
- [ ] додати npm script: `"init-vector-db": "tsx scripts/init-vector-db.ts"` в root `package.json`
- [ ] запустити скрипт — перевірити що `data/lancedb/` створена з даними
- [ ] додати `data/lancedb/` в `.gitignore` (генерується локально)

### Task 5: Гібридний пошук в `lawSearch.ts`
- [ ] імпортувати `створитиЕмбеддинг` з `embeddings.ts` та `пошукПоВектору` з `vectorStore.ts`
- [ ] нова async функція `hybridSearchLaws(запит, чанки): Promise<SearchResult[]>`
  - keyword scoring через існуючий `searchLaws()` (не чіпаємо)
  - генерація query embedding: `створитиЕмбеддинг(запит, 'query')`
  - vector пошук через LanceDB: `пошукПоВектору(queryVector, 10)`
  - нормалізація обох оцінок до [0, 1]
  - гібрид: `0.4 * keyword + 0.6 * vector`
  - фільтр по мінімальній оцінці, top 5
- [ ] додати константи в `constants.ts`: `ВАГА_КЛЮЧОВИХ_СЛІВ = 0.4`, `ВАГА_ВЕКТОРА = 0.6`, `МІНІМАЛЬНА_ГІБРИДНА_ОЦІНКА = 0.15`
- [ ] написати тести для гібридного пошуку
- [ ] `npm test` — всі тести проходять

### Task 6: Інтеграція в `chat.ts`
- [ ] спробувати ініціалізувати LanceDB при старті (graceful — якщо БД немає, працюємо без)
- [ ] замінити `searchLaws()` на `hybridSearchLaws()` коли LanceDB доступна
- [ ] fallback на `searchLaws()` якщо LanceDB не ініціалізована
- [ ] додати логування: "Гібридний пошук" або "Keyword пошук (LanceDB не доступна)"
- [ ] `npm test` — всі тести проходять
- [ ] `npm run lint` — без помилок

### Task 7: Скрипт автооновлення законів (`scripts/update-laws.ts`)
- [ ] приймає URL закону з zakon.rada.gov.ua як аргумент
- [ ] парсить HTML → JSON чанки (використати логіку з `parse-law.ts`)
- [ ] генерує ембеддинги для нових чанків
- [ ] upsert в LanceDB
- [ ] зберігає JSON файл у `laws/`
- [ ] додати npm script: `"update-law": "tsx scripts/update-laws.ts"` в root `package.json`

### Task 8: Документація та фіналізація
- [ ] оновити `CLAUDE.md` — нові команди, архітектура з LanceDB
- [ ] оновити `package.json` опис команд
- [ ] `npm test` — фінальна перевірка всіх тестів
- [ ] `npm run lint` — фінальна перевірка лінтера

## Verification
1. `npm run init-vector-db` → `data/lancedb/` створена з 45 записами
2. `npm test` → всі тести проходять
3. `npm run dev` → запитати "Чи можу я поїхати додому на вихідні?" → знаходить статті про відпустки
4. `npm run update-law -- <url>` → новий закон додається в базу
5. Перший запит: 2-5с (завантаження моделі), далі миттєво
