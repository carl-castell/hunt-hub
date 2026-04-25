import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  createManagerSchema,
  updateUserSchema,
  activateSchema,
  createEstateSchema,
  renameEstateSchema,
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
