import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { APIError, PayOSError } from '@payos/node';
import { Request, Response } from 'express';

const LOG_PAYLOAD_MAX_CHARS = 12_000;

type ExceptionResponseBody = {
  success: false;
  message: string;
  messageCode: string;
  errors?: string[];
  details?: Record<string, unknown>;
  timestamp: string;
  path: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const reqCtx = this.buildRequestLogContext(request);

    if (exception instanceof HttpException) {
      const status = exception.getStatus() as HttpStatus;
      const rawResponse = exception.getResponse();
      const normalized = this.normalizeExceptionResponse(rawResponse);
      const detailPayload = {
        kind: 'HttpException',
        ...reqCtx,
        status,
        response: rawResponse,
        normalized,
        exceptionName: exception.name,
      };
      const stack = exception.stack;
      const httpTitle =
        status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? 'HTTP exception (5xx)'
          : 'HTTP exception (4xx)';
      this.logServerDetail(httpTitle, detailPayload, stack);
      const body = this.buildBody(request.url, status, normalized);
      response.status(status).json(body);
      return;
    }

    if (exception instanceof APIError) {
      const status = this.resolveHttpStatusForPayOs(exception);
      const normalized = this.normalizePayOsApiError(exception);
      this.logServerDetail(
        'PayOS APIError',
        {
          kind: 'PayOS.APIError',
          ...reqCtx,
          status,
          httpStatus: exception.status,
          code: exception.code,
          desc: exception.desc,
          message: exception.message,
          error: exception.error,
          normalized,
        },
        exception.stack,
      );
      const body = this.buildBody(request.url, status, normalized);
      response.status(status).json(body);
      return;
    }

    if (exception instanceof PayOSError) {
      const status = HttpStatus.BAD_REQUEST;
      const normalized = {
        message: exception.message || 'PayOS error',
        messageCode: 'PAYOS_ERROR',
      };
      this.logServerDetail(
        'PayOSError',
        {
          kind: 'PayOS.PayOSError',
          ...reqCtx,
          status,
          message: exception.message,
          normalized,
        },
        exception.stack,
      );
      const body = this.buildBody(request.url, status, normalized);
      response.status(status).json(body);
      return;
    }

    if (exception instanceof Error) {
      const status = HttpStatus.INTERNAL_SERVER_ERROR;
      const msg = exception.message?.trim();
      this.logServerDetail(
        'Unhandled Error (non-HTTP)',
        {
          kind: 'Error',
          ...reqCtx,
          name: exception.name,
          message: msg || '(empty message)',
          cause: this.serializeCause(exception.cause),
        },
        exception.stack ?? String(exception),
      );
      const body = this.buildBody(request.url, status, {
        message: msg || 'Internal server error',
        messageCode: 'INTERNAL_ERROR',
      });
      response.status(status).json(body);
      return;
    }

    this.logServerDetail(
      'Unknown thrown value',
      {
        kind: typeof exception,
        ...reqCtx,
        value: this.describeUnknownException(exception),
      },
      undefined,
    );
    const body = this.buildBody(request.url, HttpStatus.INTERNAL_SERVER_ERROR, {
      message: 'Internal server error',
      messageCode: 'INTERNAL_SERVER_ERROR',
    });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }

  private buildRequestLogContext(request: Request): Record<string, unknown> {
    const headers = request.headers ?? {};
    return {
      method: request.method,
      path: request.url,
      ip: request.ip,
      userAgent: typeof headers['user-agent'] === 'string' ? headers['user-agent'] : undefined,
      correlationId:
        (typeof headers['x-request-id'] === 'string' && headers['x-request-id']) ||
        (typeof headers['x-correlation-id'] === 'string' && headers['x-correlation-id']) ||
        undefined,
    };
  }

  private logServerDetail(
    title: string,
    payload: Record<string, unknown>,
    stack?: string,
  ): void {
    const serialized = this.serializeForLog(payload);
    const base = `${title} | ${serialized}`;
    this.logger.error(base, stack);
  }

  private serializeCause(cause: unknown): unknown {
    if (cause === undefined || cause === null) {
      return undefined;
    }
    if (cause instanceof Error) {
      return {
        name: cause.name,
        message: cause.message,
        stack: cause.stack,
        cause: this.serializeCause(cause.cause),
      };
    }
    return this.serializeForLog(cause);
  }

  private describeUnknownException(exception: unknown): unknown {
    if (exception === null || exception === undefined) {
      return String(exception);
    }
    if (typeof exception === 'object') {
      const ctor = (exception as object).constructor?.name;
      return {
        constructorName: ctor,
        stringTag: Object.prototype.toString.call(exception),
        keys:
          typeof Object.keys === 'function' ? Object.keys(exception as object) : [],
        serialized: this.serializeForLog(exception),
      };
    }
    return String(exception);
  }

  private serializeForLog(value: unknown, maxChars = LOG_PAYLOAD_MAX_CHARS): string {
    const seen = new WeakSet<object>();
    const inner = (v: unknown, depth: number): unknown => {
      if (depth > 6) {
        return '[MaxDepth]';
      }
      if (v === null || v === undefined) {
        return v;
      }
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        return v;
      }
      if (typeof v === 'bigint') {
        return v.toString();
      }
      if (v instanceof Error) {
        return {
          name: v.name,
          message: v.message,
          stack: v.stack,
        };
      }
      if (typeof v === 'function') {
        return `[Function ${v.name || 'anonymous'}]`;
      }
      if (typeof v !== 'object') {
        return String(v);
      }
      if (seen.has(v as object)) {
        return '[Circular]';
      }
      seen.add(v as object);
      if (Array.isArray(v)) {
        return v.map((item) => inner(item, depth + 1));
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as object)) {
        try {
          out[key] = inner((v as Record<string, unknown>)[key], depth + 1);
        } catch {
          out[key] = '[Unserializable]';
        }
      }
      return out;
    };
    try {
      const json = JSON.stringify(inner(value, 0));
      if (json.length <= maxChars) {
        return json;
      }
      return `${json.slice(0, maxChars)}…[truncated ${json.length - maxChars} chars]`;
    } catch {
      return '[serializeForLog failed]';
    }
  }

  private buildBody(
    path: string,
    status: HttpStatus,
    normalized: {
      message: string;
      messageCode?: string;
      errors?: string[];
      details?: Record<string, unknown>;
    },
  ): ExceptionResponseBody {
    return {
      success: false,
      message: normalized.message,
      messageCode:
        normalized.messageCode ?? this.getDefaultMessageCodeByStatus(status),
      errors: normalized.errors,
      details: normalized.details,
      timestamp: new Date().toISOString(),
      path,
    };
  }

  private resolveHttpStatusForPayOs(exception: APIError): HttpStatus {
    const s = exception.status;
    if (typeof s === 'number' && s >= 400 && s < 600) {
      return s as HttpStatus;
    }
    return HttpStatus.BAD_GATEWAY;
  }

  private normalizePayOsApiError(exception: APIError): {
    message: string;
    messageCode: string;
    errors?: string[];
    details?: Record<string, unknown>;
  } {
    const errors: string[] = [];
    if (exception.desc) {
      errors.push(String(exception.desc));
    }
    const details: Record<string, unknown> = {
      payosCode: exception.code ?? null,
      payosDesc: exception.desc ?? null,
    };
    if (
      typeof exception.error === 'object' &&
      exception.error !== null &&
      !Array.isArray(exception.error)
    ) {
      details.payosError = exception.error as Record<string, unknown>;
    }

    return {
      message: exception.message || 'PayOS request failed',
      messageCode: exception.code
        ? `PAYOS_${String(exception.code)}`
        : 'PAYOS_API_ERROR',
      errors: errors.length > 0 ? errors : undefined,
      details,
    };
  }

  private normalizeExceptionResponse(exceptionResponse: unknown): {
    message: string;
    messageCode?: string;
    errors?: string[];
    details?: Record<string, unknown>;
  } {
    if (typeof exceptionResponse === 'string') {
      return { message: exceptionResponse };
    }

    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const raw = exceptionResponse as {
        message?: string | string[];
        messageCode?: string;
      };

      if (Array.isArray(raw.message)) {
        return {
          message: 'Validation failed',
          errors: raw.message,
          messageCode: raw.messageCode,
        };
      }

      if (typeof raw.message === 'string') {
        return {
          message: raw.message,
          messageCode: raw.messageCode,
        };
      }
    }

    return { message: 'Internal server error' };
  }

  private getDefaultMessageCodeByStatus(status: HttpStatus): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
