import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';

// What the unit specs cannot show: that the body-parsing setup in
// configureApp() really sits in front of the routes, and that a real
// body-parser error comes out of the running app as the failure envelope with
// nothing from the request in it. No users are created, so there is nothing to
// clean up. POST /auth/login is used because it is public and takes a JSON
// body; an unknown email gets a fast 401 (no password hashing).
describeE2e('request body limits', () => {
  let app: INestApplication;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const unknownEmail = 'nobody-e2e-limits@example.test';

  it('still serves an ordinary small JSON request', async () => {
    const res = await http()
      .post('/auth/login')
      .send({ email: unknownEmail, password: 'whatever-it-is' })
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it('accepts a bodyless POST (logout sends no body and no Content-Type)', async () => {
    const res = await http().post('/auth/logout').expect(200);

    expect(res.body).toEqual({ success: true, data: null });
  });

  describe('malformed JSON', () => {
    const raw = '{"email":"a@example.test","password":hunter2}';

    it('is a 400 in the failure envelope', async () => {
      const res = await http()
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(400);

      expect(res.body).toEqual({
        success: false,
        statusCode: 400,
        message: 'Malformed JSON body',
        errors: [],
      });
    });

    it('does not echo any part of the body back', async () => {
      const res = await http()
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send(raw);

      expect(res.text).not.toContain('hunter2');
      expect(res.text).not.toContain('password');
      expect(res.text).not.toContain('Unexpected token');
    });
  });

  describe('oversized body', () => {
    it('over 100kb is a 413 in the failure envelope, not a 500', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ email: unknownEmail, password: 'x'.repeat(110_000) })
        .expect(413);

      expect(res.body).toEqual({
        success: false,
        statusCode: 413,
        message: 'Request body too large',
        errors: [],
      });
    });

    it('just under 100kb gets past the parser (and is refused later, by validation)', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ email: unknownEmail, password: 'x'.repeat(90_000) });

      expect(res.status).not.toBe(413);
      expect(res.status).not.toBe(415);
    });
  });

  describe('non-JSON bodies', () => {
    it('a urlencoded body is a 415 in the failure envelope', async () => {
      const res = await http()
        .post('/auth/login')
        .type('form')
        .send({ email: unknownEmail, password: 'whatever-it-is' })
        .expect(415);

      expect(res.body).toEqual({
        success: false,
        statusCode: 415,
        message: 'Request body must be application/json',
        errors: [],
      });
    });

    it('a text/plain body is a 415', async () => {
      await http()
        .post('/auth/login')
        .set('Content-Type', 'text/plain')
        .send('email=a&password=b')
        .expect(415);
    });

    it('a body with no Content-Type is a 415', async () => {
      await http()
        .post('/auth/login')
        .set('Content-Type', '')
        .send('{"email":"a@example.test","password":"b"}')
        .expect(415);
    });
  });
});
