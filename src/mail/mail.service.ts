import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  sendVerificationCode(email: string, code: string): Promise<void> {
    return this.sendCodeEmail(email, 'Verify your email', code, 'email verification');
  }

  sendPasswordResetCode(email: string, code: string): Promise<void> {
    return this.sendCodeEmail(email, 'Reset your password', code, 'password reset');
  }

  private async sendCodeEmail(
    email: string,
    subject: string,
    code: string,
    purpose: string,
  ): Promise<void> {
    const from = this.configService.getOrThrow<string>('MAIL_FROM');

    await this.mailerService.sendMail({
      to: email,
      from,
      subject,
      text: `Your ${purpose} code is ${code}. It expires soon.`,
      html: `<p>Your <strong>${purpose}</strong> code is <strong>${code}</strong>.</p><p>It expires soon.</p>`,
    });
  }
}
