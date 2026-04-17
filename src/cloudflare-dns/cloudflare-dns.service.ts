import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateCloudflareDnsRecordDto } from './dto/create-dns-record.dto';
import type { ListCloudflareDnsRecordsQueryDto } from './dto/list-dns-records.query.dto';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

type CfDnsRecordResult = {
  id: string;
  type: string;
  name: string;
  content: string;
  proxiable: boolean;
  proxied: boolean;
  ttl: number;
  locked: boolean;
  zone_id: string;
  zone_name: string;
  created_on: string;
  modified_on: string;
};

type CfApiEnvelope<T> = {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: T;
};

type CfListResult = CfApiEnvelope<CfDnsRecordResult[]>;

@Injectable()
export class CloudflareDnsService {
  constructor(private readonly configService: ConfigService) {}

  /** Dùng cho worker/queue: không ném lỗi khi chưa cấu hình. */
  isConfigured(): boolean {
    const token = this.configService.get<string>('CLOUDFLARE_API_TOKEN', '');
    const zoneId = this.configService.get<string>('CLOUDFLARE_ZONE_ID', '');
    return Boolean(token?.trim() && zoneId?.trim());
  }

  /**
   * Tạo bản ghi A/CNAME cho `subdomainLabel` + `rootDomain` nếu chưa có (idempotent).
   * Zone Cloudflare phải trùng apex `rootDomain`.
   */
  async ensureSubdomainDnsRecord(opts: {
    subdomainLabel: string;
    rootDomain: string;
    type: 'A' | 'CNAME';
    content: string;
    proxied?: boolean;
  }): Promise<
    | 'created'
    | 'unchanged'
    | 'skipped_missing_params'
    | 'skipped_not_configured'
  > {
    const label = opts.subdomainLabel.trim().toLowerCase();
    const root = opts.rootDomain
      .trim()
      .toLowerCase()
      .replace(/^\.+/, '')
      .replace(/\.+$/, '');
    const content = opts.content.trim();
    if (!label || !root || !content) {
      return 'skipped_missing_params';
    }
    if (!this.isConfigured()) {
      return 'skipped_not_configured';
    }
    const fqdn = `${label}.${root}`;
    const existing = await this.listDnsRecords({
      name: fqdn,
      type: opts.type,
    });
    if (existing.length > 0) {
      return 'unchanged';
    }
    try {
      await this.createDnsRecord({
        type: opts.type,
        name: label,
        content,
        ttl: 1,
        proxied: opts.proxied,
      });
      return 'created';
    } catch (err: unknown) {
      if (err instanceof BadGatewayException) {
        const m = err.message.toLowerCase();
        if (
          m.includes('already exists') ||
          m.includes('duplicate') ||
          m.includes('81053')
        ) {
          return 'unchanged';
        }
      }
      throw err;
    }
  }

  private getCredentials(): { token: string; zoneId: string } {
    const token = this.configService.get<string>('CLOUDFLARE_API_TOKEN', '');
    const zoneId = this.configService.get<string>('CLOUDFLARE_ZONE_ID', '');
    if (!token?.trim() || !zoneId?.trim()) {
      throw new ServiceUnavailableException(
        'Cloudflare chưa cấu hình: cần CLOUDFLARE_API_TOKEN và CLOUDFLARE_ZONE_ID.',
      );
    }
    return { token: token.trim(), zoneId: zoneId.trim() };
  }

  private defaultProxied(
    type: CreateCloudflareDnsRecordDto['type'],
    explicit?: boolean,
  ): boolean {
    if (explicit !== undefined) {
      return explicit;
    }
    return type !== 'TXT';
  }

  async createDnsRecord(
    dto: CreateCloudflareDnsRecordDto,
  ): Promise<CfDnsRecordResult> {
    const { token, zoneId } = this.getCredentials();
    const body = {
      type: dto.type,
      name: dto.name,
      content: dto.content,
      ttl: dto.ttl ?? 1,
      proxied: this.defaultProxied(dto.type, dto.proxied),
    };

    const res = await fetch(
      `${CF_API_BASE}/zones/${zoneId}/dns_records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    return this.parseSingleResult<CfDnsRecordResult>(res);
  }

  async listDnsRecords(
    query: ListCloudflareDnsRecordsQueryDto,
  ): Promise<CfDnsRecordResult[]> {
    const { token, zoneId } = this.getCredentials();
    const params = new URLSearchParams();
    if (query.name) {
      params.set('name', query.name);
    }
    if (query.type) {
      params.set('type', query.type);
    }
    const qs = params.toString();
    const url = `${CF_API_BASE}/zones/${zoneId}/dns_records${qs ? `?${qs}` : ''}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = (await this.readJson(res)) as CfListResult;
    if (!json.success) {
      this.throwFromCf(res.status, json);
    }
    return json.result ?? [];
  }

  async deleteDnsRecord(recordId: string): Promise<{ id: string }> {
    const { token, zoneId } = this.getCredentials();
    const res = await fetch(
      `${CF_API_BASE}/zones/${zoneId}/dns_records/${encodeURIComponent(recordId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    return this.parseSingleResult<{ id: string }>(res);
  }

  private async readJson(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BadGatewayException(
        `Cloudflare trả về không phải JSON (HTTP ${res.status}).`,
      );
    }
  }

  private async parseSingleResult<T>(res: Response): Promise<T> {
    const json = (await this.readJson(res)) as CfApiEnvelope<T>;
    if (!json.success) {
      this.throwFromCf(res.status, json);
    }
    if (json.result === undefined || json.result === null) {
      throw new BadGatewayException('Cloudflare không trả về result.');
    }
    return json.result;
  }

  private throwFromCf(
    httpStatus: number,
    json: CfApiEnvelope<unknown>,
  ): never {
    const first = json.errors?.[0];
    const msg =
      first?.message ??
      (Array.isArray(json.messages) && json.messages[0]) ??
      'Lỗi Cloudflare API.';
    if (httpStatus === 401 || httpStatus === 403) {
      throw new ServiceUnavailableException(msg);
    }
    throw new BadGatewayException(msg);
  }
}
