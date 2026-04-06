import { Router, type Request, type Response } from 'express';
import { Resend } from 'resend';
import { logger } from '../logger.ts';

const router = Router();

const МАКС_РОЗМІР_PDF = 5_000_000; // 5MB

router.post('/', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const emailTo = process.env.FEEDBACK_EMAIL;

    if (!apiKey || !emailTo) {
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

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: 'Shchyt Feedback <onboarding@resend.dev>',
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
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    logger.info({ type, hasAttachment: attachments.length > 0 }, 'Feedback відправлено');
    res.json({ ok: true });
  } catch (помилка) {
    logger.error({ помилка }, 'Помилка відправки feedback');
    res.status(500).json({ error: 'Не вдалося відправити зворотній зв\'язок' });
  }
});

export default router;
