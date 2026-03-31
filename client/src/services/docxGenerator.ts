// Генерація .docx документів з шаблонів через docxtemplater
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

/**
 * Завантажує .docx шаблон, підставляє {ДАТА} і повертає Blob для завантаження.
 */
export async function generateDocx(templateId: string): Promise<Blob> {
  const response = await fetch(`/templates/docx/${templateId}.docx`);
  if (!response.ok) {
    throw new Error(`Не вдалося завантажити шаблон: ${templateId} (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const zip = new PizZip(arrayBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render({
    ДАТА: new Date().toLocaleDateString('uk-UA'),
  });

  const blob = doc.getZip().generate({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  return blob;
}
