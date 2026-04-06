import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Chat from './Chat';
import * as api from '../services/api';
import * as docxGenerator from '../services/docxGenerator';

vi.mock('../services/api');
vi.mock('../services/docxGenerator');

describe('Chat', () => {
  const mockSendMessage = vi.mocked(api.sendMessage);

  beforeEach(() => {
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue({ answer: 'Відповідь від AI', sources: [] });
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('відображає поле вводу', () => {
    render(<Chat />);
    expect(screen.getByPlaceholderText(/Введіть ваше питання/i)).toBeInTheDocument();
  });

  it('відображає кнопку надсилання', () => {
    render(<Chat />);
    expect(screen.getByRole('button', { name: /Надіслати/i })).toBeInTheDocument();
  });

  it('надсилає повідомлення при кліку на "Надіслати"', async () => {
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Яке моє право?');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(mockSendMessage).toHaveBeenCalledWith('Яке моє право?', [], undefined);
  });

  it('надсилає повідомлення при натисканні Enter', async () => {
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Яке моє право?{Enter}');
    expect(mockSendMessage).toHaveBeenCalledWith('Яке моє право?', [], undefined);
  });

  it('відображає повідомлення користувача після надсилання', async () => {
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Яке моє право?');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(screen.getByText('Яке моє право?')).toBeInTheDocument();
  });

  it('відображає відповідь від AI', async () => {
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Питання');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    await waitFor(() => {
      expect(screen.getByText('Відповідь від AI')).toBeInTheDocument();
    });
  });

  it('очищає поле вводу після надсилання', async () => {
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i) as HTMLInputElement;
    await userEvent.type(input, 'Питання');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(input.value).toBe('');
  });

  it('відображає індикатор прогресу під час очікування відповіді', async () => {
    mockSendMessage.mockImplementation(() => new Promise(() => {}));
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Питання');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(screen.getByText(/Пошук у базі законів/i)).toBeInTheDocument();
  });

  it('відображає помилку якщо API недоступний', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Мережева помилка'));
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Питання');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    await waitFor(() => {
      expect(screen.getByText(/Мережева помилка/i)).toBeInTheDocument();
    });
  });

  it('не надсилає порожнє повідомлення', async () => {
    render(<Chat />);
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  describe('підказки в чаті', () => {
    it('відображає підказки коли чат порожній', () => {
      render(<Chat />);
      expect(screen.getByText(/Типові питання/i)).toBeInTheDocument();
    });

    it('відображає кілька підказок', () => {
      render(<Chat />);
      const підказки = screen.getAllByTestId('підказка');
      expect(підказки.length).toBeGreaterThanOrEqual(5);
    });

    it('клік на підказку одразу відправляє повідомлення', async () => {
      render(<Chat />);
      const підказка = screen.getByText(/Чи маю я право на відпустку/i);
      await userEvent.click(підказка);
      expect(mockSendMessage).toHaveBeenCalledWith('Чи маю я право на відпустку під час служби?', [], undefined);
    });

    it('ховає підказки після надсилання повідомлення', async () => {
      render(<Chat />);
      const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
      await userEvent.type(input, 'Питання');
      await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
      await waitFor(() => {
        expect(screen.queryByText(/Типові питання/i)).not.toBeInTheDocument();
      });
    });
  });

  // TODO: увімкнути коли шаблони будуть доопрацьовані
  describe.skip('кнопка завантаження .docx', () => {
    it('відображає кнопку завантаження рапорту коли шаблон розпізнано', async () => {
      mockSendMessage.mockResolvedValueOnce({
        answer: 'Ви маєте право на відпустку згідно закону.',
        sources: [],
      });
      render(<Chat />);
      const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
      await userEvent.type(input, 'відпустка');
      await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
      await waitFor(() => {
        expect(screen.getByTestId('download-docx-button')).toBeInTheDocument();
        expect(screen.getByTestId('download-docx-button')).toHaveTextContent(/Завантажити рапорт/i);
      });
    });

    it('відображає кнопку завантаження скарги для шаблону skarga', async () => {
      mockSendMessage.mockResolvedValueOnce({
        answer: 'Ви можете оскаржити це рішення.',
        sources: [],
      });
      render(<Chat />);
      const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
      await userEvent.type(input, 'оскаржити');
      await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
      await waitFor(() => {
        expect(screen.getByTestId('download-docx-button')).toHaveTextContent(/Завантажити скаргу/i);
      });
    });

    it('викликає generateDocx при кліку на кнопку завантаження', async () => {
      const mockGenerateDocx = vi.mocked(docxGenerator.generateDocx);
      mockGenerateDocx.mockResolvedValue(new Blob(['test'], { type: 'application/octet-stream' }));

      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
      const mockRevokeObjectURL = vi.fn();
      const origCreateObjectURL = global.URL.createObjectURL;
      const origRevokeObjectURL = global.URL.revokeObjectURL;
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      let createdAnchor: HTMLAnchorElement | null = null;
      const mockClick = vi.fn();
      const origCreate = Document.prototype.createElement;
      vi.spyOn(document, 'createElement').mockImplementation(function (this: Document, tag: string) {
        const el = origCreate.call(this, tag);
        if (tag === 'a') {
          el.click = mockClick;
          createdAnchor = el as HTMLAnchorElement;
        }
        return el;
      } as typeof document.createElement);

      try {
        mockSendMessage.mockResolvedValueOnce({
          answer: 'Ви маєте право на відпустку згідно закону.',
          sources: [],
        });
        render(<Chat />);
        const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
        await userEvent.type(input, 'відпустка');
        await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
        await waitFor(() => {
          expect(screen.getByTestId('download-docx-button')).toBeInTheDocument();
        });
        await userEvent.click(screen.getByTestId('download-docx-button'));
        await waitFor(() => {
          expect(mockGenerateDocx).toHaveBeenCalledWith('raport-vidpustka');
        });
        expect(mockCreateObjectURL).toHaveBeenCalled();
        expect(mockClick).toHaveBeenCalled();
        expect(createdAnchor).not.toBeNull();
        expect(createdAnchor!.download).toBe('raport-vidpustka.docx');
      } finally {
        vi.mocked(document.createElement).mockRestore();
        global.URL.createObjectURL = origCreateObjectURL;
        global.URL.revokeObjectURL = origRevokeObjectURL;
      }
    });
  });

  describe('джерела у відповідях', () => {
    it('відображає джерела після відповіді AI', async () => {
      mockSendMessage.mockResolvedValueOnce({
        answer: 'Відповідь',
        sources: [
          {
            law: 'Про соціальний захист',
            article: 'Стаття 9',
            sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12',
          },
        ],
      });
      render(<Chat />);
      const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
      await userEvent.type(input, 'Питання');
      await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
      await waitFor(() => {
        expect(screen.getByText(/Стаття 9/i)).toBeInTheDocument();
        expect(screen.getByText(/Джерела/i)).toBeInTheDocument();
      });
    });

    it('не відображає секцію джерел якщо джерела порожні', async () => {
      mockSendMessage.mockResolvedValueOnce({ answer: 'Відповідь', sources: [] });
      render(<Chat />);
      const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
      await userEvent.type(input, 'Питання');
      await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
      await waitFor(() => {
        expect(screen.getByText('Відповідь')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Джерела/i)).not.toBeInTheDocument();
    });
  });

  describe('збереження чату в localStorage', () => {
    const STORAGE_KEY = 'shchyt-chat';

    it('відновлює збережені повідомлення при mount', () => {
      const saved = {
        messages: [
          { role: 'user', text: 'Збережене питання' },
          { role: 'assistant', text: 'Збережена відповідь', sources: [] },
        ],
        summary: null,
        summarizedUpTo: 0,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      render(<Chat />);
      expect(screen.getByText('Збережене питання')).toBeInTheDocument();
      expect(screen.getByText('Збережена відповідь')).toBeInTheDocument();
    });

    it('зберігає повідомлення в localStorage після надсилання', async () => {
      render(<Chat />);
      const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
      await userEvent.type(input, 'Нове питання');
      await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
      await waitFor(() => {
        expect(screen.getByText('Відповідь від AI')).toBeInTheDocument();
      });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.messages).toHaveLength(2);
      expect(stored.messages[0].text).toBe('Нове питання');
      expect(stored.messages[1].text).toBe('Відповідь від AI');
    });

    it('очищує localStorage при натисканні "Новий чат"', async () => {
      const saved = {
        messages: [
          { role: 'user', text: 'Питання' },
          { role: 'assistant', text: 'Відповідь', sources: [] },
        ],
        summary: null,
        summarizedUpTo: 0,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      render(<Chat />);
      expect(screen.getByText('Питання')).toBeInTheDocument();
      // Натискаємо "Новий чат" — з'являється попап підтвердження
      await userEvent.click(screen.getByRole('button', { name: /Новий чат/i }));
      expect(screen.getByText(/Поточну бесіду буде видалено/)).toBeInTheDocument();
      // Натискаємо "Почати новий без збереження"
      await userEvent.click(screen.getByRole('button', { name: /Почати новий без збереження/i }));
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(screen.queryByText('Питання')).not.toBeInTheDocument();
    });

    it('при невалідному JSON в localStorage — чат починає з нуля', () => {
      localStorage.setItem(STORAGE_KEY, '{invalid json!!!');
      render(<Chat />);
      expect(screen.getByPlaceholderText(/Введіть ваше питання/i)).toBeInTheDocument();
      expect(screen.getByText(/Типові питання/i)).toBeInTheDocument();
    });

    it('при невалідній структурі в localStorage — чат починає з нуля', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: 'not-an-array' }));
      render(<Chat />);
      expect(screen.getByText(/Типові питання/i)).toBeInTheDocument();
    });

    it('при повідомленнях без обовʼязкових полів — чат починає з нуля', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: [{ foo: 'bar' }],
        summary: null,
        summarizedUpTo: 0,
      }));
      render(<Chat />);
      expect(screen.getByText(/Типові питання/i)).toBeInTheDocument();
    });

    it('при невалідному summarizedUpTo — чат починає з нуля', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: [{ role: 'user', text: 'Питання' }],
        summary: null,
        summarizedUpTo: -1,
      }));
      render(<Chat />);
      expect(screen.getByText(/Типові питання/i)).toBeInTheDocument();
    });

    it('при summarizedUpTo більшому за кількість повідомлень — чат починає з нуля', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: [{ role: 'user', text: 'Питання' }],
        summary: null,
        summarizedUpTo: 100,
      }));
      render(<Chat />);
      expect(screen.getByText(/Типові питання/i)).toBeInTheDocument();
    });

    it('продовжує працювати при переповненні localStorage', async () => {
      const setItemOriginal = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn().mockImplementation((key: string) => {
        if (key === STORAGE_KEY) throw new DOMException('QuotaExceededError');
        return setItemOriginal.call(localStorage, key);
      });

      try {
        render(<Chat />);
        const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
        await userEvent.type(input, 'Тестове питання');
        await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
        await waitFor(() => {
          expect(screen.getByText('Відповідь від AI')).toBeInTheDocument();
        });
      } finally {
        Storage.prototype.setItem = setItemOriginal;
      }
    });
  });
});
