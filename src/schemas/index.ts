import { z } from 'zod';

// ── Auth ─────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email:    z.email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

// ── Activate / Set Password ───────────────────────────────────────────────────
export const activateSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character.'),
  confirmPassword: z.string().min(1, 'Please confirm your password.'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

// ── Estates ───────────────────────────────────────────────────────────────────
export const createEstateSchema = z.object({
  name: z.string().min(1, 'Estate name is required.').max(256, 'Estate name is too long.'),
});

export const renameEstateSchema = z.object({
  name: z.string().min(1, 'Estate name is required.').max(256, 'Estate name is too long.'),
});

// ── Users / Managers ──────────────────────────────────────────────────────────
export const createManagerSchema = z.object({
  firstName: z.string().min(1, 'First name is required.').max(255),
  lastName:  z.string().min(1, 'Last name is required.').max(255),
  email:     z.email('Please enter a valid email address.'),
  estateId:  z.string().min(1, 'Estate ID is required.'),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required.').max(255),
  lastName:  z.string().min(1, 'Last name is required.').max(255),
  email:     z.email('Please enter a valid email address.'),
});
