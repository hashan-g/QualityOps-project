import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../../config.js';
import type { ExportFormat } from '@qualityops/contracts';
import { NotFoundError, BadRequestError } from '../../../middleware/error.middleware.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ArtifactStorageService {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = path.resolve(process.cwd(), customBaseDir ?? config.REPORT_STORAGE_DIR);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Resolves and verifies an artifact path strictly within the storage directory,
   * defending against path traversal attacks.
   */
  public resolveSafePath(artifactId: string, format: ExportFormat): string {
    if (!UUID_REGEX.test(artifactId)) {
      throw new BadRequestError('Invalid artifact identifier format; UUID required');
    }

    const ext = format.toLowerCase();
    const filename = `${artifactId}.${ext}`;
    const resolvedPath = path.resolve(this.baseDir, filename);

    // Defense-in-depth: Ensure the resolved path begins with the base directory
    if (!resolvedPath.startsWith(this.baseDir)) {
      throw new BadRequestError('Path traversal detected');
    }

    return resolvedPath;
  }

  /**
   * Saves generated artifact buffer to disk.
   */
  public async saveArtifact(
    artifactId: string,
    format: ExportFormat,
    buffer: Buffer,
  ): Promise<{ filePath: string; sizeBytes: number }> {
    const filePath = this.resolveSafePath(artifactId, format);
    await fs.promises.writeFile(filePath, buffer);
    return {
      filePath,
      sizeBytes: buffer.byteLength,
    };
  }

  /**
   * Reads an artifact from disk as a stream.
   */
  public getArtifactStream(
    artifactId: string,
    format: ExportFormat,
  ): { stream: fs.ReadStream; sizeBytes: number; filename: string } {
    const filePath = this.resolveSafePath(artifactId, format);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError(`Report artifact "${artifactId}" not found or expired`);
    }

    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);
    const filename = `qualityops-report-${artifactId}.${format.toLowerCase()}`;

    return {
      stream,
      sizeBytes: stat.size,
      filename,
    };
  }

  /**
   * Checks if an artifact exists.
   */
  public artifactExists(artifactId: string, format: ExportFormat): boolean {
    try {
      const filePath = this.resolveSafePath(artifactId, format);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }
}

export const artifactStorage = new ArtifactStorageService();
