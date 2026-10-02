import { INestApplication } from '@nestjs/common';
import { createE2eApp, describeE2e } from './helpers/e2e-app';

// The generated OpenAPI document, compared against a committed snapshot. The
// controllers carry their Swagger decorators (or, since the clean-up, the
// <feature>.swagger.ts files they import), and nothing else checks that those
// still describe the API the same way: a decorator that is moved, dropped or
// reordered changes the document without failing any other test.
//
// If this fails and the change to the API docs was intended, review the diff
// and update the snapshot on purpose (`-u`). If it was not intended, it is a
// bug in whatever moved the decorators.
describeE2e('OpenAPI document', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('matches the committed snapshot', async () => {
    // Imported here for the same reason createE2eApp() imports AppModule
    // lazily: @nestjs/swagger and the Nest packages must finish loading first.
    const { SwaggerModule } = await import('@nestjs/swagger');
    const { buildSwaggerConfig } = await import('../src/swagger-config.js');

    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

    // Through JSON so the snapshot holds exactly what a client downloads from
    // /docs-json: no undefined values, no class instances.
    expect(JSON.parse(JSON.stringify(document))).toMatchSnapshot();
  });
});
