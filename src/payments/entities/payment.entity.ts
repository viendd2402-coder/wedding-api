import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PaymentProvider {
  PAYOS = 'PAYOS',
  VNPAY = 'VNPAY',
  /** Không qua cổng thanh toán — template miễn phí trong catalog. */
  FREE = 'FREE',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELED = 'CANCELED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

@Entity({ name: 'payments' })
export class PaymentEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  userId?: number | null;

  @Column({ type: 'int' })
  amount!: number;

  @Column({ type: 'varchar', length: 10, default: 'VND' })
  currency!: string;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
    default: PaymentProvider.PAYOS,
  })
  provider!: PaymentProvider;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status!: PaymentStatus;

  @Column({ type: 'bigint', unique: true })
  providerOrderCode!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  checkoutUrl?: string | null;

  /** Hết hiệu lực ước lượng của link thanh toán (VNPay/PayOS); FREE thường null. */
  @Column({ type: 'timestamp', nullable: true })
  checkoutUrlExpireDate?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  planSlug?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  rawWebhook?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  invitationDraft?: Record<string, unknown> | null;

  @OneToOne(
    () => PaymentInvitationDetailsEntity,
    (details) => details.payment,
  )
  invitationDetails?: PaymentInvitationDetailsEntity | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamp' })
  updatedAt!: Date;
}

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

  @OneToOne(() => PaymentEntity, (p) => p.invitationDetails, {
    onDelete: 'CASCADE',
  })
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

  @Column({ type: 'varchar', length: 255, nullable: true })
  guestBookSpreadsheetId?: string | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamp' })
  updatedAt!: Date;
}
