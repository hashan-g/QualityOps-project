import { describe, expect, it } from 'vitest';
import {
  isDirectExecution,
  normalizePathForComparison,
  extractFilePath,
} from './bootstrap-admin.js';

describe('Admin Bootstrap CLI — Unit Tests', () => {
  describe('normalizePathForComparison', () => {
    it('converts backslashes to forward slashes', () => {
      expect(normalizePathForComparison('C:\\repo\\apps\\api\\script.ts', 'linux')).toBe(
        'c:/repo/apps/api/script.ts',
      );
    });

    it('strips leading slash before a Windows drive letter', () => {
      expect(normalizePathForComparison('/H:/repo/apps/api/script.ts', 'linux')).toBe(
        'h:/repo/apps/api/script.ts',
      );
      expect(normalizePathForComparison('/c:/repo/apps/api/script.ts', 'linux')).toBe(
        'c:/repo/apps/api/script.ts',
      );
    });

    it('normalizes Windows drive letter to lowercase', () => {
      expect(normalizePathForComparison('D:/repo/file.ts', 'linux')).toBe('d:/repo/file.ts');
      expect(normalizePathForComparison('d:/repo/file.ts', 'linux')).toBe('d:/repo/file.ts');
    });

    it('preserves POSIX path casing on Linux/macOS platforms', () => {
      expect(normalizePathForComparison('/opt/QualityOps/script.ts', 'linux')).toBe(
        '/opt/QualityOps/script.ts',
      );
      expect(normalizePathForComparison('/OPT/QualityOps/script.ts', 'linux')).toBe(
        '/OPT/QualityOps/script.ts',
      );
    });

    it('normalizes entire path to lowercase on win32 platform', () => {
      expect(normalizePathForComparison('C:/QualityOps/Apps/Api/Script.ts', 'win32')).toBe(
        'c:/qualityops/apps/api/script.ts',
      );
    });
  });

  describe('extractFilePath', () => {
    it('extracts decoded pathname from file:// URL', () => {
      expect(
        extractFilePath('file:///H:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts'),
      ).toBe('/H:/QualityOps project/apps/api/src/scripts/bootstrap-admin.ts');
    });

    it('passes raw filesystem paths through unchanged', () => {
      expect(extractFilePath('/usr/local/bin/node')).toBe('/usr/local/bin/node');
      expect(extractFilePath('H:\\QualityOps project\\script.ts')).toBe(
        'H:\\QualityOps project\\script.ts',
      );
    });
  });

  describe('isDirectExecution', () => {
    it('returns true when invoked directly with matching Windows absolute path', () => {
      const metaUrl = 'file:///H:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts';
      const argvPath = 'H:\\QualityOps project\\apps\\api\\src\\scripts\\bootstrap-admin.ts';
      expect(isDirectExecution(metaUrl, argvPath)).toBe(true);
    });

    it('returns true when invoked with matching relative path from root', () => {
      const metaUrl = 'file:///H:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts';
      const resolved = 'apps/api/src/scripts/bootstrap-admin.ts';
      expect(isDirectExecution(metaUrl, resolved)).toBe(true);
    });

    it('returns true when invoked with matching relative path from workspace', () => {
      const metaUrl = 'file:///H:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts';
      const resolved = 'src/scripts/bootstrap-admin.ts';
      expect(isDirectExecution(metaUrl, resolved)).toBe(true);
    });

    it('returns true when invoked with relative path having ./ prefix', () => {
      const metaUrl = 'file:///H:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts';
      const resolved = './apps/api/src/scripts/bootstrap-admin.ts';
      expect(isDirectExecution(metaUrl, resolved)).toBe(true);
    });

    it('handles Windows drive letter casing differences gracefully', () => {
      const metaUrl = 'file:///h:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts';
      const argvPath = 'H:\\QualityOps project\\apps\\api\\src\\scripts\\bootstrap-admin.ts';
      expect(isDirectExecution(metaUrl, argvPath)).toBe(true);
    });

    it('handles uppercase URL drive letter with lowercase argv drive letter', () => {
      const metaUrl = 'file:///H:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts';
      const argvPath = 'h:\\QualityOps project\\apps\\api\\src\\scripts\\bootstrap-admin.ts';
      expect(isDirectExecution(metaUrl, argvPath)).toBe(true);
    });

    it('handles Windows forward slash paths with drive letter casing differences', () => {
      const metaUrl = 'file:///h:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts';
      const argvPath = 'H:/QualityOps project/apps/api/src/scripts/bootstrap-admin.ts';
      expect(isDirectExecution(metaUrl, argvPath)).toBe(true);
    });

    it('preserves POSIX path case-sensitivity when running on POSIX platform', () => {
      const metaUrl = 'file:///opt/qualityops/apps/api/src/scripts/bootstrap-admin.ts';
      const matchingArgv = '/opt/qualityops/apps/api/src/scripts/bootstrap-admin.ts';
      const mismatchedCaseArgv = '/OPT/qualityops/apps/api/src/scripts/bootstrap-admin.ts';

      expect(isDirectExecution(metaUrl, matchingArgv, 'linux')).toBe(true);
      expect(isDirectExecution(metaUrl, mismatchedCaseArgv, 'linux')).toBe(false);
    });

    it('allows case-insensitivity on Windows platform', () => {
      const metaUrl = 'file:///opt/qualityops/apps/api/src/scripts/bootstrap-admin.ts';
      const mismatchedCaseArgv = '/OPT/qualityops/apps/api/src/scripts/bootstrap-admin.ts';

      expect(isDirectExecution(metaUrl, mismatchedCaseArgv, 'win32')).toBe(true);
    });

    it('returns false when invoked by a different script or test runner', () => {
      const metaUrl = 'file:///H:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts';
      const argvPath = 'H:\\QualityOps project\\node_modules\\vitest\\dist\\cli.js';
      expect(isDirectExecution(metaUrl, argvPath)).toBe(false);
    });

    it('returns false when argvPath is undefined or empty', () => {
      const metaUrl = 'file:///H:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts';
      expect(isDirectExecution(metaUrl, undefined)).toBe(false);
      expect(isDirectExecution(metaUrl, '')).toBe(false);
    });
  });
});
