import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export interface AccessTokenClaims {
  sub: string;
  userId: string;
  role: string;
  dealershipId: string;
  sessionId: string;
}

export function signAccessToken(claims: AccessTokenClaims) {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
    audience: 'drivecentric-ai',
    issuer: 'drivecentric-ai-api',
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    audience: 'drivecentric-ai',
    issuer: 'drivecentric-ai-api',
  }) as AccessTokenClaims & jwt.JwtPayload;
}

export function createRefreshToken(sessionId: string) {
  const secret = crypto.randomBytes(48).toString('base64url');
  return `${sessionId}.${secret}`;
}

export function parseRefreshToken(refreshToken: string) {
  const separatorIndex = refreshToken.indexOf('.');
  if (separatorIndex < 1) {
    throw new Error('Invalid refresh token');
  }

  return {
    sessionId: refreshToken.slice(0, separatorIndex),
    secret: refreshToken.slice(separatorIndex + 1),
  };
}

export function hashRefreshToken(refreshToken: string) {
  return crypto
    .createHash('sha256')
    .update(`${refreshToken}.${env.JWT_REFRESH_PEPPER}`)
    .digest('hex');
}

export function refreshExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return expiresAt;
}
