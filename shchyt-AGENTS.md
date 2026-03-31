# SHCHYT — AI-асистент з прав військовослужбовців ЗСУ

## Локальна версія для особистого використання

---

## ЩО ЦЕ

Локальний веб-додаток, який допомагає розібратися в правах військовослужбовців ЗСУ. Задаєш питання — отримуєш відповідь з посиланням на конкретну статтю закону. Може згенерувати рапорт або скаргу.

Працює на localhost. Без деплою, без домену, без реєстрації. Просто `npm run dev` і користуйся.

---

## СТЕК

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express
- **AI:** Claude API (claude-sonnet-4-20250514)
- **База законів:** JSON-файли (без БД на старті)
- **Генерація документів:** docxtemplater/pizzip (.docx генерація) + pdf-lib (експорт чату в PDF)

Без PostgreSQL, без pgvector, без Docker, без Ollama. Все максимально просто.

---

## СТРУКТУРА ПРОЕКТУ

```
shchyt/
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat.tsx        # Основний чат
│   │   │   ├── Message.tsx     # Бульбашка повідомлення
│   │   │   ├── Sources.tsx     # Блок джерел у відповіді
│   │   │   └── Home.tsx        # Головний екран
│   │   ├── services/
│   │   │   ├── api.ts          # Запити до сервера
│   │   │   ├── docxGenerator.ts # Генерація .docx рапортів/скарг
│   │   │   ├── pdfGenerator.ts # Експорт бесіди в PDF
│   │   │   └── templateDetector.ts # Визначення типу шаблону
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── server/
│   ├── src/
│   │   ├── index.ts            # Express сервер
│   │   ├── routes/
│   │   │   └── chat.ts         # POST /api/chat
│   │   ├── services/
│   │   │   ├── claude.ts       # Claude API wrapper
│   │   │   ├── lawSearch.ts    # Пошук по базі законів
│   │   │   └── promptBuilder.ts # Складання промпту
│   │   └── prompts/
│   │       └── system.ts       # System prompt
│   └── tsconfig.json
│
├── laws/                        # База законів (JSON)
│   ├── pro-soczakhyst.json     # ЗУ Про соцзахист військовослужбовців
│   ├── pro-viyskovyy-obovyazok.json  # ЗУ Про військовий обов'язок
│   ├── pro-status-veteraniv.json     # ЗУ Про статус ветеранів війни
│   └── index.ts                # Завантаження всіх законів
│
├── client/public/templates/docx/ # .docx шаблони документів (6 шт)
│   ├── raport-nevyplata.docx   # Рапорт невиплата грошового забезпечення
│   ├── raport-vidpustka.docx   # Рапорт відпустка
│   ├── raport-zvilnennya.docx  # Рапорт звільнення
│   ├── raport-rotatsia.docx    # Рапорт ротація
│   ├── raport-vlk.docx         # Рапорт ВЛК
│   └── skarga.docx             # Скарга
│
├── scripts/
│   └── parse-law.ts            # Скрипт парсингу закону з HTML
│
├── .env                         # ANTHROPIC_API_KEY=sk-ant-...
├── .env.example
├── package.json
└── README.md
```

---

## ЯК ПРАЦЮЄ

```
Користувач вводить питання
        ↓
POST /api/chat { message: "Мені не платять бойові 3 місяці" }
        ↓
lawSearch.ts: шукає релевантні фрагменти законів
  (простий текстовий пошук по ключових словах)
        ↓
promptBuilder.ts: складає промпт:
  system prompt + знайдені фрагменти законів + питання
        ↓
claude.ts: відправляє в Claude API
        ↓
Відповідь з цитатами → клієнт
        ↓
Якщо є можливість — кнопка "Завантажити рапорт (.docx)"
        ↓
.docx генерується на клієнті (docxtemplater/pizzip), нікуди не відправляється
```

---

## ФОРМАТ БАЗИ ЗАКОНІВ

