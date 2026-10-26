import ExcelJS from 'exceljs';

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
}

export interface GenerateXlsxOptions {
  sheetName: string;
  columns: XlsxColumn[];
  rows: Record<string, unknown>[];
  summary?: Record<string, string | number> | undefined;
}

/**
 * Generates an XLSX workbook Buffer with typed cells, styled headers, and safe values.
 * Never evaluates untrusted formulas.
 */
export async function generateXlsx(options: GenerateXlsxOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QualityOps Platform';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(options.sheetName.substring(0, 31)); // Excel limit is 31 chars

  // 1. Add summary section if present
  if (options.summary && Object.keys(options.summary).length > 0) {
    const titleRow = worksheet.addRow(['--- REPORT SUMMARY ---']);
    titleRow.font = { bold: true, color: { argb: 'FF1A365D' } };

    for (const [label, val] of Object.entries(options.summary)) {
      const summaryRow = worksheet.addRow([label, val]);
      summaryRow.getCell(1).font = { bold: true };
    }
    worksheet.addRow([]); // Blank spacer row
  }

  // 2. Add columns and header
  const headerValues = options.columns.map((c) => c.header);
  const headerRow = worksheet.addRow(headerValues);

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2B6CB0' }, // QualityOps navy blue
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Set explicit column widths
  options.columns.forEach((col, idx) => {
    const worksheetCol = worksheet.getColumn(idx + 1);
    worksheetCol.width = col.width ?? Math.max(col.header.length + 4, 15);
  });

  // 3. Add data rows with strict typing
  for (const rowData of options.rows) {
    const rowValues = options.columns.map((col) => {
      const val = rowData[col.key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'number' || typeof val === 'boolean') return val;
      return String(val);
    });

    const dataRow = worksheet.addRow(rowValues);
    // Align numbers right, text left
    dataRow.eachCell((cell, _colNumber) => {
      if (typeof cell.value === 'number') {
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.alignment = { horizontal: 'left' };
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
