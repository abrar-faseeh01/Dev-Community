import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';

describeE2e('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  // The greeting comes back inside the response envelope, because the app is
  // built with the same global setup as production.
  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ success: true, data: 'Hello World!' });
  });
});
