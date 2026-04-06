import { Router, type Request, type Response } from 'express';
import nodemailer from 'nodemailer';
import { logger } from '../logger.ts';

const router = Router();

const МАКС_РОЗМІР_PDF = 5_000_000; // 5MB

router.post('/', async (req: Request, res: Response) => {
  try {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const emailTo = process.env.FEEDBACK_EMAIL;

    if (!smtpHost || !smtpUser || !smtpPass || !emailTo) {
      res.status(503).json({ error: 'Зворотній зв\'язок тимчасово недоступний' });
      return;
    }

    const { message, type, pdfBase64, pdfFilename } = req.body as {
      message?: string;
      type?: 'good' | 'bad' | 'suggestion';
      pdfBase64?: string;
      pdfFilename?: string;
    };

    if (!message || message.trim().length < 5) {
      res.status(400).json({ error: 'Повідомлення занадто коротке' });
      return;
    }

    if (message.length > 5000) {
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

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: emailTo,
      subject: `[Щит] ${typeLabel} — зворотній зв'язок`,
      html: `
        <h2>${typeLabel}</h2>
        <p><strong>Повідомлення:</strong></p>
        <pre style="background:#f5f5f5;padding:12px;border-radius:8px;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
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

export default router;
