import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  createManagerSchema,
  updateUserSchema,
  activateSchema,
  createEstateSchema,
  renameEstateSchema,
  changePasswordSchema,
  createPersonSchema,
  updateRoleSchema,
  guestSchema,
  areaNameSchema,
  deleteConfirmSchema,
} from '@/schemas';

describe('loginSchema', () => {
  it('passes with valid credentials', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('fails with invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('fails with empty password', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('fails with missing fields', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('createManagerSchema', () => {
  it('passes with valid data', () => {
    const result = createManagerSchema.safeParse({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      estateId: '1',
    });
    expect(result.success).toBe(true);
  });

  it('fails with invalid email', () => {
    const result = createManagerSchema.safeParse({
      firstName: 'John',
      lastName: 'Doe',
      email: 'not-an-email',
      estateId: '1',
    });
    expect(result.success).toBe(false);
  });

  it('fails with empty firstName', () => {
    const result = createManagerSchema.safeParse({
      firstName: '',
      lastName: 'Doe',
      email: 'john@example.com',
      estateId: '1',
    });
    expect(result.success).toBe(false);
  });

  it('fails with empty lastName', () => {
    const result = createManagerSchema.safeParse({
      firstName: 'John',
      lastName: '',
      email: 'john@example.com',
      estateId: '1',
    });
    expect(result.success).toBe(false);
  });

  it('fails with missing estateId', () => {
    const result = createManagerSchema.safeParse({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('fails with missing fields', () => {
    const result = createManagerSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('passes with valid data', () => {
    const result = updateUserSchema.safeParse({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('fails with invalid email', () => {
    const result = updateUserSchema.safeParse({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'bad-email',
    });
    expect(result.success).toBe(false);
  });

  it('fails with empty firstName', () => {
    const result = updateUserSchema.safeParse({
      firstName: '',
      lastName: 'Doe',
      email: 'jane@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('fails with empty lastName', () => {
    const result = updateUserSchema.safeParse({
      firstName: 'Jane',
      lastName: '',
      email: 'jane@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('fails with missing fields', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('activateSchema', () => {
  it('passes with matching passwords', () => {
    const result = activateSchema.safeParse({
      password: 'SecurePass1!',
      confirmPassword: 'SecurePass1!',
    });
    expect(result.success).toBe(true);
  });

  it('fails when passwords do not match', () => {
    const result = activateSchema.safeParse({
      password: 'SecurePass1!',
      confirmPassword: 'DifferentPass1!',
    });
    expect(result.success).toBe(false);
  });

  it('fails with too short password', () => {
    const result = activateSchema.safeParse({
      password: 'short',
      confirmPassword: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('fails with empty password', () => {
    const result = activateSchema.safeParse({
      password: '',
      confirmPassword: '',
    });
    expect(result.success).toBe(false);
  });

  it('fails with missing fields', () => {
    const result = activateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('fails when password has no uppercase letter', () => {
    const result = activateSchema.safeParse({
      password: 'securepass1!',
      confirmPassword: 'securepass1!',
    });
    expect(result.success).toBe(false);
  });

  it('fails when password has no number', () => {
    const result = activateSchema.safeParse({
      password: 'SecurePass!',
      confirmPassword: 'SecurePass!',
    });
    expect(result.success).toBe(false);
  });

  it('fails when password has no special character', () => {
    const result = activateSchema.safeParse({
      password: 'SecurePass1',
      confirmPassword: 'SecurePass1',
    });
    expect(result.success).toBe(false);
  });

  it('passes with a password containing uppercase and special character', () => {
    const result = activateSchema.safeParse({
      password: 'SecurePass1!',
      confirmPassword: 'SecurePass1!',
    });
    expect(result.success).toBe(true);
  });
});

describe('createEstateSchema', () => {
  it('passes with a valid name', () => {
    const result = createEstateSchema.safeParse({ name: 'Glenfern Estate' });
    expect(result.success).toBe(true);
  });

  it('fails with an empty name', () => {
    const result = createEstateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('fails with a name exceeding 256 characters', () => {
    const result = createEstateSchema.safeParse({ name: 'a'.repeat(257) });
    expect(result.success).toBe(false);
  });

  it('fails with missing name field', () => {
    const result = createEstateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('renameEstateSchema', () => {
  it('passes with a valid name', () => {
    const result = renameEstateSchema.safeParse({ name: 'New Estate Name' });
    expect(result.success).toBe(true);
  });

  it('fails with an empty name', () => {
    const result = renameEstateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('fails with a name exceeding 256 characters', () => {
    const result = renameEstateSchema.safeParse({ name: 'a'.repeat(257) });
    expect(result.success).toBe(false);
  });

  it('fails with missing name field', () => {
    const result = renameEstateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  const valid = { oldPassword: 'OldPass1!', newPassword: 'NewPass1!', confirmPassword: 'NewPass1!' };

  it('passes with valid matching passwords', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it('fails when new passwords do not match', () => {
    expect(changePasswordSchema.safeParse({ ...valid, confirmPassword: 'Different1!' }).success).toBe(false);
  });

  it('fails when newPassword is too short', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'short', confirmPassword: 'short' }).success).toBe(false);
  });

  it('fails when newPassword has no uppercase letter', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'newpass1!', confirmPassword: 'newpass1!' }).success).toBe(false);
  });

  it('fails when newPassword has no number', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'NewPass!!', confirmPassword: 'NewPass!!' }).success).toBe(false);
  });

  it('fails when newPassword has no special character', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'NewPass12', confirmPassword: 'NewPass12' }).success).toBe(false);
  });

  it('fails with empty oldPassword', () => {
    expect(changePasswordSchema.safeParse({ ...valid, oldPassword: '' }).success).toBe(false);
  });
});

describe('createPersonSchema', () => {
  const valid = { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', role: 'manager' as const };

  it('passes with valid manager data', () => {
    expect(createPersonSchema.safeParse(valid).success).toBe(true);
  });

  it('passes with role staff', () => {
    expect(createPersonSchema.safeParse({ ...valid, role: 'staff' }).success).toBe(true);
  });

  it('fails with an invalid role', () => {
    expect(createPersonSchema.safeParse({ ...valid, role: 'admin' }).success).toBe(false);
  });

  it('fails with an invalid email', () => {
    expect(createPersonSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('fails with empty firstName', () => {
    expect(createPersonSchema.safeParse({ ...valid, firstName: '' }).success).toBe(false);
  });
});

describe('updateRoleSchema', () => {
  it('passes with role manager', () => {
    expect(updateRoleSchema.safeParse({ role: 'manager' }).success).toBe(true);
  });

  it('passes with role staff', () => {
    expect(updateRoleSchema.safeParse({ role: 'staff' }).success).toBe(true);
  });

  it('fails with an invalid role', () => {
    expect(updateRoleSchema.safeParse({ role: 'admin' }).success).toBe(false);
  });
});

describe('guestSchema', () => {
  const valid = { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' };

  it('passes with required fields only', () => {
    expect(guestSchema.safeParse(valid).success).toBe(true);
  });

  it('passes with a non-empty phone string', () => {
    // optionalString: non-empty string passes through as-is
    expect(guestSchema.safeParse({ ...valid, phone: '+353 1 234 5678' }).success).toBe(true);
  });

  it('passes with an empty phone string (transformed to undefined)', () => {
    // optionalString: empty string is transformed to undefined, satisfying optional()
    expect(guestSchema.safeParse({ ...valid, phone: '' }).success).toBe(true);
  });

  it('passes with an empty dateOfBirth (transformed to undefined)', () => {
    expect(guestSchema.safeParse({ ...valid, dateOfBirth: '' }).success).toBe(true);
  });

  it('passes with a valid rating', () => {
    expect(guestSchema.safeParse({ ...valid, rating: 3 }).success).toBe(true);
  });

  it('fails with a rating below 1', () => {
    expect(guestSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false);
  });

  it('fails with a rating above 5', () => {
    expect(guestSchema.safeParse({ ...valid, rating: 6 }).success).toBe(false);
  });

  it('fails with an invalid email', () => {
    expect(guestSchema.safeParse({ ...valid, email: 'not-valid' }).success).toBe(false);
  });

  it('fails with empty firstName', () => {
    expect(guestSchema.safeParse({ ...valid, firstName: '' }).success).toBe(false);
  });
});

describe('areaNameSchema', () => {
  it('passes with a valid name', () => {
    expect(areaNameSchema.safeParse({ name: 'North Wood' }).success).toBe(true);
  });

  it('fails with an empty name', () => {
    expect(areaNameSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('fails with a name exceeding 255 characters', () => {
    expect(areaNameSchema.safeParse({ name: 'a'.repeat(256) }).success).toBe(false);
  });
});

describe('deleteConfirmSchema', () => {
  it('passes with any string', () => {
    expect(deleteConfirmSchema.safeParse({ confirm: 'DELETE' }).success).toBe(true);
  });

  it('fails with missing confirm field', () => {
    expect(deleteConfirmSchema.safeParse({}).success).toBe(false);
  });
});
