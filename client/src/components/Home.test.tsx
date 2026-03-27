import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Home from './Home';

describe('Home', () => {
  it('відображає назву "Shchyt"', () => {
    render(<Home onStart={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Shchyt/i })).toBeInTheDocument();
  });

  it('відображає кнопку "Задати питання"', () => {
    render(<Home onStart={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Задати питання/i })).toBeInTheDocument();
  });

  it('відображає дисклеймер', () => {
    render(<Home onStart={vi.fn()} />);
    expect(screen.getByText(/Це не юридична консультація/i)).toBeInTheDocument();
  });

  it('кнопка "Задати питання" викликає onStart без аргументу', async () => {
    const onStart = vi.fn();
    render(<Home onStart={onStart} />);
    await userEvent.click(screen.getByRole('button', { name: /Задати питання/i }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith();
  });

  it('відображає підказки типових питань', () => {
    render(<Home onStart={vi.fn()} />);
    expect(screen.getByText(/Чи маю я право на відпустку/i)).toBeInTheDocument();
    expect(screen.getByText(/Які виплати належать після поранення/i)).toBeInTheDocument();
  });

  it('клік на підказку викликає onStart з текстом підказки', async () => {
    const onStart = vi.fn();
    render(<Home onStart={onStart} />);
    const підказка = screen.getByText(/Чи маю я право на відпустку/i);
    await userEvent.click(підказка);
    expect(onStart).toHaveBeenCalledWith('Чи маю я право на відпустку під час служби?');
  });

  it('відображає іконку ⚖️ у назві', () => {
    render(<Home onStart={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /⚖️/i })).toBeInTheDocument();
  });
});
