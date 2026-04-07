import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('MAIL_HOST', '').trim();
    const port = this.configService.get<number>('MAIL_PORT', 2525);
    const user = this.configService.get<string>('MAIL_USER', '').trim();
    const pass = this.configService.get<string>('MAIL_PASS', '').trim();

    if (!host || !user || !pass) {
      this.logger.warn(
        'Mail configuration is missing. Emails will not be sent.',
      );
      this.transporter = null;
      return;
    }

    this.transporter = createTransport({
      host,
      port,
      secure: false,
      auth: {
        user,
        pass,
      },
    });
  }

  async sendResetPasswordEmail(
    email: string,
    resetToken: string,
    expiresAt: Date,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `Skipped sending reset password email to ${email} because mail transporter is not configured.`,
      );
      return;
    }

    const resetPasswordUrl = this.configService.get<string>(
      'RESET_PASSWORD_URL',
      'http://localhost:3000/reset-password',
    );
    const from = this.configService.get<string>(
      'MAIL_FROM',
      'no-reply@wedding.local',
    );
    const resetUrl = `${resetPasswordUrl}?token=${encodeURIComponent(resetToken)}`;
    const expiresAtDisplay = expiresAt.toLocaleString('vi-VN', {
      hour12: false,
    });
    const appName = 'Wedding App';
    const supportEmail = from;

    await this.transporter.sendMail({
      from,
      to: email,
      subject: `[${appName}] Yêu cầu đặt lại mật khẩu`,
      text: [
        'Xin chào,',
        '',
        `Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ${email}.`,
        'Vui lòng truy cập liên kết sau để tạo mật khẩu mới:',
        resetUrl,
        '',
        `Liên kết có hiệu lực đến: ${expiresAtDisplay}.`,
        'Nếu bạn không thực hiện yêu cầu này, bạn có thể bỏ qua email này.',
        '',
        'Trân trọng,',
        appName,
        `Hỗ trợ: ${supportEmail}`,
      ].join('\n'),
      html: [
        '<div style="margin:0;padding:0;background:#eef2ff;">',
        '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</div>',
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef2ff;padding:40px 16px;">',
        '<tr><td align="center">',
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border-collapse:collapse;">',
        '<tr><td style="padding:0 0 12px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;color:#4f46e5;font-size:13px;font-weight:700;letter-spacing:0.4px;">',
        `${appName.toUpperCase()}`,
        '</td></tr>',
        '<tr><td style="background:#ffffff;border-radius:18px;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(15,23,42,0.08);overflow:hidden;">',
        '<div style="height:6px;background:linear-gradient(90deg,#4f46e5,#2563eb,#06b6d4);"></div>',
        '<div style="padding:32px 32px 24px;font-family:Arial,Helvetica,sans-serif;color:#111827;">',
        '<p style="margin:0 0 10px;font-size:13px;color:#6b7280;">Xác thực tài khoản</p>',
        '<h1 style="margin:0 0 16px;font-size:24px;line-height:1.35;color:#111827;">Đặt lại mật khẩu</h1>',
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>${email}</strong>.</p>`,
        '<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#374151;">Nhấn nút bên dưới để tạo mật khẩu mới và tiếp tục sử dụng tài khoản.</p>',
        '<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 20px;">',
        '<tr>',
        `<td style="border-radius:10px;background:#2563eb;"><a href="${resetUrl}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Đặt lại mật khẩu</a></td>`,
        '</tr>',
        '</table>',
        '<div style="margin:0 0 18px;padding:14px 14px;border:1px solid #dbeafe;background:#f8fbff;border-radius:10px;">',
        `<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#1f2937;"><strong>Thời gian hiệu lực:</strong> ${expiresAtDisplay}</p>`,
        '<p style="margin:0;font-size:13px;line-height:1.5;color:#1f2937;">Liên kết chỉ sử dụng một lần và sẽ hết hạn sau mốc thời gian trên.</p>',
        '</div>',
        '<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Nếu nút không hoạt động, sao chép liên kết sau vào trình duyệt:</p>',
        `<p style="margin:0 0 20px;font-size:13px;line-height:1.6;word-break:break-word;"><a href="${resetUrl}" style="color:#2563eb;text-decoration:none;">${resetUrl}</a></p>`,
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 14px;" />',
        '<p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này. Để bảo mật, không chia sẻ liên kết với bất kỳ ai.</p>',
        '</div>',
        '<div style="padding:16px 32px 22px;background:#fafafa;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">',
        `<p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">Cần hỗ trợ? Liên hệ <a href="mailto:${supportEmail}" style="color:#4f46e5;text-decoration:none;">${supportEmail}</a></p>`,
        '</div>',
        '</td></tr>',
        '<tr><td style="padding:18px 10px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;">',
        `© ${new Date().getFullYear()} ${appName}. Mọi quyền được bảo lưu.`,
        '</div>',
        '</td></tr>',
        '</table>',
        '</td></tr>',
        '</table>',
        '</div>',
      ].join(''),
    });
  }
}