Кожен закон — JSON файл з масивом фрагментів:

```json
{
  "title": "Закон України «Про соціальний і правовий захист військовослужбовців та членів їх сімей»",
  "short_title": "Про соцзахист військовослужбовців",
  "source_url": "https://zakon.rada.gov.ua/laws/show/2011-12",
  "last_updated": "2025-02-01",
  "chunks": [
    {
      "id": "soczakhyst-st9-ch1",
      "article": "Стаття 9",
      "part": "Частина 1",
      "title": "Грошове забезпечення",
      "text": "Держава забезпечує військовослужбовцям достатній рівень грошового забезпечення...",
      "keywords": ["грошове забезпечення", "виплати", "бойові", "оклад", "надбавки"]
    },
    {
      "id": "soczakhyst-st9-ch3",
      "article": "Стаття 9",
      "part": "Частина 3",
      "text": "Грошове забезпечення виплачується у розмірах...",
      "keywords": ["розмір виплат", "кабмін", "оклад посадовий"]
    },
    {
      "id": "soczakhyst-st10-1",
      "article": "Стаття 10-1",
      "part": "",
      "title": "Відпустки",
      "text": "В особливий період військовослужбовцям надаються відпустки...",
      "keywords": ["відпустка", "полон", "додаткова відпустка", "90 днів"]
    }
  ]
}
```

---

## ПОШУК ПО ЗАКОНАХ (простий, без embeddings)

```typescript
// server/src/services/lawSearch.ts

interface LawChunk {
  id: string;
  article: string;
  part: string;
  title?: string;
  text: string;
  keywords: string[];
  lawTitle: string;
  sourceUrl: string;
}

function searchLaws(query: string, allChunks: LawChunk[], topK = 5): LawChunk[] {
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3);

  const scored = allChunks.map(chunk => {
    let score = 0;

    // Пошук по keywords
    for (const keyword of chunk.keywords) {
      for (const word of queryWords) {
        if (keyword.toLowerCase().includes(word)) {
          score += 3;
        }
      }
    }

    // Пошук по тексту
    for (const word of queryWords) {
      if (chunk.text.toLowerCase().includes(word)) {
        score += 1;
      }
    }

    // Пошук по назві статті
    if (chunk.title) {
      for (const word of queryWords) {
        if (chunk.title.toLowerCase().includes(word)) {
          score += 2;
        }
      }
    }

    return { chunk, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.chunk);
}
```

---

## SYSTEM PROMPT

```typescript
// server/src/prompts/system.ts

export const SYSTEM_PROMPT = `Ти — AI-асистент з прав військовослужбовців Збройних Сил України.

ПРАВИЛА:
1. Відповідай ТІЛЬКИ на основі наданого контексту із законодавства.
2. Якщо контексту недостатньо — чесно скажи: "Я не маю достатньо інформації. Рекомендую звернутися до військового адвоката."
3. ЗАВЖДИ цитуй конкретну статтю, частину, пункт закону.
4. Відповідай українською мовою.
5. Будь лаконічним але повним.
6. Якщо є можливість подати рапорт/скаргу — повідом про це.
7. НІКОЛИ не вигадуй статті законів.
8. Якщо питання не стосується прав військовослужбовців — ввічливо скажи що спеціалізуєшся тільки на цій темі.

ФОРМАТ ВІДПОВІДІ:
- Коротке пояснення (2-3 речення)
- Посилання на конкретні статті
- Що робити (практичні кроки)

Завжди завершуй: "⚠️ Це не юридична консультація. Для прийняття рішень зверніться до військового адвоката."`;
```

---

## СКЛАДАННЯ ПРОМПТУ

