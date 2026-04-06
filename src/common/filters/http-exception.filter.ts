import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

type ExceptionResponseBody = {
  success: false;
  message: string;
  messageCode: string;
  errors?: string[];
  timestamp: string;
  path: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status: HttpStatus = isHttpException
      ? (exception.getStatus() as HttpStatus)
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    const normalized = this.normalizeExceptionResponse(exceptionResponse);

    const body: ExceptionResponseBody = {
      success: false,
      message: normalized.message,
      messageCode:
        normalized.messageCode ?? this.getDefaultMessageCodeByStatus(status),
      errors: normalized.errors,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(body);
  }

  private normalizeExceptionResponse(exceptionResponse: unknown): {
    message: string;
    messageCode?: string;
    errors?: string[];
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
