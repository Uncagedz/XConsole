import type { Role } from '@drivecentric-ai/shared';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        appUserId: string;
        role: Role;
        dealershipId: string;
        sessionId: string;
      };
      requestId?: string;
    }
  }
}

export {};
