import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentEntity } from './payment.entity';

/** Một ảnh trong album thiệp (key lưu trữ, ví dụ S3). */
export type PaymentInvitationAlbumItem = {
  storageKey: string;
  caption?: string | null;
  sortOrder?: number;
};

@Entity({ name: 'payment_invitation_details' })
export class PaymentInvitationDetailsEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @OneToOne(() => PaymentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentId' })
  payment!: PaymentEntity;

  @Column({ type: 'varchar', length: 64, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  templateSlug?: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'varchar', length: 255 })
  brideName!: string;

  @Column({ type: 'varchar', length: 255 })
  groomName!: string;

  @Column({ type: 'date', nullable: true })
  weddingDate?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  venue?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  album?: PaymentInvitationAlbumItem[] | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamp' })
  updatedAt!: Date;
}
