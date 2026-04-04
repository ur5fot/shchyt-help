# Збереження чату після перезавантаження сторінки

## Overview
Зараз весь чат зберігається тільки в React state — при перезавантаженні сторінки вся розмова зникає. Сервер stateless (клієнт надсилає history + summary кожен раз). Потрібно зберігати чат в localStorage щоб він відновлювався після F5.

## Context
- `client/src/components/Chat.tsx` — головний компонент чату, містить state: `messages`, `summary`, `summarizedUpTo`, `input`, `loading`, `error`
- `client/src/services/api.ts` — інтерфейси `Source`, `HistoryMessage`, функція `sendMessage()`
- Сервер повністю stateless — клієнт надсилає `{ message, history, summary }` при кожному запиті
- Функція `очистити()` в Chat.tsx — скидає стан (кнопка "Новий чат")
- Тести: `client/src/components/Chat.test.tsx`
- Жодного localStorage/sessionStorage/IndexedDB не використовується наразі

## Development Approach
- **Testing approach**: Regular (код → тести)
- Кожен task включає тести
- Всі тести повинні проходити перед наступним task

## Implementation Steps

### Task 1: Зберігати та відновлювати чат з localStorage
- [x] В `client/src/components/Chat.tsx`:
  1. Створити константу `STORAGE_KEY = 'shchyt-chat'`
  2. Створити інтерфейс `ChatState = { messages: ChatMessage[], summary: string | null, summarizedUpTo: number }`
  3. Створити функцію `loadChat(): ChatState | null` — читає localStorage, парсить JSON, повертає null якщо порожньо або невалідно (try/catch)
  4. Створити функцію `saveChat(state: ChatState): void` — записує в localStorage
  5. Ініціалізувати стан з localStorage: в `useState` використати lazy initializer (`useState(() => loadChat()?.messages ?? [])` тощо)
  6. Додати `useEffect` що зберігає при зміні `[messages, summary, summarizedUpTo]` — але тільки якщо messages.length > 0 (не зберігати порожній чат)
  7. В функцію `очистити()` додати `localStorage.removeItem(STORAGE_KEY)`
- [x] Написати тести в `client/src/components/Chat.test.tsx`:
  - При mount з даними в localStorage — відображає збережені повідомлення
  - При надсиланні повідомлення — localStorage оновлюється
  - При натисканні "Новий чат" — localStorage очищується
  - При невалідному JSON в localStorage — чат починає з нуля (не крашиться)
  - Мокати localStorage через `vi.spyOn(Storage.prototype, 'getItem')` / `vi.spyOn(Storage.prototype, 'setItem')`
- [x] Запустити `npm test` — всі тести проходять
- [x] Запустити `npm run lint` — без помилок

### Task 2: Verify acceptance criteria
- [x] Всі тести проходять (`npm test`)
- [x] Лінтер проходить (`npm run lint`)
- [x] Чат зберігається після F5 (messages, summary, sources)
- [x] "Новий чат" очищує localStorage
- [x] Невалідний localStorage не ламає додаток

## Technical Details

**Ключ localStorage:** `shchyt-chat`

**Формат:**
```json
{
  "messages": [
    { "role": "user", "content": "Як звільнитись?" },
    { "role": "assistant", "content": "...", "sources": [...] }
  ],
  "summary": "Попереднє резюме діалогу...",
  "summarizedUpTo": 5
}
```

**Lazy initializer для useState:**
```typescript
const [messages, setMessages] = useState<ChatMessage[]>(() => {
  const saved = loadChat();
  return saved?.messages ?? [];
});
```

**useEffect для збереження:**
```typescript
useEffect(() => {
  if (messages.length > 0) {
    saveChat({ messages, summary, summarizedUpTo });
  }
}, [messages, summary, summarizedUpTo]);
```

## Post-Completion
- Перевірити розмір localStorage (обмеження ~5MB) — при дуже довгих розмовах може переповнитись
- Розглянути максимум повідомлень для збереження (наприклад, останні 50)
