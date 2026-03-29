import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Message from './Message';

describe('Message', () => {
  it('відображає текст повідомлення', () => {
    render(<Message role="user" text="Яке моє право на відпустку?" />);
    expect(screen.getByText('Яке моє право на відпустку?')).toBeInTheDocument();
  });

  it('повідомлення користувача має відповідний клас', () => {
    render(<Message role="user" text="Питання" />);
    const bubble = screen.getByText('Питання').closest('[data-role]');
    expect(bubble).toHaveAttribute('data-role', 'user');
  });

  it('повідомлення асистента має відповідний клас', () => {
    render(<Message role="assistant" text="Відповідь" />);
    const bubble = screen.getByText('Відповідь').closest('[data-role]');
    expect(bubble).toHaveAttribute('data-role', 'assistant');
  });

  it('повідомлення користувача вирівнюється праворуч', () => {
    const { container } = render(<Message role="user" text="Питання" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('justify-end');
  });

  it('повідомлення асистента вирівнюється ліворуч', () => {
    const { container } = render(<Message role="assistant" text="Відповідь" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('justify-start');
  });

  it('асистент: рендерить Markdown (жирний текст)', () => {
    render(<Message role="assistant" text="**важливо**" />);
    const el = screen.getByText('важливо');
    expect(el.tagName).toBe('STRONG');
  });

  it('користувач: не рендерить Markdown', () => {
    render(<Message role="user" text="**не жирний**" />);
    expect(screen.getByText('**не жирний**')).toBeInTheDocument();
  });

  it('асистент: посилання відкриваються у новій вкладці', () => {
    render(<Message role="assistant" text="[посилання](https://example.com)" />);
    const link = screen.getByText('посилання');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
