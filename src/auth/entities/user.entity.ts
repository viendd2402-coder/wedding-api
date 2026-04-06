import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fullName?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string | null;

  @Column({ type: 'int', nullable: true })
  age?: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  additionalContact?: string | null;

  /** Cột lưu S3 object key; API ghép URL khi trả profile. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resetToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetTokenExpiresAt?: Date | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamp' })
  updatedAt!: Date;
}
