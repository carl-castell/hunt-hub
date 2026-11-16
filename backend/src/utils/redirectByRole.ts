import { Request, Response } from 'express';
import { REACT_APP_BASE_PATH } from '@/shared/managerNav';

export const REACT_LOGIN_PATH = `${REACT_APP_BASE_PATH}/login`;

/**
 * Sends the user to where they belong: logged-out users and roles without a
 * web area (staff, guests) to the React login, which explains where to go;
 * admins and managers to their home page.
 */
export function redirectByRole(req: Request, res: Response) {
  switch (req.session.user?.role) {
    case 'admin':   return res.redirect('/admin');
    case 'manager': return res.redirect('/manager');
    default:        return res.redirect(REACT_LOGIN_PATH);
  }
}
