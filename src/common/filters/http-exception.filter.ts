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

    if (exception instanceof HttpException) {
      const status = exception.getStatus() as HttpStatus;
      const normalized = this.normalizeExceptionResponse(exception.getResponse());
      const logLine = `${request.method} ${request.url} ${status} ${normalized.message}${normalized.messageCode ? ` [${normalized.messageCode}]` : ''}`;
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(logLine);
      } else {
        this.logger.warn(logLine);
      }
      const body = this.buildBody(request.url, status, normalized);
      response.status(status).json(body);
      return;
    }

    if (exception instanceof APIError) {
      const status = this.resolveHttpStatusForPayOs(exception);
      const normalized = this.normalizePayOsApiError(exception);
      this.logger.warn(
        `PayOS APIError ${String(exception.status)}: ${exception.message}`,
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
      this.logger.warn(`PayOSError: ${exception.message}`);
      const body = this.buildBody(request.url, status, normalized);
      response.status(status).json(body);
      return;
    }

    if (exception instanceof Error) {
      const status = HttpStatus.INTERNAL_SERVER_ERROR;
      const msg = exception.message?.trim();
      this.logger.error(
        msg || 'Unhandled error',
        exception.stack ?? String(exception),
      );
      const body = this.buildBody(request.url, status, {
        message: msg || 'Internal server error',
        messageCode: 'INTERNAL_ERROR',
      });
      response.status(status).json(body);
      return;
    }

    this.logger.error('Unknown exception', String(exception));
    const body = this.buildBody(request.url, HttpStatus.INTERNAL_SERVER_ERROR, {
      message: 'Internal server error',
      messageCode: 'INTERNAL_SERVER_ERROR',
    });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
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
