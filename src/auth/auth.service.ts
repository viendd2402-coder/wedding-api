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
import { randomUUID } from 'node:crypto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
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
}
