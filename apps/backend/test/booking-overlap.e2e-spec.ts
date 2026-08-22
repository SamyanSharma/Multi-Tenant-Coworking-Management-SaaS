describe('Booking overlap', () => {
  it('should reject overlapping bookings', async () => {
    const firstBooking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        bookableType: 'DESK',
        bookableId: deskId,
        startTime: '2026-08-25T10:00:00.000Z',
        endTime: '2026-08-25T11:00:00.000Z',
      });

    expect(firstBooking.status).toBe(201);

    const overlappingBooking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        bookableType: 'DESK',
        bookableId: deskId,
        startTime: '2026-08-25T10:30:00.000Z',
        endTime: '2026-08-25T11:30:00.000Z',
      });

    expect(overlappingBooking.status).toBe(409);
  });
});
