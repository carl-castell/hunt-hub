import { z } from 'zod';
import { STAND_NICKNAME_MAX, STAND_STATUSES } from '@/shared/standStatus';

export const loginSchema = z.object({
  email:    z.email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

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

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character.'),
  confirmPassword: z.string().min(1),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

export const createEstateSchema = z.object({
  name: z.string().min(1, 'Estate name is required.').max(256, 'Estate name is too long.'),
});

export const renameEstateSchema = z.object({
  name: z.string().min(1, 'Estate name is required.').max(256, 'Estate name is too long.'),
});

export const createManagerSchema = z.object({
  firstName: z.string().min(1, 'First name is required.').max(255),
  lastName:  z.string().min(1, 'Last name is required.').max(255),
  email:     z.email('Please enter a valid email address.'),
  estateId:  z.string().min(1, 'Estate ID is required.'),
});

export const addManagerSchema = z.object({
  estateId:  z.number(),
  firstName: z.string().min(1, 'First name is required.').max(255),
  lastName:  z.string().min(1, 'Last name is required.').max(255),
  email:     z.email('Please enter a valid email address.'),
});

export const createAdminSchema = z.object({
  firstName: z.string().min(1, 'First name is required.').max(255),
  lastName:  z.string().min(1, 'Last name is required.').max(255),
  email:     z.email('Please enter a valid email address.'),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required.').max(255),
  lastName:  z.string().min(1, 'Last name is required.').max(255),
  email:     z.email('Please enter a valid email address.'),
});

export const createPersonSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName:  z.string().min(1).max(255),
  email:     z.email(),
  role:      z.enum(['manager', 'staff']),
});

export const updateRoleSchema = z.object({
  role: z.enum(['manager', 'staff']),
});

export const driveSchema = z.object({
  name:      z.string().min(1).max(255),
  startTime: z.string().min(1),
  endTime:   z.string().min(1),
});

export const eventSchema = z.object({
  eventName: z.string().min(1).max(255),
  date:      z.string().min(1),
  time:      z.string().min(1),
});

const optionalString = z.string().optional().transform(v => v === '' ? undefined : v).pipe(z.string().min(1).optional());

export const guestSchema = z.object({
  firstName:   z.string().min(1),
  lastName:    z.string().min(1),
  email:       z.email(),
  phone:       optionalString,
  dateOfBirth: optionalString,
  rating:      z.coerce.number().int().min(1).max(5).optional(),
});

export const areaNameSchema = z.object({
  name: z.string().min(1).max(255),
});

export const deleteConfirmSchema = z.object({
  confirm: z.string(),
});


/** A calendar date like 2026-11-17 that exists (not 2026-02-31). */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'This date does not exist.');

/**
 * Nickname, status and status date of a stand. Every field is optional:
 * a missing field stays as it is, null clears it. An empty nickname counts
 * as no nickname.
 */
export const standDetailsSchema = z.object({
  nickname: z.string().trim().max(STAND_NICKNAME_MAX)
    .transform((value) => value === '' ? null : value)
    .nullable().optional(),
  status: z.enum(STAND_STATUSES).nullable().optional(),
  statusDate: isoDateSchema.optional(),
});

export type StandDetailsInput = z.infer<typeof standDetailsSchema>;
