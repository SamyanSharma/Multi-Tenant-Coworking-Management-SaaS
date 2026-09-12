import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getAuthHeaders, login, signup } from '../api';
import { useAuthStore } from '@/store/authStore';

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  useAuthStore.setState({
    token: null,
    role: null,
    spaceId: null,
    userId: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAuthHeaders', () => {
  it('returns no headers at all when logged out', () => {
    expect(getAuthHeaders()).toEqual({});
  });

  it('sends Authorization: Bearer <token> when logged in', () => {
    useAuthStore.setState({ token: 'abc123', role: 'MEMBER', spaceId: 'space-1' });
    expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer abc123' });
  });

  it('does NOT send x-space-id for MEMBER/SPACE_MANAGER even if spaceId is set', () => {
    useAuthStore.setState({
      token: 'abc123',
      role: 'SPACE_MANAGER',
      spaceId: 'space-1',
    });
    const headers = getAuthHeaders();
    expect(headers['x-space-id']).toBeUndefined();
  });

  it('sends x-space-id for PLATFORM_ADMIN when a target space is set', () => {
    useAuthStore.setState({
      token: 'abc123',
      role: 'PLATFORM_ADMIN',
      spaceId: 'target-space',
    });
    expect(getAuthHeaders()).toEqual({
      Authorization: 'Bearer abc123',
      'x-space-id': 'target-space',
    });
  });

  it('omits x-space-id for PLATFORM_ADMIN with no target space set', () => {
    useAuthStore.setState({
      token: 'abc123',
      role: 'PLATFORM_ADMIN',
      spaceId: null,
    });
    expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer abc123' });
  });
});

describe('login', () => {
  it('returns the parsed result on a 2xx response', async () => {
    const body = {
      accessToken: 'token-1',
      user: { id: 'u1', email: 'a@b.com', name: 'A', role: 'MEMBER', spaceId: 's1' },
    };
    mockFetchOnce(200, body);

    const result = await login('a@b.com', 'password123');
    expect(result).toEqual(body);
  });

  it('throws with the backend message on a non-2xx response', async () => {
    mockFetchOnce(401, { message: 'Invalid email or password' });

    await expect(login('a@b.com', 'wrong')).rejects.toThrow(
      'Invalid email or password',
    );
  });

  it('joins array-shaped validation messages into one string', async () => {
    mockFetchOnce(400, {
      message: ['email must be an email', 'password must be longer than 8 characters'],
    });

    await expect(login('bad', 'x')).rejects.toThrow(
      'email must be an email, password must be longer than 8 characters',
    );
  });
});

describe('signup', () => {
  it('posts a SPACE_MANAGER payload and returns the parsed result', async () => {
    const body = {
      accessToken: 'token-2',
      user: {
        id: 'u2',
        email: 'manager@acme.com',
        name: 'Ada',
        role: 'SPACE_MANAGER',
        spaceId: 'space-new',
      },
    };
    const fetchMock = mockFetchOnce(201, body);

    const result = await signup({
      role: 'SPACE_MANAGER',
      name: 'Ada',
      email: 'manager@acme.com',
      password: 'password123',
      spaceName: 'Acme',
    });

    expect(result).toEqual(body);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      role: 'SPACE_MANAGER',
      name: 'Ada',
      email: 'manager@acme.com',
      password: 'password123',
      spaceName: 'Acme',
    });
  });

  it('posts a MEMBER payload with spaceSlug instead of spaceName', async () => {
    const body = {
      accessToken: 'token-3',
      user: {
        id: 'u3',
        email: 'bob@example.com',
        name: 'Bob',
        role: 'MEMBER',
        spaceId: 'space-existing',
      },
    };
    const fetchMock = mockFetchOnce(201, body);

    const result = await signup({
      role: 'MEMBER',
      name: 'Bob',
      email: 'bob@example.com',
      password: 'password123',
      spaceSlug: 'acme-coworking',
    });

    expect(result).toEqual(body);
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.spaceSlug).toBe('acme-coworking');
    expect(sentBody.spaceName).toBeUndefined();
  });

  it('throws with the backend conflict message when the email is taken', async () => {
    mockFetchOnce(409, {
      message: 'An account with this email already exists',
    });

    await expect(
      signup({
        role: 'SPACE_MANAGER',
        name: 'Ada',
        email: 'manager@acme.com',
        password: 'password123',
        spaceName: 'Acme',
      }),
    ).rejects.toThrow('An account with this email already exists');
  });

  it('throws with the backend not-found message for an unknown space slug', async () => {
    mockFetchOnce(404, {
      message: 'No space found with that join code',
    });

    await expect(
      signup({
        role: 'MEMBER',
        name: 'Bob',
        email: 'bob@example.com',
        password: 'password123',
        spaceSlug: 'does-not-exist',
      }),
    ).rejects.toThrow('No space found with that join code');
  });
});
