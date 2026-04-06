import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UserEntity } from '../entities/user.entity';

type CreateUserInput = {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
};

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  findById(id: number): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { email } });
  }

  findByEmailAndPassword(
    email: string,
    password: string,
  ): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { email, password } });
  }

  create(data: Partial<UserEntity>): UserEntity {
    return this.repository.create(data);
  }

  save(user: UserEntity): Promise<UserEntity> {
    return this.repository.save(user);
  }

  async createIfNotExistsByEmail(data: CreateUserInput): Promise<UserEntity> {
    const existingUser = await this.findByEmail(data.email);
    if (existingUser) {
      return existingUser;
    }

    const user = this.create({
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      phone: data.phone ?? null,
    });
    return this.save(user);
  }

  async setResetToken(
    userId: number,
    resetToken: string,
    expiresAt: Date,
  ): Promise<UserEntity | null> {
    await this.repository.update(
      { id: userId },
      {
        resetToken,
        resetTokenExpiresAt: expiresAt,
      },
    );
    return this.findById(userId);
  }

  async updateProfileById(
    userId: number,
    dto: UpdateProfileDto,
    avatarUrlFromUpload?: string,
  ): Promise<UserEntity | null> {
    const patch: Partial<{
      fullName: string | null;
      phone: string | null;
      age: number | null;
      gender: string | null;
      additionalContact: string | null;
      avatarUrl: string | null;
    }> = {};

    if (dto.fullName !== undefined) {
      patch.fullName = dto.fullName;
    }
    if (dto.phone !== undefined) {
      patch.phone = dto.phone;
    }
    if (dto.age !== undefined) {
      patch.age = dto.age;
    }
    if (dto.gender !== undefined) {
      patch.gender = dto.gender;
    }
    if (dto.additionalContact !== undefined) {
      patch.additionalContact = dto.additionalContact;
    }
    if (avatarUrlFromUpload !== undefined) {
      patch.avatarUrl = avatarUrlFromUpload;
    }

    if (Object.keys(patch).length === 0) {
      return this.findById(userId);
    }

    await this.repository.update({ id: userId }, patch);
    return this.findById(userId);
  }
}
