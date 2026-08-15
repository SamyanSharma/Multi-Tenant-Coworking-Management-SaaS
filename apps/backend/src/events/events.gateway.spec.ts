import { EventsGateway } from './events.gateway';

describe('EventsGateway', () => {
  let gateway: EventsGateway;

  beforeEach(() => {
    gateway = new EventsGateway();
  });

  function mockSocket(spaceId?: string) {
    return {
      id: 'socket-1',
      handshake: { auth: spaceId ? { spaceId } : {} },
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as any;
  }

  it('joins the correct spaceId-scoped room on connection', () => {
    const client = mockSocket('cku8x2vwn0000abcd1234efgh');
    gateway.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith('space:cku8x2vwn0000abcd1234efgh');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects and disconnects a socket with no spaceId in handshake.auth', () => {
    const client = mockSocket(undefined);
    gateway.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'connection_error',
      expect.any(Object),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects a socket with a malformed spaceId', () => {
    const client = mockSocket('not-a-real-cuid');
    gateway.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('emitBookingCreated broadcasts ONLY to the matching space room, not globally', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    gateway.server = { to } as any;

    const spaceIdA = 'cku8x2vwn0000abcd1234efgh';
    const payload = { id: 'booking-1' };
    gateway.emitBookingCreated(spaceIdA, payload);

    // The key assertion: .to() was called with SPACE A's room specifically
    // — not server.emit() (which would broadcast to every connected
    // client regardless of space), and not some other space's room.
    expect(to).toHaveBeenCalledWith(`space:${spaceIdA}`);
    expect(to).not.toHaveBeenCalledWith(expect.stringContaining('space:other'));
    expect(emit).toHaveBeenCalledWith('booking_created', payload);
  });

  it('two different spaces get routed to two different rooms', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    gateway.server = { to } as any;

    const spaceA = 'cku8x2vwn0000aaaaaaaaaaaa';
    const spaceB = 'cku8x2vwn0000bbbbbbbbbbbb';
    gateway.emitBookingCreated(spaceA, { id: 'b1' });
    gateway.emitBookingCreated(spaceB, { id: 'b2' });

    expect(to).toHaveBeenNthCalledWith(1, `space:${spaceA}`);
    expect(to).toHaveBeenNthCalledWith(2, `space:${spaceB}`);
  });
});
