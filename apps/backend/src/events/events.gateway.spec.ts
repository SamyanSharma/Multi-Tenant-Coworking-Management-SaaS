import { EventsGateway } from './events.gateway';

describe('EventsGateway', () => {
  let gateway: EventsGateway;

  beforeEach(() => {
    gateway = new EventsGateway();
  });

  function mockSocket(
    spaceId?: string,
    role?: string,
  ): any {
    return {
      id: 'socket-1',
      handshake: {
        auth: {
          spaceId,
          role,
        },
      },
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  }

  it('joins the correct spaceId-scoped room for a valid MEMBER', () => {
    const client = mockSocket(
      'cku8x2vwn0000abcd1234efgh',
      'MEMBER',
    );

    gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(
      'space:cku8x2vwn0000abcd1234efgh',
    );

    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('joins the correct spaceId-scoped room for a valid SPACE_MANAGER', () => {
    const client = mockSocket(
      'cku8x2vwn0000abcd1234efgh',
      'SPACE_MANAGER',
    );

    gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(
      'space:cku8x2vwn0000abcd1234efgh',
    );

    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects a socket with no spaceId', () => {
    const client = mockSocket(
      undefined,
      'MEMBER',
    );

    gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      'connection_error',
      expect.objectContaining({
        message: expect.stringContaining(
          'Missing or invalid',
        ),
      }),
    );

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects a socket with no role', () => {
    const client = mockSocket(
      'cku8x2vwn0000abcd1234efgh',
      undefined,
    );

    gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      'connection_error',
      expect.objectContaining({
        message: expect.stringContaining(
          'Missing or invalid',
        ),
      }),
    );

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects an invalid role', () => {
    const client = mockSocket(
      'cku8x2vwn0000abcd1234efgh',
      'PLATFORM_ADMIN',
    );

    gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      'connection_error',
      expect.objectContaining({
        message: expect.stringContaining(
          'Missing or invalid',
        ),
      }),
    );

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects an invalid spaceId', () => {
    const client = mockSocket(
      'not-a-valid-space-id',
      'MEMBER',
    );

    gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      'connection_error',
      expect.objectContaining({
        message: expect.stringContaining(
          'Missing or invalid',
        ),
      }),
    );

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('broadcasts booking_created only to the requested space room', () => {
    const emit = jest.fn();

    (gateway as any).server = {
      to: jest.fn().mockReturnValue({
        emit,
      }),
    };

    const payload = {
      id: 'booking-1',
      bookableType: 'DESK',
    };

    gateway.emitBookingCreated(
      'cku8x2vwn0000abcd1234efgh',
      payload,
    );

    expect((gateway as any).server.to).toHaveBeenCalledWith(
      'space:cku8x2vwn0000abcd1234efgh',
    );

    expect(emit).toHaveBeenCalledWith(
      'booking_created',
      payload,
    );
  });
});