import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Prisma, Role } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import type {
  AuthSession,
  AuthTokenPair,
  AuthenticatedUser,
  JwtPayload,
} from './auth.types';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationCodeDto } from './dto/resend-verification-code.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const verificationCode = this.generateCode();
    const verificationCodeHash = await this.hashValue(verificationCode);
    const verificationCodeExpiresAt = this.getCodeExpiry('EMAIL_VERIFICATION_CODE_TTL_MINUTES');

    await this.usersService.create({
      email: normalizedEmail,
      passwordHash,
      role: Role.MASTER,
      isEmailVerified: false,
      emailVerificationCodeHash: verificationCodeHash,
      emailVerificationCodeExpiresAt: verificationCodeExpiresAt,
      wallet: {
        create: {
          balance: new Prisma.Decimal(0),
        },
      },
    });

    await this.mailService.sendVerificationCode(normalizedEmail, verificationCode);

    return {
      message: 'Registration successful. Check your email for the verification code.',
    };
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException('Email must be verified before login');
    }

    return this.issueSession(user.id, user.email, user.role, user.isEmailVerified);
  }

  async refresh(dto: RefreshDto): Promise<AuthSession> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const user = await this.assertRefreshTokenOwner(payload.sub, dto.refreshToken);

    return this.issueSession(user.id, user.email, user.role, user.isEmailVerified);
  }

  async logout(dto: LogoutDto): Promise<{ message: string }> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    await this.assertRefreshTokenOwner(payload.sub, dto.refreshToken);

    await this.usersService.update(payload.sub, {
      refreshTokenHash: null,
    });

    return { message: 'Logged out successfully' };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const user = await this.findUserByEmailOrThrow(dto.email);

    if (user.isEmailVerified) {
      return { message: 'Email is already verified' };
    }

    await this.assertCodeMatch({
      code: dto.code,
      codeHash: user.emailVerificationCodeHash,
      expiresAt: user.emailVerificationCodeExpiresAt,
      errorMessage: 'Invalid or expired verification code',
    });

    await this.usersService.update(user.id, {
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      emailVerificationCodeHash: null,
      emailVerificationCodeExpiresAt: null,
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerificationCode(dto: ResendVerificationCodeDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || user.isEmailVerified) {
      return { message: 'If the account exists, a verification code has been sent' };
    }

    const verificationCode = this.generateCode();
    const verificationCodeHash = await this.hashValue(verificationCode);
    const verificationCodeExpiresAt = this.getCodeExpiry('EMAIL_VERIFICATION_CODE_TTL_MINUTES');

    await this.usersService.update(user.id, {
      emailVerificationCodeHash: verificationCodeHash,
      emailVerificationCodeExpiresAt: verificationCodeExpiresAt,
    });

    await this.mailService.sendVerificationCode(user.email, verificationCode);

    return { message: 'If the account exists, a verification code has been sent' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      return { message: 'If the account exists, a reset code has been sent' };
    }

    const resetCode = this.generateCode();
    const resetCodeHash = await this.hashValue(resetCode);
    const resetCodeExpiresAt = this.getCodeExpiry('PASSWORD_RESET_CODE_TTL_MINUTES');

    await this.usersService.update(user.id, {
      passwordResetCodeHash: resetCodeHash,
      passwordResetCodeExpiresAt: resetCodeExpiresAt,
    });

    await this.mailService.sendPasswordResetCode(user.email, resetCode);

    return { message: 'If the account exists, a reset code has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.findUserByEmailOrThrow(dto.email);

    await this.assertCodeMatch({
      code: dto.code,
      codeHash: user.passwordResetCodeHash,
      expiresAt: user.passwordResetCodeExpiresAt,
      errorMessage: 'Invalid or expired reset code',
    });

    const passwordHash = await this.hashPassword(dto.newPassword);

    await this.usersService.update(user.id, {
      passwordHash,
      refreshTokenHash: null,
      passwordResetCodeHash: null,
      passwordResetCodeExpiresAt: null,
    });

    return { message: 'Password reset successfully' };
  }

  async getMe(userId: string): Promise<AuthenticatedUser> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Invalid access token');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    };
  }

  private async issueSession(
    userId: string,
    email: string,
    role: Role,
    isEmailVerified: boolean,
  ): Promise<AuthSession> {
    const accessToken = await this.signAccessToken({ sub: userId, email, role });
    const refreshToken = await this.signRefreshToken({ sub: userId, email, role });
    const refreshTokenHash = await this.hashValue(refreshToken);

    await this.usersService.update(userId, {
      refreshTokenHash,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email,
        role,
        isEmailVerified,
      },
    };
  }

  private async assertRefreshTokenOwner(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);

    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return user;
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN') as JwtSignOptions['expiresIn'],
    });
  }

  private async signRefreshToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN') as JwtSignOptions['expiresIn'],
    });
  }

  private async hashPassword(password: string): Promise<string> {
    return this.hashValue(password);
  }

  private async hashValue(value: string): Promise<string> {
    return bcrypt.hash(value, this.getSaltRounds());
  }

  private generateCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  private getSaltRounds(): number {
    return Number(this.configService.get<string>('BCRYPT_SALT_ROUNDS') ?? '12');
  }

  private getCodeExpiry(envKey: 'EMAIL_VERIFICATION_CODE_TTL_MINUTES' | 'PASSWORD_RESET_CODE_TTL_MINUTES'): Date {
    const ttlMinutes = Number(this.configService.get<string>(envKey) ?? '10');

    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  private async findUserByEmailOrThrow(email: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid code or email');
    }

    return user;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async assertCodeMatch(params: {
    code: string;
    codeHash: string | null;
    expiresAt: Date | null;
    errorMessage: string;
  }): Promise<void> {
    const { code, codeHash, expiresAt, errorMessage } = params;

    if (!codeHash || !expiresAt || expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(errorMessage);
    }

    const matches = await bcrypt.compare(code, codeHash);

    if (!matches) {
      throw new UnauthorizedException(errorMessage);
    }
  }
}
