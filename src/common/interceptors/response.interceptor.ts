import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<CommonApiResponse<T>> {
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
