import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

type AuthenticatedRequest = Request & {
  authUser?: {
    userId: number;
    email: string | null;
  };
};

type JwtPayload = {
  sub: number;
  email: string | null;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException({
        message: 'Thiếu token xác thực',
        messageCode: 'MSG_AUTH_TOKEN_MISSING',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      request.authUser = {
        userId: payload.sub,
        email: payload.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException({
        message: 'Token không hợp lệ hoặc đã hết hạn',
        messageCode: 'MSG_AUTH_TOKEN_INVALID',
      });
    }
  }

  private extractBearerToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
