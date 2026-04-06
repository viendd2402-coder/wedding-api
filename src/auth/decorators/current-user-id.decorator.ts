import {
  UnauthorizedException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { Request } from 'express';

type AuthenticatedRequest = Request & {
  authUser?: {
    userId: number;
  };
};

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.authUser?.userId;
    if (!userId) {
      throw new UnauthorizedException({
        message: 'Không xác định được người dùng',
        messageCode: 'MSG_AUTH_USER_NOT_FOUND_IN_TOKEN',
      });
    }
    return userId;
  },
);
