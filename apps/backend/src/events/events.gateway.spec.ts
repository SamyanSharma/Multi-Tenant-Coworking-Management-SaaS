import { JwtService } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';

const TEST_SECRET = 'test-secret';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: TEST_SECRET });
    gateway = new EventsGateway(jwtService);
  });

  function signToken(payload: {
    sub?: string;
    role?: string;
    spaceId?: string | null;
  }): string {
    return jwtService.sign({
      sub: payload.sub ?? 'user-1',
      role: payload.role,
      spaceId: payload.spaceId,
    });
  }

  function mockSocket(token?: string): any {
    return {
      id: 'socket-1',
      handshake: {
        auth: { token },
      },
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  }

  it('joins the correct spaceId-scoped room for a valid MEMBER', () => {
    const token = signToken({
      role: 'MEMBER',
      spaceId: 'cku8x2vwn0000abcd1234efgh',
    });
    const client = mockSocket(token);

    gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(
      'space:cku8x2vwn0000abcd1234efgh',
    );
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('joins the correct spaceId-scoped room for a valid SPACE_MANAGER', () => {
    const token = signToken({
      role: 'SPACE_MANAGER',
      spaceId: 'cku8x2vwn0000abcd1234efgh',
    });
    const client = mockSocket(token);

    gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(
      'space:cku8x2vwn0000abcd1234efgh',
    );
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects a socket with no token at all', () => {
    const client = mockSocket(undefined);

    gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      'connection_error',
      expect.objectContaining({
        message: expect.stringContaining('Missing auth token'),
      }),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects a token signed with the wrong secret', () => {
    const forgedJwtService = new JwtService({ secret: 'wrong-secret' });
    const token = forgedJwtService.sign({
      sub: 'user-1',
      role: 'MEMBER',
      spaceId: 'cku8x2vwn0000abcd1234efgh',
    });
    const client = mockSocket(token);

    gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      'connection_error',
      expect.objectContaining({
        message: expect.stringContaining('Invalid or expired token'),
      }),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects a token with no spaceId', () => {
    const token = signToken({ role: 'MEMBER', spaceId: null });
    const client = mockSocket(token);

    gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      'connection_error',
      expect.objectContaining({
        message: expect.stringContaining(
          'no valid spaceId/role',
        ),
      }),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects a token with an invalid role (e.g. PLATFORM_ADMIN)', () => {
    const token = signToken({
      role: 'PLATFORM_ADMIN',
      spaceId: 'cku8x2vwn0000abcd1234efgh',
    });
    const client = mockSocket(token);

    gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      'connection_error',
      expect.objectContaining({
        message: expect.stringContaining(
          'no valid spaceId/role',
        ),
      }),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects a token with an invalid spaceId', () => {
    const token = signToken({
      role: 'MEMBER',
      spaceId: 'not-a-valid-space-id',
    });
    const client = mockSocket(token);

    gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      'connection_error',
      expect.objectContaining({
        message: expect.stringContaining(
          'no valid spaceId/role',
        ),
      }),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('broadcasts booking_created only to the requested space room', () => {
    const emit = jest.fn();

    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit }),
    };

    const payload = { id: 'booking-1', bookableType: 'DESK' };

    gateway.emitBookingCreated('cku8x2vwn0000abcd1234efgh', payload);

    expect((gateway as any).server.to).toHaveBeenCalledWith(
      'space:cku8x2vwn0000abcd1234efgh',
    );
    expect(emit).toHaveBeenCalledWith('booking_created', payload);
  });
});
