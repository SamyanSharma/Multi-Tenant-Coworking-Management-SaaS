import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ZonesService } from './zones.service';

function build(zone: any = { id: 'z1', spaceId: 's1', name: 'Old', isActive: true, deletedAt: null }) {
  const prisma: any = {
    zone: {
      findUnique: jest.fn().mockResolvedValue(zone),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...zone, ...data })),
    },
  };
  return { service: new ZonesService(prisma), prisma };
}

describe('ZonesService.update', () => {
  it('renames without touching isActive', async () => {
    const { service, prisma } = build();

    await service.update('z1', { name: 'New' }, 's1');

    expect(prisma.zone.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'New' } }),
    );
  });

  it('toggles isActive without touching the name', async () => {
    const { service, prisma } = build();

    const result = await service.update('z1', { isActive: false }, 's1');

    expect(prisma.zone.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(result.isActive).toBe(false);
  });

  it('can reactivate (isActive false -> true is a real write, not skipped as falsy)', async () => {
    const { service, prisma } = build({ id: 'z1', spaceId: 's1', name: 'Old', isActive: false, deletedAt: null });

    await service.update('z1', { isActive: true }, 's1');

    expect(prisma.zone.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    );
  });

  it('applies both fields in one update', async () => {
    const { service, prisma } = build();

    await service.update('z1', { name: 'New', isActive: false }, 's1');

    expect(prisma.zone.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'New', isActive: false } }),
    );
  });

  it('rejects an empty update with 400 and never touches the DB', async () => {
    const { service, prisma } = build();

    await expect(service.update('z1', {}, 's1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.zone.findUnique).not.toHaveBeenCalled();
    expect(prisma.zone.update).not.toHaveBeenCalled();
  });

  it("404s for another space's zone (tenant isolation)", async () => {
    const { service, prisma } = build({ id: 'z1', spaceId: 'other', name: 'X', isActive: true, deletedAt: null });

    await expect(service.update('z1', { isActive: false }, 's1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.zone.update).not.toHaveBeenCalled();
  });

  it('404s for a soft-deleted zone', async () => {
    const { service } = build({ id: 'z1', spaceId: 's1', name: 'X', isActive: true, deletedAt: new Date() });

    await expect(service.update('z1', { isActive: false }, 's1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
