# Генерація рапортів у .docx

## Overview
Замінити PDF-генерацію рапортів/скарг на .docx шаблони з плейсхолдерами для ручного заповнення в Word/Google Docs. 6 шаблонів (невиплата, відпустка, звільнення, ротація, ВЛК, скарга) з листами-підказками на 2-й сторінці. Видалити DocGenerator (форму), замінити на кнопку прямого завантаження .docx.

Повна специфікація: `docs/superpowers/specs/2026-03-31-docx-raports-design.md`

## Context
- `client/src/components/DocGenerator.tsx` — поточна форма з полями (видаляється)
- `client/src/services/pdfGenerator.ts` — `generatePdf()` видаляється, `exportChatToPdf()` залишається
- `client/src/services/templateDetector.ts` — розпізнавання типу шаблону (розширюється)
- `client/src/components/Chat.tsx` — інтеграція кнопки завантаження
- `templates/*.json` — старі JSON шаблони (видаляються)
- Залежності: `pdf-lib`, `@pdf-lib/fontkit` видаляються; `docxtemplater`, `pizzip` додаються

## Development Approach
- **Testing approach**: Regular (код спочатку, потім тести)
- Послідовна реалізація: спочатку інфраструктура (залежності, генератор), потім шаблони, потім UI, потім cleanup
- **CRITICAL: every task MUST include new/updated tests**
- **CRITICAL: all tests must pass before starting next task**
- **CRITICAL: update this plan file when scope changes during implementation**
- Зберігати `exportChatToPdf()` без змін

## Testing Strategy
- **Unit тести**: `docxGenerator.ts` (генерація Blob, підстановка дати), `templateDetector.ts` (нові патерни)
- **Валідація шаблонів**: перевірка що всі 6 .docx існують і коректно обробляються docxtemplater
- **Регресія**: існуючі тести `exportChatToPdf`, `templateDetector` не ламаються

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix

## Implementation Steps

### Task 1: Додати залежності та створити docxGenerator.ts
- [x] додати `docxtemplater` та `pizzip` в `client/package.json`
- [x] запустити `npm install`
- [x] створити `client/src/services/docxGenerator.ts` з функцією `generateDocx(templateId: string): Promise<Blob>`
- [x] реалізувати: fetch шаблону з `/templates/docx/{templateId}.docx`, розпакування через PizZip, підстановка `{ДАТА}` через docxtemplater, повернення Blob
- [x] створити тестовий .docx файл `templates/docx/test-template.docx` для тестування
- [x] написати тести для `docxGenerator.ts`: генерація повертає Blob, підстановка `{ДАТА}` працює, помилка при відсутньому шаблоні
- [x] запустити тести — мають проходити

