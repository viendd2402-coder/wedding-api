import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION', 'ap-southeast-1');
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET', '') ?? '';
    this.publicBaseUrl =
      this.configService.get<string>('AWS_S3_PUBLIC_BASE_URL', '') ?? '';

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
      '',
    );

    this.client = new S3Client({
      region: this.region,
      ...(accessKeyId && secretAccessKey
        ? {
            credentials: {
              accessKeyId,
              secretAccessKey,
            },
          }
        : {}),
    });
  }

  async uploadAvatar(userId: number, file: Express.Multer.File): Promise<string> {
    if (!this.bucket) {
      throw new BadRequestException({
        message: 'Chưa cấu hình lưu trữ ảnh (S3).',
        messageCode: 'MSG_S3_NOT_CONFIGURED',
      });
    }

    const ext = MIME_TO_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException({
        message: 'Ảnh đại diện phải là JPEG, PNG, WebP hoặc GIF.',
        messageCode: 'MSG_AVATAR_INVALID_TYPE',
      });
    }

    const key = `avatars/${userId}/${randomUUID()}.${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000',
      }),
    );

    return key;
  }

  /**
   * DB lưu S3 object key; API trả về URL đầy đủ (CDN hoặc virtual-hosted S3).
   * Nếu giá trị cũ trong DB là full URL (http/https) thì trả nguyên để tương thích.
   */
  resolvePublicObjectUrl(
    keyOrLegacyUrl: string | null | undefined,
  ): string | null {
    if (keyOrLegacyUrl == null) {
      return null;
    }
    const raw = String(keyOrLegacyUrl).trim();
    if (raw.length === 0) {
      return null;
    }
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }
    const base = this.publicBaseUrl.replace(/\/$/, '');
    if (base.length > 0) {
      return `${base}/${raw}`;
    }
    if (!this.bucket) {
      return null;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${raw}`;
  }
}
