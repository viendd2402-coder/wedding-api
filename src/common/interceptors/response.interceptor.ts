import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BYPASS_RESPONSE_ENVELOPE_KEY } from '../decorators/bypass-response-envelope.decorator';

type CommonApiResponse<T> = {
  success: true;
  message: string;
  data: T;
};

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  CommonApiResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<CommonApiResponse<T>> {
    const bypass = this.reflector.getAllAndOverride<boolean>(
      BYPASS_RESPONSE_ENVELOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (bypass) {
      return next.handle() as Observable<CommonApiResponse<T>>;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { method?: string }>();
    const method = request?.method ?? 'GET';
    const message = method === 'POST' ? 'Created successfully' : 'Success';

    return next.handle().pipe(
      map((data) => ({
        success: true,
        message,
        data,
      })),
    );
  }
}
