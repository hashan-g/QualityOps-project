import { describe, expect, it } from 'vitest';
import { isDirectExecution } from './bootstrap-admin.js';

describe('Admin Bootstrap CLI — Unit Tests', () => {
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

    it('handles Windows drive letter casing differences gracefully', () => {
      const metaUrl = 'file:///h:/QualityOps%20project/apps/api/src/scripts/bootstrap-admin.ts';
      const argvPath = 'H:\\QualityOps project\\apps\\api\\src\\scripts\\bootstrap-admin.ts';
      expect(isDirectExecution(metaUrl, argvPath)).toBe(true);
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
