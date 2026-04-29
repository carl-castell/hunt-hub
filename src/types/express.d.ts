import type { roleEnum } from '../db/schema/users';

declare global {
  type SessionUser = {
    id:        number;
    firstName: string;
    lastName:  string;
    role:      typeof roleEnum.enumValues[number];
    estateId:  number | null;
    email:     string;
    active:    boolean;
  };
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
    csrfToken?: string;
    pendingAdminId?: number;
    pendingTotpSecret?: string;
  }
}
declare module 'shapefile';

export {};