```typescript
// server/src/services/promptBuilder.ts

function buildPrompt(question: string, relevantChunks: LawChunk[]): string {
  const context = relevantChunks
    .map(chunk =>
      `📎 ${chunk.lawTitle}\n` +
      `   ${chunk.article}${chunk.part ? ', ' + chunk.part : ''}\n` +
      `   ${chunk.text}`
    )
    .join('\n\n---\n\n');

  return `Контекст із законодавства України:\n\n${context}\n\n---\n\nПитання військовослужбовця: ${question}`;
}
```

---

## CLAUDE API WRAPPER

```typescript
// server/src/services/claude.ts

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../prompts/system';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function askClaude(userPrompt: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userPrompt }
    ],
  });

  return response.content[0].type === 'text'
    ? response.content[0].text
    : '';
}
```

---

## EXPRESS СЕРВЕР

```typescript
// server/src/index.ts

import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes/chat';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', chatRouter);

app.listen(3001, () => {
  console.log('🛡️  Shchyt server running on http://localhost:3001');
});
```

```typescript
// server/src/routes/chat.ts

import { Router } from 'express';
import { searchLaws } from '../services/lawSearch';
import { buildPrompt } from '../services/promptBuilder';
import { askClaude } from '../services/claude';
import { loadAllLaws } from '../../laws/index';

const router = Router();
const allChunks = loadAllLaws();

router.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Порожнє повідомлення' });
  }

  try {
    // 1. Шукаємо релевантні фрагменти законів
    const relevantChunks = searchLaws(message, allChunks, 5);

    // 2. Складаємо промпт
    const prompt = buildPrompt(message, relevantChunks);

    // 3. Запитуємо Claude
    const answer = await askClaude(prompt);

    // 4. Повертаємо відповідь
    res.json({
      answer,
      sources: relevantChunks.map(c => ({
        law: c.lawTitle,
        article: `${c.article}${c.part ? ', ' + c.part : ''}`,
        sourceUrl: c.sourceUrl,
      })),
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

export { router as chatRouter };
```

---

## ПРІОРИТЕТ ЗАКОНІВ

### Перша партія (зроби першими — покривають 80% питань)
1. **ЗУ «Про соціальний і правовий захист військовослужбовців та членів їх сімей»** — грошове забезпечення, відпустки, соцгарантії, житло, виплати у разі поранення/загибелі
2. **ЗУ «Про військовий обов'язок і військову службу»** — мобілізація, строки, звільнення, переведення
3. **ЗУ «Про статус ветеранів війни, гарантії їх соціального захисту»** — статус УБД, пільги

### Друга партія (коли перша запрацює)
4. Указ Президента №214/2024 — зміни до Положення про проходження служби
5. Постанова КМУ про грошове забезпечення
6. Положення про ВЛК (зі змінами №262 від 27.04.2024)

### Де брати тексти
- zakon.rada.gov.ua — офіційні тексти
- Скопіювати HTML → прогнати через скрипт `scripts/parse-law.ts` → JSON

---

## ШАБЛОНИ ДОКУМЕНТІВ

```json
// templates/raport-nevyplata.json
{
  "type": "рапорт",
  "title": "Рапорт щодо невиплати грошового забезпечення",
  "fields": [
    { "id": "rank", "label": "Звання", "type": "select",
      "options": ["солдат", "старший солдат", "молодший сержант", "сержант", "старший сержант", "лейтенант", "старший лейтенант", "капітан", "майор"] },
    { "id": "period_from", "label": "Період невиплати з", "type": "text", "placeholder": "місяць/рік" },
    { "id": "period_to", "label": "Період невиплати по", "type": "text", "placeholder": "місяць/рік" },
    { "id": "amount_type", "label": "Тип виплати", "type": "select",
      "options": ["грошове забезпечення", "бойові", "додаткова винагорода"] }
  ],
  "template_text": "Командиру військової частини [НОМЕР В/Ч]\n\n[ЗВАННЯ] [ПІБ]\n\nРАПОРТ\n\nДоповідаю, що за період з {period_from} по {period_to} мені не було виплачено {amount_type}.\n\nВідповідно до ст. 9 Закону України «Про соціальний і правовий захист військовослужбовців та членів їх сімей», держава забезпечує військовослужбовцям достатній рівень грошового забезпечення.\n\nПрошу вжити заходів щодо виплати заборгованості.\n\n«___» ____________ 20__ року\n\n[ПІДПИС]",
  "note": "ПІБ, номер частини та підпис додаєте самостійно у роздрукований документ"
}
```

