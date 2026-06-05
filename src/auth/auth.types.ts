import type { Role } from '../../generated/prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession extends AuthTokenPair {
  user: AuthenticatedUser;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
