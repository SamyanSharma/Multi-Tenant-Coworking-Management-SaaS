import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getAuthHeaders, login, signup, getPublicSpaces, joinSpace } from '../api';
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

  it('posts a plain MEMBER payload with no space fields at all', async () => {
    const body = {
      accessToken: 'token-3',
      user: {
        id: 'u3',
        email: 'bob@example.com',
        name: 'Bob',
        role: 'MEMBER',
        spaceId: null,
      },
    };
    const fetchMock = mockFetchOnce(201, body);

    const result = await signup({
      role: 'MEMBER',
      name: 'Bob',
      email: 'bob@example.com',
      password: 'password123',
    });

    expect(result).toEqual(body);
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody).toEqual({
      role: 'MEMBER',
      name: 'Bob',
      email: 'bob@example.com',
      password: 'password123',
    });
    expect(sentBody.spaceId).toBeUndefined();
    expect(sentBody.spaceSlug).toBeUndefined();
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
});

describe('getPublicSpaces', () => {
  it('fetches without an Authorization header — this screen runs before login', async () => {
    const spaces = [
      { id: 's1', name: 'Acme', priceCents: 2500, members: 4, desks: 3, rooms: 1 },
    ];
    const fetchMock = mockFetchOnce(200, spaces);

    const result = await getPublicSpaces();

    expect(result).toEqual(spaces);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/spaces\/public$/);
    expect(init).toBeUndefined();
  });

  it('throws with the backend message on a non-2xx response', async () => {
    mockFetchOnce(500, { message: 'Internal server error' });

    await expect(getPublicSpaces()).rejects.toThrow('Internal server error');
  });
});

describe('joinSpace', () => {
  it('POSTs to /spaces/:id/join with the Authorization header and returns a fresh LoginResult', async () => {
    useAuthStore.setState({ token: 'old-token', role: 'MEMBER', spaceId: null });
    const body = {
      accessToken: 'fresh-token',
      user: { id: 'u1', email: 'a@b.com', name: 'A', role: 'MEMBER', spaceId: 's1' },
    };
    const fetchMock = mockFetchOnce(201, body);

    const result = await joinSpace('s1');

    expect(result).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/spaces\/s1\/join$/);
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer old-token');
  });

  it('throws with the backend message on a non-2xx response (e.g. already joined a space)', async () => {
    mockFetchOnce(409, { message: 'You have already joined a space' });

    await expect(joinSpace('s1')).rejects.toThrow('You have already joined a space');
  });
});
