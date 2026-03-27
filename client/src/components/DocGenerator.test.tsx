import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DocGenerator from './DocGenerator';

// Мокуємо pdfGenerator
vi.mock('../services/pdfGenerator', () => ({
  generatePdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

// Мокуємо URL.createObjectURL та URL.revokeObjectURL
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: vi.fn().mockReturnValue('blob:mock-url'),
});
Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn(),
});

describe('DocGenerator', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('рендерить заголовок шаблону', () => {
    render(<DocGenerator templateId="raport-nevyplata" onClose={mockOnClose} />);
    expect(screen.getByText(/Рапорт щодо невиплати грошового забезпечення/i)).toBeInTheDocument();
  });

  it('рендерить усі поля форми', () => {
    render(<DocGenerator templateId="raport-nevyplata" onClose={mockOnClose} />);
    expect(screen.getByLabelText(/Звання/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Період невиплати з/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Період невиплати по/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Тип виплати/i)).toBeInTheDocument();
  });

  it('рендерить кнопку генерації PDF', () => {
    render(<DocGenerator templateId="raport-nevyplata" onClose={mockOnClose} />);
    expect(screen.getByRole('button', { name: /Згенерувати PDF/i })).toBeInTheDocument();
  });

  it('рендерить кнопку закрити', () => {
    render(<DocGenerator templateId="raport-nevyplata" onClose={mockOnClose} />);
    expect(screen.getByRole('button', { name: /Скасувати/i })).toBeInTheDocument();
  });

  it('викликає onClose при натисканні кнопки скасувати', async () => {
    render(<DocGenerator templateId="raport-nevyplata" onClose={mockOnClose} />);
    await userEvent.click(screen.getByRole('button', { name: /Скасувати/i }));
    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it('показує помилку при відправці порожньої форми', async () => {
    render(<DocGenerator templateId="raport-nevyplata" onClose={mockOnClose} />);
    await userEvent.click(screen.getByRole('button', { name: /Згенерувати PDF/i }));
    expect(screen.getByText(/Заповніть усі обов'язкові поля/i)).toBeInTheDocument();
  });

  it('не показує помилку коли форма заповнена правильно', async () => {
    render(<DocGenerator templateId="raport-nevyplata" onClose={mockOnClose} />);

    // Заповнюємо текстові поля
    fireEvent.change(screen.getByLabelText(/Період невиплати з/i), {
      target: { value: 'жовтень 2024' },
    });
    fireEvent.change(screen.getByLabelText(/Період невиплати по/i), {
      target: { value: 'грудень 2024' },
    });

    await userEvent.click(screen.getByRole('button', { name: /Згенерувати PDF/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Заповніть усі обов'язкові поля/i)).not.toBeInTheDocument();
    });
  });

  it('рендерить шаблон рапорту на відпустку', () => {
    render(<DocGenerator templateId="raport-vidpustka" onClose={mockOnClose} />);
    expect(screen.getByText(/Рапорт на надання відпустки/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Вид відпустки/i)).toBeInTheDocument();
  });

  it('рендерить шаблон скарги', () => {
    render(<DocGenerator templateId="skarga" onClose={mockOnClose} />);
    expect(screen.getByText(/Скарга на неправомірні дії командира/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Суть порушення/i)).toBeInTheDocument();
  });

  it('рендерить нотатку про ПІБ та номер частини', () => {
    render(<DocGenerator templateId="raport-nevyplata" onClose={mockOnClose} />);
    expect(screen.getByText(/ПІБ, номер частини та підпис/i)).toBeInTheDocument();
  });
});
