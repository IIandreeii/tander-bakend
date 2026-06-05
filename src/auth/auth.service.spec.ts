import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';

jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));

jest.mock('../mail/mail.service', () => ({
  MailService: class MailService {},
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-value'),
  compare: jest.fn(),
}));

jest.mock('../../generated/prisma/client', () => {
  class Decimal {
    constructor(private readonly value: number | string) {}

    toString(): string {
      return String(this.value);
    }
  }

  return {
    Prisma: {
      Decimal,
    },
    PrismaClient: class PrismaClient {},
    Role: {
      MASTER: 'MASTER',
      SUPER_MASTER: 'SUPER_MASTER',
    },
  };
});

describe('AuthService', () => {
  let service: AuthService;
  const usersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };
  const mailService = {
    sendVerificationCode: jest.fn(),
    sendPasswordResetCode: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a wallet when registering a user', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue({ id: 'user-1' });
    mailService.sendVerificationCode.mockResolvedValue(undefined);

    await service.register({ email: 'user@example.com', password: 'Password123!' });

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        role: 'MASTER',
        wallet: {
          create: {
            balance: expect.any(Object),
          },
        },
      }),
    );
  });
});
