import { bootstrapE2e, createTenant, E2eContext } from './helpers/e2e-app';

// Rules the DATABASE itself must enforce, independent of application code.
describe('Schema invariants (e2e)', () => {
  let ctx: E2eContext;
  let T: Awaited<ReturnType<typeof createTenant>>;
  let T2: Awaited<ReturnType<typeof createTenant>>;

  beforeAll(async () => {
    ctx = await bootstrapE2e();
    T = await createTenant(ctx, 'Inv');
    T2 = await createTenant(ctx, 'Inv2');
  });

  afterAll(async () => {
    await ctx.cleanup([T.space.id, T2.space.id]);
    await ctx.app.close();
  });

  it('refuses a second SPACE_MANAGER in the same space', async () => {
    await expect(
      ctx.prisma.user.create({
        data: { email: `second-${ctx.uid()}@e2e.local`, role: 'SPACE_MANAGER', spaceId: T.space.id },
      }),
    ).rejects.toThrow();
  });

  it('still allows many MEMBERs in one space and one manager in each of several spaces', async () => {
    await ctx.prisma.user.create({
      data: { email: `m2-${ctx.uid()}@e2e.local`, role: 'MEMBER', spaceId: T.space.id },
    });
    expect(T2.manager.spaceId).not.toBe(T.manager.spaceId);
  });
});