### Task 2: Створити 6 .docx шаблонів
- [x] дослідити правила оформлення рапортів за Наказом МОУ №40 (шапка, звернення, дата, підпис)
- [x] створити `templates/docx/raport-nevyplata.docx` — рапорт невиплата + підказка (Постанова КМУ №704, Наказ МОУ №260)
- [x] створити `templates/docx/raport-vidpustka.docx` — рапорт відпустка + підказка (ЗУ «Про соцзахист», Положення)
- [x] створити `templates/docx/raport-zvilnennya.docx` — рапорт звільнення + підказка (ЗУ «Про військовий обов'язок»)
- [x] створити `templates/docx/raport-rotatsia.docx` — рапорт ротація + підказка (Положення про проходження служби)
- [x] створити `templates/docx/raport-vlk.docx` — рапорт ВЛК + підказка (Положення про ВЛК)
- [x] створити `templates/docx/skarga.docx` — скарга + підказка (ЗУ «Про соцзахист», ст. 7¹)
- [x] написати тест що всі 6 шаблонів існують і коректно відкриваються через PizZip/docxtemplater
- [x] видалити тестовий `templates/docx/test-template.docx`
- [x] запустити тести — мають проходити

### Task 3: Розширити templateDetector для нових типів
- [x] додати патерни в `client/src/services/templateDetector.ts`:
  - `raport-zvilnennya`: 'звільнен', 'демобіліз', 'закінч.*служб'
  - `raport-rotatsia`: 'ротаці', 'заміна на позиці'
  - `raport-vlk`: 'ВЛК', 'влк', 'лікарськ.*комісі', 'придатн.*служб', 'медичн.*огляд'
- [x] оновити тести `templateDetector.test.ts` — додати кейси для нових патернів
- [x] перевірити що існуючі патерни (невиплата, відпустка, скарга) не зламались
- [x] запустити тести — мають проходити

### Task 4: Оновити UI — замінити DocGenerator на кнопку завантаження
- [ ] в `Chat.tsx` замінити імпорт `DocGenerator` на `generateDocx` з `docxGenerator.ts`
- [ ] видалити стан `activeDocTemplate` (форма більше не потрібна)
- [ ] замінити блок DocGenerator/кнопки на просту кнопку "📄 Завантажити рапорт (.docx)" / "📄 Завантажити скаргу (.docx)"
- [ ] при кліку: `generateDocx(templateId)` → створити посилання → автозавантаження
- [ ] оновити тести `Chat.test.tsx` — кнопка завантаження замість форми
- [ ] запустити тести — мають проходити

### Task 5: Видалити старий код та залежності
- [ ] видалити `client/src/components/DocGenerator.tsx`
- [ ] видалити `templates/raport-nevyplata.json`, `templates/raport-vidpustka.json`, `templates/skarga.json`
- [ ] з `pdfGenerator.ts` видалити `generatePdf()`, `applyFields()`, `sanitizeField()`, `loadFont()`, `wrapLines()` — залишити тільки `exportChatToPdf()`
- [ ] видалити `pdf-lib` та `@pdf-lib/fontkit` з `client/package.json`
- [ ] запустити `npm install` для оновлення lock-файлу
- [ ] видалити тести `DocGenerator.test.tsx`
- [ ] оновити тести `pdfGenerator.test.ts` — видалити тести `generatePdf`, залишити `exportChatToPdf`
- [ ] запустити тести — мають проходити
- [ ] запустити `npm run lint` — виправити проблеми

### Task 6: Верифікація
- [ ] перевірити що всі вимоги з специфікації реалізовані
- [ ] перевірити що `exportChatToPdf` не зламався
- [ ] запустити повний test suite (`npm test`)
- [ ] запустити `npm run lint` — всі проблеми виправити
- [ ] перевірити що шаблони правильно завантажуються та генерують .docx

### Task 7: Оновити документацію
- [ ] оновити `CLAUDE.md` — замінити опис pdf-lib на docxtemplater, оновити опис шаблонів та DocGenerator
- [ ] оновити `feat.md` — позначити задачу виконаною
- [ ] оновити `client/src/constants.ts` якщо є текстові константи пов'язані зі старими шаблонами

## Technical Details

### Структура .docx шаблону
Кожен .docx створюється програмно через `docx` npm пакет (як скрипт) або вручну в Word. Містить плейсхолдери у форматі docxtemplater: `{ПІБ}`, `{ЗВАННЯ}`, `{ДАТА}` тощо. `{ДАТА}` підставляється автоматично при генерації, решта — для ручного заповнення.

### docxGenerator.ts
```ts
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export async function generateDocx(templateId: string): Promise<Blob> {
  const response = await fetch(`/templates/docx/${templateId}.docx`);
  const arrayBuffer = await response.arrayBuffer();
  const zip = new PizZip(arrayBuffer);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render({ ДАТА: new Date().toLocaleDateString('uk-UA') });
  const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return blob;
}
```

### Плейсхолдери (залишаються для ручного заповнення)
`{ПІБ}`, `{ЗВАННЯ}`, `{ПІДРОЗДІЛ}`, `{ПОСАДА}`, `{ПІБ_КОМАНДИРА}`, `{ЗВАННЯ_КОМАНДИРА}`, `{ПОСАДА_КОМАНДИРА}` та специфічні для типу.

### templateDetector — нові патерни
```ts
{ id: 'raport-zvilnennya', patterns: ['звільнен', 'демобіліз', /закінч.*служб/] },
{ id: 'raport-rotatsia', patterns: ['ротаці', 'заміна на позиці'] },
{ id: 'raport-vlk', patterns: ['ВЛК', 'влк', /лікарськ.*комісі/, /придатн.*служб/, /медичн.*огляд/] },
```

## Post-Completion

**Ручна перевірка:**
- Відкрити кожен з 6 .docx шаблонів у Word/Google Docs/LibreOffice
- Перевірити що плейсхолдери видимі та зрозумілі
- Перевірити що підказка на 2-й сторінці містить всю інформацію
- Перевірити що оформлення відповідає Наказу МОУ №40
- Протестувати в чаті: задати питання → отримати кнопку → завантажити .docx
