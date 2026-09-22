import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { MAX_COMMENT_BODY_LENGTH } from '../comment.constants';
import { CreateCommentDto } from './create-comment.dto';

// The real pipe with the real options from configure-app.ts, so this tests
// what actually runs in front of the controller rather than a reconstruction
// of it.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const meta: ArgumentMetadata = { type: 'body', metatype: CreateCommentDto };

const transform = (body: unknown) =>
  pipe.transform(body, meta) as Promise<CreateCommentDto>;

async function errorsFor(body: unknown): Promise<string[]> {
  try {
    await transform(body);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const response = (error as BadRequestException).getResponse() as {
      message: string[];
    };
    return response.message;
  }
  throw new Error('expected the payload to be rejected, but it passed');
}

const VALID_ID = '64f1c2e5a1b2c3d4e5f6a7c0';

describe('CreateCommentDto', () => {
  describe('body', () => {
    it('accepts a normal comment', async () => {
      const dto = await transform({ body: 'Nicely put.' });

      expect(dto).toBeInstanceOf(CreateCommentDto);
      expect(dto.body).toBe('Nicely put.');
      expect(dto.parentCommentId).toBeUndefined();
    });

    it('trims before validating, so the stored value is what was checked', async () => {
      const dto = await transform({ body: '  Nicely put.\n' });

      expect(dto.body).toBe('Nicely put.');
    });

    it('rejects a missing body', async () => {
      expect((await errorsFor({})).join(' ')).toContain('body');
    });

    it('rejects an empty body', async () => {
      expect((await errorsFor({ body: '' })).join(' ')).toContain(
        'body should not be empty',
      );
    });

    it('rejects a whitespace-only body, the case trimming exists for', async () => {
      expect((await errorsFor({ body: ' \t\n ' })).join(' ')).toContain(
        'body should not be empty',
      );
    });

    it('rejects a non-string body', async () => {
      expect((await errorsFor({ body: 42 })).join(' ')).toContain(
        'body must be a string',
      );
    });

    it(`accepts exactly ${MAX_COMMENT_BODY_LENGTH} characters`, async () => {
      const dto = await transform({ body: 'x'.repeat(MAX_COMMENT_BODY_LENGTH) });

      expect(dto.body).toHaveLength(MAX_COMMENT_BODY_LENGTH);
    });

    it('rejects one character more', async () => {
      const errors = await errorsFor({
        body: 'x'.repeat(MAX_COMMENT_BODY_LENGTH + 1),
      });

      expect(errors.join(' ')).toContain('body must be shorter than or equal to');
    });

    it('measures the limit against the trimmed value, not the padding', async () => {
      const dto = await transform({
        body: `   ${'x'.repeat(MAX_COMMENT_BODY_LENGTH)}   `,
      });

      expect(dto.body).toHaveLength(MAX_COMMENT_BODY_LENGTH);
    });
  });

  describe('parentCommentId', () => {
    it('accepts a valid id, making the comment a reply', async () => {
      const dto = await transform({ body: 'A reply.', parentCommentId: VALID_ID });

      expect(dto.parentCommentId).toBe(VALID_ID);
    });

    it('accepts an explicit null as a top-level comment', async () => {
      const dto = await transform({ body: 'Top level.', parentCommentId: null });

      expect(dto.parentCommentId).toBeNull();
    });

    it('rejects a malformed id', async () => {
      expect((await errorsFor({ body: 'x', parentCommentId: 'nope' })).join(' ')).toContain(
        'parentCommentId must be a mongodb id',
      );
    });

    it('rejects a non-string id', async () => {
      expect((await errorsFor({ body: 'x', parentCommentId: 42 })).join(' ')).toContain(
        'parentCommentId',
      );
    });
  });

  describe('unknown properties', () => {
    it('rejects anything not on the DTO', async () => {
      const errors = await errorsFor({ body: 'x', authorId: VALID_ID });

      expect(errors.join(' ')).toContain('authorId');
    });

    it('rejects a client-supplied postId — the path parameter is the only source', async () => {
      const errors = await errorsFor({ body: 'x', postId: VALID_ID });

      expect(errors.join(' ')).toContain('postId');
    });
  });
});
