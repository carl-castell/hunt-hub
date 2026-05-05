import { Request, Response, NextFunction } from "express";

export const requireAuth = requireLogin;

export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).send("Access denied.");
  }
  next();
}

export function requireManager(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user || req.session.user.role !== "manager") {
    return res.status(403).send("Access denied.");
  }
  next();
}

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user || req.session.user.role !== "staff") {
    return res.status(403).send("Access denied.");
  }
  next();
}
