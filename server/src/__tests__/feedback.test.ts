// Тести для роуту POST /api/feedback
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

vi.mock('../../../laws/index.ts', () => ({
  loadAllLaws: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/vectorStore.ts', () => ({
  ініціалізуватиБД: vi.fn().mockResolvedValue({}),
  чиДоступнаБД: vi.fn().mockResolvedValue(false),
}));

import request from 'supertest';
import { createApp } from '../app.ts';
import { _скинутиTransporter } from '../routes/feedback.ts';

describe('POST /api/feedback', () => {
  let app: ReturnType<typeof createApp>;

  const smtpEnv = {
    SMTP_HOST: 'smtp.test.com',
    SMTP_USER: 'user@test.com',
    SMTP_PASS: 'password123',
    FEEDBACK_EMAIL: 'feedback@test.com',
  };

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
    _скинутиTransporter();
    // Встановлюємо SMTP змінні
    Object.assign(process.env, smtpEnv);
  });

  afterEach(() => {
    // Видаляємо SMTP змінні
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.FEEDBACK_EMAIL;
  });

  it('повертає 503 якщо SMTP не налаштований', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.FEEDBACK_EMAIL;

    const відповідь = await request(app)
      .post('/api/feedback')
      .send({ message: 'Тестове повідомлення' });

    expect(відповідь.status).toBe(503);
    expect(відповідь.body.error).toContain('тимчасово недоступний');
  });

  it('повертає 400 якщо повідомлення пусте', async () => {
    const відповідь = await request(app)
      .post('/api/feedback')
      .send({ message: '' });

    expect(відповідь.status).toBe(400);
    expect(відповідь.body.error).toContain('коротке');
  });

  it('повертає 400 якщо повідомлення занадто коротке', async () => {
    const відповідь = await request(app)
      .post('/api/feedback')
      .send({ message: 'Ок' });

    expect(відповідь.status).toBe(400);
    expect(відповідь.body.error).toContain('коротке');
  });

  it('повертає 400 якщо повідомлення відсутнє', async () => {
    const відповідь = await request(app)
      .post('/api/feedback')
      .send({});

    expect(відповідь.status).toBe(400);
    expect(відповідь.body.error).toContain('коротке');
  });

  it('повертає 400 якщо повідомлення довше 5000 символів', async () => {
    const довгеПовідомлення = 'А'.repeat(5001);

    const відповідь = await request(app)
      .post('/api/feedback')
      .send({ message: довгеПовідомлення });

    expect(відповідь.status).toBe(400);
    expect(відповідь.body.error).toContain('довге');
  });

  it('повертає 400 якщо PDF більше 5MB', async () => {
    // 5MB + 1 байт в base64
    const великийPdf = Buffer.alloc(5_000_001).toString('base64');

    const відповідь = await request(app)
      .post('/api/feedback')
      .send({ message: 'Тестове повідомлення', pdfBase64: великийPdf });

    expect(відповідь.status).toBe(400);
    expect(відповідь.body.error).toContain('великий');
  });

  it('успішна відправка з моком nodemailer', async () => {
    const відповідь = await request(app)
      .post('/api/feedback')
      .send({ message: 'Дякую за корисну відповідь!', type: 'good' });

    expect(відповідь.status).toBe(200);
    expect(відповідь.body.ok).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'user@test.com',
        to: 'feedback@test.com',
        subject: expect.stringContaining('Корисно'),
      }),
    );
  });

  it('успішна відправка з PDF вкладенням', async () => {
    const малийPdf = Buffer.from('fake-pdf-content').toString('base64');

    const відповідь = await request(app)
      .post('/api/feedback')
      .send({
        message: 'Відгук з вкладенням',
        type: 'suggestion',
        pdfBase64: малийPdf,
      });

    expect(відповідь.status).toBe(200);
    expect(відповідь.body.ok).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: 'chat-export.pdf',
          }),
        ]),
      }),
    );
  });

  it('використовує pdfFilename з запиту якщо надано', async () => {
    const малийPdf = Buffer.from('fake-pdf-content').toString('base64');

    const відповідь = await request(app)
      .post('/api/feedback')
      .send({
        message: 'Відгук з назвою файлу',
        type: 'suggestion',
        pdfBase64: малийPdf,
        pdfFilename: 'shchyt-2026-04-06.pdf',
      });

    expect(відповідь.status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: 'shchyt-2026-04-06.pdf',
          }),
        ]),
      }),
    );
  });

  it('санітизує небезпечний pdfFilename', async () => {
    const малийPdf = Buffer.from('fake-pdf-content').toString('base64');

    const відповідь = await request(app)
      .post('/api/feedback')
      .send({
        message: 'Відгук з небезпечною назвою',
        type: 'suggestion',
        pdfBase64: малийPdf,
        pdfFilename: '../../etc/passwd',
      });

    expect(відповідь.status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: '.._.._etc_passwd',
          }),
        ]),
      }),
    );
  });

  it('повертає 500 при помилці SMTP', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

    const відповідь = await request(app)
      .post('/api/feedback')
      .send({ message: 'Тестове повідомлення' });

    expect(відповідь.status).toBe(500);
    expect(відповідь.body.error).toContain('Не вдалося відправити');
  });

  it('приймає payload більше 10kb (окремий JSON ліміт 10mb для feedback)', async () => {
    // Генеруємо PDF ~15kb в base64 (~20kb) — це перевищує chat ліміт (10kb),
    // але feedback має окремий JSON ліміт 10mb
    const pdfBase64 = Buffer.alloc(15_000).toString('base64');

    const відповідь = await request(app)
      .post('/api/feedback')
      .send({ message: 'Тестове повідомлення', pdfBase64 });

    // Не повертає 413 (Payload Too Large) — JSON ліміт 10mb дозволяє
    expect(відповідь.status).toBe(200);
    expect(відповідь.body.ok).toBe(true);
  });

  describe('валідація type', () => {
    it('приймає type "good"', async () => {
      const відповідь = await request(app)
        .post('/api/feedback')
        .send({ message: 'Дякую за відповідь!', type: 'good' });

      expect(відповідь.status).toBe(200);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Корисно'),
        }),
      );
    });

    it('приймає type "bad"', async () => {
      const відповідь = await request(app)
        .post('/api/feedback')
        .send({ message: 'Некоректна відповідь', type: 'bad' });

      expect(відповідь.status).toBe(200);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Некорисно'),
        }),
      );
    });

    it('приймає type "suggestion"', async () => {
      const відповідь = await request(app)
        .post('/api/feedback')
        .send({ message: 'Пропоную додати функцію', type: 'suggestion' });

      expect(відповідь.status).toBe(200);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Пропозиція'),
        }),
      );
    });

    it('невідомий type замінюється на "suggestion"', async () => {
      const відповідь = await request(app)
        .post('/api/feedback')
        .send({ message: 'Повідомлення з невідомим типом', type: 'invalid_type' });

      expect(відповідь.status).toBe(200);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Пропозиція'),
        }),
      );
    });

    it('відсутній type замінюється на "suggestion"', async () => {
      const відповідь = await request(app)
        .post('/api/feedback')
        .send({ message: 'Повідомлення без типу' });

      expect(відповідь.status).toBe(200);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Пропозиція'),
        }),
      );
    });
  });
});
