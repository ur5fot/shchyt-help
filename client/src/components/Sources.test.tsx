import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Sources from './Sources';
import type { Source } from '../services/api';

describe('Sources', () => {
  const джерела: Source[] = [
    {
      law: 'Про соціальний і правовий захист військовослужбовців',
      article: 'Стаття 9, Частина 1',
      sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2011-12#n100',
    },
    {
      law: 'Про військовий обов\'язок і військову службу',
      article: 'Стаття 26',
      sourceUrl: 'https://zakon.rada.gov.ua/laws/show/2232-12#n200',
    },
  ];

  it('відображає заголовок "Джерела"', () => {
    render(<Sources sources={джерела} />);
    expect(screen.getByText(/Джерела/i)).toBeInTheDocument();
  });

  it('відображає назву статті', () => {
    render(<Sources sources={джерела} />);
    expect(screen.getByText(/Стаття 9, Частина 1/i)).toBeInTheDocument();
  });

  it('відображає назву закону', () => {
    render(<Sources sources={джерела} />);
    expect(screen.getByText(/Про соціальний і правовий захист/i)).toBeInTheDocument();
  });

  it('відображає клікабельне посилання на закон', () => {
    render(<Sources sources={джерела} />);
    const посилання = screen.getAllByRole('link');
    expect(посилання.length).toBeGreaterThan(0);
    expect(посилання[0]).toHaveAttribute('href', джерела[0].sourceUrl);
  });

  it('посилання відкривається у новій вкладці', () => {
    render(<Sources sources={джерела} />);
    const посилання = screen.getAllByRole('link');
    expect(посилання[0]).toHaveAttribute('target', '_blank');
  });

  it('відображає всі джерела', () => {
    render(<Sources sources={джерела} />);
    expect(screen.getByText(/Стаття 9, Частина 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Стаття 26/i)).toBeInTheDocument();
  });

  it('повертає null якщо список джерел порожній', () => {
    const { container } = render(<Sources sources={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('повертає null якщо sources не передано', () => {
    // @ts-expect-error — перевіряємо захист від undefined
    const { container } = render(<Sources />);
    expect(container.firstChild).toBeNull();
  });

  it('показує індикатор верифікації коли verifiedSources > 0', () => {
    render(<Sources sources={джерела} verifiedSources={2} />);
    expect(screen.getByText(/Перевірено: 2 джерела/)).toBeInTheDocument();
  });

  it('не показує індикатор верифікації коли verifiedSources не передано', () => {
    render(<Sources sources={джерела} />);
    expect(screen.queryByText(/Перевірено/)).not.toBeInTheDocument();
  });

  it('не показує індикатор верифікації коли verifiedSources = 0', () => {
    render(<Sources sources={джерела} verifiedSources={0} />);
    expect(screen.queryByText(/Перевірено/)).not.toBeInTheDocument();
  });

  it('правильно відмінює "джерело" для 1', () => {
    render(<Sources sources={джерела} verifiedSources={1} />);
    expect(screen.getByText(/Перевірено: 1 джерело/)).toBeInTheDocument();
  });

  it('правильно відмінює "джерел" для 5+', () => {
    render(<Sources sources={джерела} verifiedSources={7} />);
    expect(screen.getByText(/Перевірено: 7 джерел/)).toBeInTheDocument();
  });
});
