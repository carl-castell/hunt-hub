import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn(),
  };
  return { mockDb };
});

vi.mock('@/db', () => ({ db: mockDb }));

import {
  getGroups,
  postCreateGroup,
  getGroup,
  postRenameGroup,
  postDeleteGroup,
  postAddMember,
  postRemoveMember,
} from '@/controllers/manager/guest_groups';

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: { user: { id: 1, role: 'manager', estateId: 10 } } as any,
    params: {},
    body: {},
    ...overrides,
  };
}

function mockRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    render: vi.fn(),
    redirect: vi.fn(),
  };
}

const fakeGroup = { id: 7, name: 'Group A', estateId: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.innerJoin.mockReturnThis();
  mockDb.leftJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.orderBy.mockReturnThis();
  mockDb.groupBy.mockReturnThis();
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.delete.mockReturnThis();
});

describe('getGroups', () => {
  it('renders the groups list', async () => {
    mockDb.orderBy.mockResolvedValueOnce([]);
    const req = mockReq();
    const res = mockRes();

    await getGroups(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('manager/guests/groups', expect.objectContaining({ groups: [] }));
  });
});

describe('postCreateGroup', () => {
  it('inserts the group and redirects', async () => {
    mockDb.returning.mockResolvedValueOnce([fakeGroup]);
    const req = mockReq({ body: { name: 'Group A' } });
    const res = mockRes();

    await postCreateGroup(req as Request, res as Response);

    expect(mockDb.insert).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guest-groups/7');
  });

  it('returns 400 for an empty name', async () => {
    const req = mockReq({ body: { name: '' } });
    const res = mockRes();

    await postCreateGroup(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe('getGroup', () => {
  it('renders the group page when found', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGroup]);
    mockDb.orderBy.mockResolvedValueOnce([]);
    const req = mockReq({ params: { id: '7' } });
    const res = mockRes();

    await getGroup(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('manager/guests/group', expect.objectContaining({ group: fakeGroup }));
  });

  it('returns 404 when the group does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ params: { id: '99' } });
    const res = mockRes();

    await getGroup(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for an invalid group id', async () => {
    const req = mockReq({ params: { id: 'abc' } });
    const res = mockRes();

    await getGroup(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('postRenameGroup', () => {
  it('updates the name and redirects', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGroup]);
    const req = mockReq({ params: { id: '7' }, body: { name: 'Renamed Group' } });
    const res = mockRes();

    await postRenameGroup(req as Request, res as Response);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guest-groups/7');
  });

  it('returns 400 for an empty name', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGroup]);
    const req = mockReq({ params: { id: '7' }, body: { name: '' } });
    const res = mockRes();

    await postRenameGroup(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the group does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ params: { id: '99' }, body: { name: 'New Name' } });
    const res = mockRes();

    await postRenameGroup(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('postDeleteGroup', () => {
  it('deletes the group and redirects', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGroup]);
    const req = mockReq({ params: { id: '7' } });
    const res = mockRes();

    await postDeleteGroup(req as Request, res as Response);

    expect(mockDb.delete).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guest-groups');
  });

  it('returns 404 when the group does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ params: { id: '99' } });
    const res = mockRes();

    await postDeleteGroup(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});

describe('postAddMember', () => {
  it('inserts the member and redirects', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGroup]);
    mockDb.limit.mockResolvedValueOnce([{ id: 42, role: 'guest', estateId: 10 }]);
    mockDb.onConflictDoNothing.mockResolvedValueOnce(undefined);
    const req = mockReq({ params: { id: '7' }, body: { userId: '42' } });
    const res = mockRes();

    await postAddMember(req as Request, res as Response);

    expect(mockDb.insert).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guest-groups/7');
  });

  it('returns 404 when the guest is not in the estate', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGroup]);
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ params: { id: '7' }, body: { userId: '999' } });
    const res = mockRes();

    await postAddMember(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns 404 when the group does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ params: { id: '99' }, body: { userId: '42' } });
    const res = mockRes();

    await postAddMember(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('postRemoveMember', () => {
  it('deletes the member and redirects', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGroup]);
    const req = mockReq({ params: { id: '7', userId: '42' } });
    const res = mockRes();

    await postRemoveMember(req as Request, res as Response);

    expect(mockDb.delete).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guest-groups/7');
  });

  it('returns 404 when the group does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ params: { id: '99', userId: '42' } });
    const res = mockRes();

    await postRemoveMember(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});
