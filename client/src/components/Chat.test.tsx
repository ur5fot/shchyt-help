import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Chat from './Chat';
import * as api from '../services/api';

vi.mock('../services/api');

describe('Chat', () => {
  const mockSendMessage = vi.mocked(api.sendMessage);

  beforeEach(() => {
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue({ answer: 'Відповідь від AI', sources: [] });
  });

  it('відображає поле вводу', () => {
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Введіть ваше питання/i)).toBeInTheDocument();
  });

  it('відображає кнопку надсилання', () => {
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Надіслати/i })).toBeInTheDocument();
  });

  it('відображає кнопку "Назад"', () => {
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Назад/i })).toBeInTheDocument();
  });

  it('кнопка "Назад" викликає onBack', async () => {
    const onBack = vi.fn();
    render(<Chat initialMessage="" onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: /Назад/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('надсилає повідомлення при кліку на "Надіслати"', async () => {
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Яке моє право?');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(mockSendMessage).toHaveBeenCalledWith('Яке моє право?');
  });

  it('надсилає повідомлення при натисканні Enter', async () => {
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Яке моє право?{Enter}');
    expect(mockSendMessage).toHaveBeenCalledWith('Яке моє право?');
  });

  it('відображає повідомлення користувача після надсилання', async () => {
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Яке моє право?');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(screen.getByText('Яке моє право?')).toBeInTheDocument();
  });

  it('відображає відповідь від AI', async () => {
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Питання');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    await waitFor(() => {
      expect(screen.getByText('Відповідь від AI')).toBeInTheDocument();
    });
  });

  it('очищає поле вводу після надсилання', async () => {
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i) as HTMLInputElement;
    await userEvent.type(input, 'Питання');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(input.value).toBe('');
  });

  it('відображає "AI друкує..." під час очікування відповіді', async () => {
    mockSendMessage.mockImplementation(() => new Promise(() => {}));
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Питання');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(screen.getByText(/AI друкує/i)).toBeInTheDocument();
  });

  it('автоматично надсилає initialMessage якщо він непорожній', async () => {
    render(<Chat initialMessage="Автоматичне питання" onBack={vi.fn()} />);
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('Автоматичне питання');
    });
  });

  it('відображає помилку якщо API недоступний', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Мережева помилка'));
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Питання');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    await waitFor(() => {
      expect(screen.getByText(/Мережева помилка/i)).toBeInTheDocument();
    });
  });

  it('не надсилає порожнє повідомлення', async () => {
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  describe('підказки в чаті', () => {
    it('відображає підказки коли чат порожній', () => {
      render(<Chat initialMessage="" onBack={vi.fn()} />);
      expect(screen.getByText(/Типові питання/i)).toBeInTheDocument();
    });

    it('відображає кілька підказок', () => {
      render(<Chat initialMessage="" onBack={vi.fn()} />);
      const підказки = screen.getAllByTestId('підказка');
      expect(підказки.length).toBeGreaterThanOrEqual(5);
    });

    it('клік на підказку заповнює поле вводу', async () => {
      render(<Chat initialMessage="" onBack={vi.fn()} />);
      const підказка = screen.getByText(/Чи маю я право на відпустку/i);
      await userEvent.click(підказка);
      const input = screen.getByPlaceholderText(/Введіть ваше питання/i) as HTMLInputElement;
      expect(input.value).toBe('Чи маю я право на відпустку під час служби?');
    });

    it('ховає підказки після надсилання повідомлення', async () => {
      render(<Chat initialMessage="" onBack={vi.fn()} />);
      const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
      await userEvent.type(input, 'Питання');
      await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
      await waitFor(() => {
        expect(screen.queryByText(/Типові питання/i)).not.toBeInTheDocument();
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
      render(<Chat initialMessage="" onBack={vi.fn()} />);
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
      render(<Chat initialMessage="" onBack={vi.fn()} />);
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
