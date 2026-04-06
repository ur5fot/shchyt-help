import { Router, type Request, type Response } from 'express';
import nodemailer from 'nodemailer';
import { logger } from '../logger.ts';

const router = Router();

const МАКС_РОЗМІР_PDF = 5_000_000; // 5MB

// Lazy singleton transporter — одне TCP з'єднання
let _transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: parseInt(process.env.SMTP_PORT || '587') === 465,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    });
  }
  return _transporter;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const emailTo = process.env.FEEDBACK_EMAIL;

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !emailTo) {
      res.status(503).json({ error: 'Зворотній зв\'язок тимчасово недоступний' });
      return;
    }

    const { message, type: rawType, pdfBase64, pdfFilename } = req.body as {
      message?: string;
      type?: string;
      pdfBase64?: string;
      pdfFilename?: string;
    };

    const validTypes = ['good', 'bad', 'suggestion'] as const;
    const type = validTypes.includes(rawType as typeof validTypes[number]) ? rawType as typeof validTypes[number] : 'suggestion';

    if (!message || message.trim().length < 5) {
      res.status(400).json({ error: 'Повідомлення занадто коротке' });
      return;
    }

    if (message.trim().length > 5000) {
      res.status(400).json({ error: 'Повідомлення занадто довге (макс. 5000 символів)' });
      return;
    }

    // Перевірка PDF
    const attachments: { filename: string; content: Buffer }[] = [];
    if (pdfBase64) {
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      if (pdfBuffer.length > МАКС_РОЗМІР_PDF) {
        res.status(400).json({ error: 'PDF файл занадто великий (макс. 5MB)' });
        return;
      }
      attachments.push({
        filename: pdfFilename || 'chat-export.pdf',
        content: pdfBuffer,
      });
    }

    const typeLabel = type === 'good' ? '👍 Корисно' : type === 'bad' ? '👎 Некорисно' : '💡 Пропозиція';

    const transporter = getTransporter();

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: emailTo,
      subject: `[Щит] ${typeLabel} — зворотній зв'язок`,
      html: `
        <h2>${typeLabel}</h2>
        <p><strong>Повідомлення:</strong></p>
        <pre style="background:#f5f5f5;padding:12px;border-radius:8px;white-space:pre-wrap;">${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        ${attachments.length > 0 ? '<p>📎 PDF-файл бесіди додано.</p>' : ''}
        <hr>
        <p style="color:#888;font-size:12px;">Відправлено з Shchyt — ${new Date().toISOString()}</p>
      `,
      attachments,
    });

    logger.info({ type, hasAttachment: attachments.length > 0 }, 'Feedback відправлено');
    res.json({ ok: true });
  } catch (помилка) {
    logger.error({ помилка }, 'Помилка відправки feedback');
    res.status(500).json({ error: 'Не вдалося відправити зворотній зв\'язок' });
  }
});

// Для тестування — скидання singleton transporter
export function _скинутиTransporter() {
  _transporter = null;
}

export default router;
