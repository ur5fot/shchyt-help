import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('відображає "AI друкує..." під час очікування відповіді', async () => {
    mockSendMessage.mockImplementation(() => new Promise(() => {}));
    render(<Chat />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Питання');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(screen.getByText(/AI друкує/i)).toBeInTheDocument();
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

  describe('кнопка завантаження .docx', () => {
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
});
