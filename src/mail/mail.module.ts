import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailService } from './mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.getOrThrow<string>('MAIL_HOST'),
          port: Number(configService.getOrThrow<string>('MAIL_PORT')),
          secure: configService.getOrThrow<string>('MAIL_SECURE') === 'true',
          auth: {
            user: configService.getOrThrow<string>('MAIL_USER'),
            pass: configService.getOrThrow<string>('MAIL_APP_PASSWORD'),
          },
        },
        defaults: {
          from: configService.getOrThrow<string>('MAIL_FROM'),
        },
      }),
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
