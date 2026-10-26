/**
 * CSV Exporter with Spreadsheet Formula Injection (CSV Injection) Protection.
 *
 * Security Policy:
 * If any cell value begins with a formula trigger character ('=', '+', '-', '@', '\t', '\r'),
 * it is prefixed with a single quote (') so that spreadsheet processors (Excel, LibreOffice,
 * Google Sheets) treat the content strictly as text and do not execute embedded commands.
 */

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // Dangerous leading characters that trigger formula execution in spreadsheet software
  const formulaTriggers = ['=', '+', '-', '@', '\t', '\r'];
  let safeStr = str;

  if (formulaTriggers.some((char) => str.startsWith(char))) {
    safeStr = `'${str}`;
  }

  // RFC 4180 escaping: wrap in quotes if contains delimiter, quote, or newline
  if (
    safeStr.includes('"') ||
    safeStr.includes(',') ||
    safeStr.includes('\n') ||
    safeStr.includes('\r')
  ) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }

  return safeStr;
}

export function generateCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const headerLine = headers.map(sanitizeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(sanitizeCsvCell).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}
