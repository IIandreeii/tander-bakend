import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { CobranaCharge, CobranaChargeList, CreateCobranaChargeRequest } from './cobrana.types';

interface CobranaRequestOptions {
  method: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  idempotencyKey?: string;
}

@Injectable()
export class CobranaClient {
  private readonly logger = new Logger(CobranaClient.name);

  constructor(private readonly configService: ConfigService) {}

  async createCharge(payload: CreateCobranaChargeRequest, idempotencyKey?: string): Promise<CobranaCharge> {
    return this.request<CobranaCharge>({
      method: 'POST',
      path: '/charges',
      body: payload,
      idempotencyKey: idempotencyKey ?? randomUUID(),
    });
  }

  async getCharge(id: string): Promise<CobranaCharge> {
    return this.request<CobranaCharge>({
      method: 'GET',
      path: `/charges/${encodeURIComponent(id)}`,
    });
  }

  async listCharges(params?: { limit?: number; status?: string; externalRef?: string }): Promise<CobranaChargeList> {
    return this.request<CobranaChargeList>({
      method: 'GET',
      path: '/charges',
      query: params,
    });
  }

  async cancelCharge(id: string): Promise<CobranaCharge> {
    return this.request<CobranaCharge>({
      method: 'POST',
      path: `/charges/${encodeURIComponent(id)}/cancel`,
    });
  }

  private async request<T>(options: CobranaRequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(options.body !== undefined, options.idempotencyKey);
    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;

    this.logger.log(`→ ${options.method} ${url}`);

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(30_000),
    });

    const rawBody = await response.text();
    const parsedBody = this.parseBody(rawBody);

    this.logger.log(`← ${response.status} ${url} | ${rawBody}`);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'Cobrana request failed',
        status: response.status,
        body: parsedBody ?? rawBody,
      });
    }

    return parsedBody as T;
  }

  private buildHeaders(includeContentType: boolean, idempotencyKey?: string): HeadersInit {
    const apiKey = this.configService.getOrThrow<string>('COBRANA_API_KEY');

    return {
      Authorization: `Bearer ${apiKey}`,
      ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    };
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const baseUrl = this.configService.getOrThrow<string>('COBRANA_BASE_URL');
    const relativePath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(relativePath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private parseBody(body: string): unknown {
    if (body.length === 0) return null;
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }
}
