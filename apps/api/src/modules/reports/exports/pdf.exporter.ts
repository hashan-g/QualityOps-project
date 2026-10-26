import PDFDocument from 'pdfkit';

export interface PdfColumn {
  header: string;
  key: string;
  width?: number;
}

export interface GeneratePdfOptions {
  title: string;
  reportType: string;
  generatedAt: string;
  filters: Record<string, unknown>;
  summary: Record<string, string | number>;
  columns: PdfColumn[];
  rows: Record<string, unknown>[];
  notes?: string[] | undefined;
}

/**
 * Generates a clean, professional PDF report document using PDFKit.
 * Collects stream into a Buffer and resolves when complete.
 */
export async function generatePdf(options: GeneratePdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        layout: 'portrait',
        info: {
          Title: options.title,
          Author: 'QualityOps Platform',
          CreationDate: new Date(),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      // Header Banner
      doc.rect(40, 40, 515, 30).fill('#2b6cb0');
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#ffffff')
        .text('QUALITYOPS — MANUFACTURING QUALITY & PROCESS ANALYTICS', 50, 48);

      doc.moveDown(1.5);

      // Report Title & Meta
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a202c').text(options.title, 40, 85);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#718096')
        .text(
          `Report Type: ${options.reportType}  |  Generated At: ${options.generatedAt}`,
          40,
          110,
        );

      // Filters summary
      const filterDesc = Object.entries(options.filters)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join('  •  ');
      if (filterDesc) {
        doc
          .fontSize(8)
          .font('Helvetica-Oblique')
          .fillColor('#4a5568')
          .text(`Filters: ${filterDesc}`, 40, 125, { width: 515 });
      }

      // Summary KPI Grid
      let y = 145;
      if (options.summary && Object.keys(options.summary).length > 0) {
        doc.rect(40, y, 515, 55).fillAndStroke('#f7fafc', '#e2e8f0');

        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#2d3748')
          .text('Key Performance Indicators & Summary', 50, y + 8);

        const summaryEntries = Object.entries(options.summary);
        let kpiX = 50;
        const kpiY = y + 24;
        const kpiWidth = Math.floor(495 / Math.min(summaryEntries.length, 4));

        summaryEntries.slice(0, 4).forEach(([label, val]) => {
          doc
            .fontSize(7)
            .font('Helvetica-Bold')
            .fillColor('#718096')
            .text(label.toUpperCase(), kpiX, kpiY, { width: kpiWidth });
          doc
            .fontSize(12)
            .font('Helvetica-Bold')
            .fillColor('#2b6cb0')
            .text(String(val), kpiX, kpiY + 10, { width: kpiWidth });
          kpiX += kpiWidth;
        });

        y += 70;
      }

      // Notes / Interpretation Guidelines
      if (options.notes && options.notes.length > 0) {
        doc.rect(40, y, 515, 30).fillAndStroke('#ebf8ff', '#bee3f8');
        doc
          .fontSize(8)
          .font('Helvetica-Bold')
          .fillColor('#2b6cb0')
          .text('OPERATIONAL METRIC NOTICE:', 50, y + 6);
        doc
          .fontSize(7.5)
          .font('Helvetica')
          .fillColor('#2d3748')
          .text(options.notes.join(' '), 50, y + 16, { width: 495 });
        y += 40;
      }

      // Tabular Rows
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a202c').text('Detailed Records', 40, y);
      y += 15;

      // Table Header
      const tableWidth = 515;
      const numCols = options.columns.length;
      const colWidth = Math.floor(tableWidth / numCols);

      doc.rect(40, y, tableWidth, 18).fill('#edf2f7');
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#2d3748');

      options.columns.forEach((col, idx) => {
        doc.text(col.header, 44 + idx * colWidth, y + 5, { width: colWidth - 4 });
      });
      y += 20;

      // Table Rows (bounded to max 100 rows for PDF layout stability)
      const displayRows = options.rows.slice(0, 80);
      doc.font('Helvetica').fontSize(7).fillColor('#4a5568');

      for (let rIdx = 0; rIdx < displayRows.length; rIdx++) {
        const row = displayRows[rIdx];
        if (!row) continue;

        // Check if we need a new page
        if (y > 750) {
          doc.addPage();
          y = 40;
          // Re-draw table header on new page
          doc.rect(40, y, tableWidth, 18).fill('#edf2f7');
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#2d3748');
          options.columns.forEach((col, idx) => {
            doc.text(col.header, 44 + idx * colWidth, y + 5, { width: colWidth - 4 });
          });
          y += 20;
          doc.font('Helvetica').fontSize(7).fillColor('#4a5568');
        }

        if (rIdx % 2 === 1) {
          doc.rect(40, y, tableWidth, 14).fill('#f7fafc');
          doc.fillColor('#4a5568');
        }

        options.columns.forEach((col, idx) => {
          const rawVal = row[col.key];
          const textVal = rawVal === null || rawVal === undefined ? '' : String(rawVal);
          doc.text(textVal, 44 + idx * colWidth, y + 3, {
            width: colWidth - 4,
            ellipsis: true,
          });
        });
        y += 14;
      }

      if (options.rows.length > 80) {
        y += 10;
        doc
          .font('Helvetica-Oblique')
          .fontSize(7.5)
          .fillColor('#718096')
          .text(
            `Note: Showing first 80 of ${options.rows.length} records in PDF print. Export to CSV or XLSX for full dataset.`,
            40,
            y,
          );
      }

      // Finalize PDF
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