---

## ПОКРОКОВА ІНСТРУКЦІЯ ДЛЯ CLAUDE CODE

### Крок 1: Ініціалізація проекту

```
Створи проект shchyt зі структурою з цього документа.
Frontend: React + Vite + TypeScript + Tailwind CSS
Backend: Node.js + Express + TypeScript
Встанови залежності:
  client: react, react-dom, tailwindcss, @tailwindcss/vite, docxtemplater, pizzip, pdf-lib
  server: express, cors, @anthropic-ai/sdk, tsx, typescript, @types/express, @types/cors
Налаштуй vite proxy для /api → localhost:3001
Зроби щоб `npm run dev` запускало і клієнт і сервер одночасно.
```

### Крок 2: Бекенд

```
Створи Express сервер на порту 3001 з одним ендпоінтом POST /api/chat.
Використай system prompt, lawSearch і promptBuilder з цього документа.
Створи папку laws/ з одним тестовим JSON-файлом (скопіюй кілька статей
із ЗУ «Про соцзахист військовослужбовців» — ст. 9, 10-1, 15, 16, 18).
Запит до Claude API через @anthropic-ai/sdk.
API ключ з .env файлу.
```

### Крок 3: Фронтенд

```
Створи простий чат-інтерфейс. Темна тема, мобільний вигляд.
Головний екран: назва "Shchyt ⚖️", кнопка "Задати питання".
Чат: поле вводу, бульбашки повідомлень, блок джерел під відповіддю.
Підказки типових питань (5-6 штук).
Дисклеймер внизу: "Це не юридична консультація."
```

### Крок 4: Парсер законів

```
Створи скрипт scripts/parse-law.ts який:
1. Приймає URL сторінки з zakon.rada.gov.ua
2. Завантажує HTML
3. Парсить на chunks (по статтях та частинах)
4. Додає keywords (витягти основні іменники з тексту)
5. Зберігає як JSON у папку laws/
```

### Крок 5: Генерація документів

```
Кнопка "Завантажити рапорт (.docx)" з'являється автоматично у відповідях де це доречно.
6 шаблонів .docx (невиплата, відпустка, звільнення, ротація, ВЛК, скарга).
Генерація .docx через docxtemplater/pizzip прямо в браузері.
{ДАТА} підставляється автоматично, решта плейсхолдерів ({ПІБ}, {ЗВАННЯ}, тощо)
залишаються для ручного заповнення у Word/Google Docs.
```

---

## ЗАПУСК

```bash
# 1. Клонуй або створи проект
mkdir shchyt && cd shchyt

# 2. Після створення через Claude Code:
cp .env.example .env
# Додай свій ANTHROPIC_API_KEY в .env

# 3. Встанови залежності
npm install

# 4. Запусти
npm run dev

# 5. Відкрий http://localhost:5173
```

---

## ПОТІМ (коли захочеться покращити)

- [ ] Додати більше законів (парсером)
- [ ] Замінити keyword search на embeddings (pgvector)
- [ ] Додати offline режим (Service Worker + IndexedDB)
- [x] Додати більше шаблонів документів (6 шт: невиплата, відпустка, звільнення, ротація, ВЛК, скарга)
- [ ] Задеплоїти для друзів (Hetzner VPS або Vercel)
- [ ] PII-анонімізація запитів
- [ ] Показати волонтерській організації

---

*Цей файл можна використати як AGENTS.md в проекті.*
*Claude Code зможе прочитати його і зрозуміти що робити.*
