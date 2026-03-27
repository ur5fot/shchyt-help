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

  it('відображає стан завантаження під час очікування відповіді', async () => {
    mockSendMessage.mockImplementation(() => new Promise(() => {}));
    render(<Chat initialMessage="" onBack={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Введіть ваше питання/i);
    await userEvent.type(input, 'Питання');
    await userEvent.click(screen.getByRole('button', { name: /Надіслати/i }));
    expect(screen.getByText(/Завантаження/i)).toBeInTheDocument();
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
});
