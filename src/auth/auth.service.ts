import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserEntity } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';
import { S3Service } from '../storage/s3.service';
import { MailService } from '../mail/mail.service';
import {
  ForgotPasswordResponse,
  LoginResponse,
  ResetPasswordResponse,
  UserProfile,
} from './types/auth.types';

@Injectable()
export class AuthService implements OnModuleInit {
  private static readonly PASSWORD_SALT_ROUNDS = 10;
  private readonly googleOAuthClient = new OAuth2Client();

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // Kept to satisfy OnModuleInit; no-op for now

  onModuleInit(): void {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user?.password) {
      throw new UnauthorizedException({
        message: 'Email hoặc mật khẩu không đúng',
        messageCode: 'MSG_AUTH_INVALID_CREDENTIALS',
      });
    }

    const isPasswordValid = await compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        message: 'Email hoặc mật khẩu không đúng',
        messageCode: 'MSG_AUTH_INVALID_CREDENTIALS',
      });
    }

    return this.buildLoginResponse(user);
  }

  async socialLogin(dto: SocialLoginDto): Promise<LoginResponse> {
    const socialProfile =
      dto.provider === 'google'
        ? await this.verifyGoogleToken(dto.token)
        : await this.verifyFacebookToken(dto.token);

    const normalizedEmail = socialProfile.email.trim().toLowerCase();
    let user =
      dto.provider === 'google'
        ? await this.userRepository.findByGoogleId(socialProfile.providerId)
        : await this.userRepository.findByFacebookId(socialProfile.providerId);

    user ??= await this.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      user = await this.userRepository.save(
        this.userRepository.create({
          email: normalizedEmail,
          fullName: socialProfile.fullName ?? null,
          password: null,
          googleId: dto.provider === 'google' ? socialProfile.providerId : null,
          facebookId:
            dto.provider === 'facebook' ? socialProfile.providerId : null,
        }),
      );
    } else {
      if (!user.fullName && socialProfile.fullName) {
        user.fullName = socialProfile.fullName;
      }
      if (dto.provider === 'google' && !user.googleId) {
        user.googleId = socialProfile.providerId;
      }
      if (dto.provider === 'facebook' && !user.facebookId) {
        user.facebookId = socialProfile.providerId;
      }
      user = await this.userRepository.save(user);
    }

    return this.buildLoginResponse(user);
  }

  async register(dto: RegisterDto): Promise<UserProfile> {
    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException({
        message: 'Mật khẩu xác nhận không khớp',
        messageCode: 'MSG_PASSWORD_CONFIRMATION_DOES_NOT_MATCH',
      });
    }

    const normalizedEmail = dto.email.trim().toLowerCase();
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new BadRequestException({
        message: 'Email đã tồn tại',
        messageCode: 'MSG_EMAIL_ALREADY_EXISTS',
      });
    }

    const newUser = await this.userRepository.save(
      this.userRepository.create({
        email: normalizedEmail,
        password: await this.hashPassword(dto.password),
      }),
    );

    return this.buildPublicProfile(newUser);
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    let user = await this.userRepository.findByEmail(normalizedEmail);

    if (user) {
      const updatedUser = await this.userRepository.setResetToken(
        user.id,
        randomUUID(),
        new Date(Date.now() + 15 * 60 * 1000),
      );
      user = updatedUser ?? user;

      if (user.resetToken && user.resetTokenExpiresAt) {
        await this.mailService.sendResetPasswordEmail(
          user.email,
          user.resetToken,
          user.resetTokenExpiresAt,
        );
      }
    }

    return {
      message: 'Nếu email tồn tại, hệ thống đã gửi hướng dẫn đặt lại mật khẩu.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<ResetPasswordResponse> {
    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException({
        message: 'Mật khẩu xác nhận không khớp',
        messageCode: 'MSG_PASSWORD_CONFIRMATION_DOES_NOT_MATCH',
      });
    }

    const token = dto.token.trim();
    const user = await this.userRepository.findByResetToken(token);

    if (!user || !user.resetTokenExpiresAt) {
      throw new BadRequestException({
        message: 'Token đặt lại mật khẩu không hợp lệ',
        messageCode: 'MSG_RESET_PASSWORD_TOKEN_INVALID',
      });
    }

    if (user.resetTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        message: 'Token đặt lại mật khẩu đã hết hạn',
        messageCode: 'MSG_RESET_PASSWORD_TOKEN_EXPIRED',
      });
    }

    await this.userRepository.updatePasswordAndClearResetToken(
      user.id,
      await this.hashPassword(dto.password),
    );

    return {
      message: 'Đặt lại mật khẩu thành công.',
    };
  }

  async getProfile(userId: number): Promise<UserProfile> {
    const user = await this.findUserById(userId);
    return this.buildPublicProfile(user);
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
    file?: Express.Multer.File,
  ): Promise<UserProfile> {
    await this.findUserById(userId);

    const avatarUrlFromUpload = file
      ? await this.s3Service.uploadAvatar(userId, file)
      : undefined;

    const updatedUser = await this.userRepository.updateProfileById(
      userId,
      dto,
      avatarUrlFromUpload,
    );
    if (!updatedUser) {
      throw new NotFoundException({
        message: 'Không tìm thấy người dùng',
        messageCode: 'MSG_USER_NOT_FOUND',
      });
    }
    return this.buildPublicProfile(updatedUser);
  }

  private async findUserById(userId: number): Promise<UserEntity> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException({
        message: 'Không tìm thấy người dùng',
        messageCode: 'MSG_USER_NOT_FOUND',
      });
    }
    return user;
  }

  private buildPublicProfile(user: UserEntity): UserProfile {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? null,
      phone: user.phone ?? null,
      age: user.age ?? null,
      gender: user.gender ?? null,
      additionalContact: user.additionalContact ?? null,
      avatarUrl: this.s3Service.resolvePublicObjectUrl(user.avatarUrl),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private hashPassword(password: string): Promise<string> {
    return hash(password, AuthService.PASSWORD_SALT_ROUNDS);
  }

  private async buildLoginResponse(user: UserEntity): Promise<LoginResponse> {
    const expiresIn = this.configService.get<number>('JWT_EXPIRES_IN', 86400);
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
      },
      { expiresIn },
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: this.buildPublicProfile(user),
    };
  }

  private async verifyGoogleToken(token: string): Promise<{
    providerId: string;
    email: string;
    fullName: string | null;
  }> {
    const clientId = this.configService
      .get<string>('GOOGLE_CLIENT_ID', '')
      .trim();
    if (!clientId) {
      throw new BadRequestException({
        message: 'Chưa cấu hình GOOGLE_CLIENT_ID',
        messageCode: 'MSG_GOOGLE_CLIENT_ID_NOT_CONFIGURED',
      });
    }

    const ticket = await this.googleOAuthClient.verifyIdToken({
      idToken: token,
      audience: clientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException({
        message: 'Google token không hợp lệ',
        messageCode: 'MSG_GOOGLE_TOKEN_INVALID',
      });
    }

    return {
      providerId: payload.sub,
      email: payload.email,
      fullName: payload.name ?? null,
    };
  }

  private async verifyFacebookToken(token: string): Promise<{
    providerId: string;
    email: string;
    fullName: string | null;
  }> {
    const appId = this.configService.get<string>('FACEBOOK_APP_ID', '').trim();
    if (!appId) {
      throw new BadRequestException({
        message: 'Chưa cấu hình FACEBOOK_APP_ID',
        messageCode: 'MSG_FACEBOOK_APP_ID_NOT_CONFIGURED',
      });
    }

    const response = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(token)}`,
    );

    if (!response.ok) {
      throw new UnauthorizedException({
        message: 'Facebook token không hợp lệ',
        messageCode: 'MSG_FACEBOOK_TOKEN_INVALID',
      });
    }

    const data = (await response.json()) as {
      id?: string;
      name?: string;
      email?: string;
    };

    if (!data.id || !data.email) {
      throw new UnauthorizedException({
        message: 'Không lấy được email từ Facebook',
        messageCode: 'MSG_FACEBOOK_EMAIL_NOT_AVAILABLE',
      });
    }

    const debugResponse = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|`)}`,
    );
    if (debugResponse.ok) {
      const debugData = (await debugResponse.json()) as {
        data?: { app_id?: string; is_valid?: boolean };
      };
      if (!debugData.data?.is_valid || debugData.data.app_id !== appId) {
        throw new UnauthorizedException({
          message: 'Facebook token không hợp lệ',
          messageCode: 'MSG_FACEBOOK_TOKEN_INVALID',
        });
      }
    }

    return {
      providerId: data.id,
      email: data.email,
      fullName: data.name ?? null,
    };
  }
}
