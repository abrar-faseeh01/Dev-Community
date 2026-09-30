import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, type E2eUser } from './helpers/e2e-data';

// GET /posts/search against the real database. Each test searches for a word
// built from this run's id, so it can only match posts this file created, no
// matter what else is in the collection.
describeE2e('GET /posts/search', () => {
  let app: INestApplication;
  let data: E2eData;
  let author: E2eUser;
  let reader: E2eUser;

  type Item = {
    id: string;
    rankScore: number | null;
    myReaction: string | null;
  };
  type Result = { items: Item[]; hasMore: boolean };

  beforeAll(async () => {
    app = await createE2eApp();
    data = new E2eData(app);
    await data.sweepLeftovers();
    // A $text query fails if the text index doesn't exist yet, and app.init()
    // doesn't wait for the background index build. createIndexes() builds only
    // the schema's missing indexes and waits for them; unlike syncIndexes() it
    // never drops anything on the real database.
    await data.models.post.createIndexes();

    author = await data.createUser('user');
    reader = await data.createUser('user');
  });

  afterAll(async () => {
    try {
      await data?.cleanup();
    } finally {
      await app?.close();
    }
  });

  const http = () => request(app.getHttpServer());
  const word = (label: string) => `${label}${data.runId}`;

  // Straight to the model, one after another: _id order (and so the
  // tie-break) follows creation order.
  async function makePost(title: string, body: string) {
    const doc = await data.models.post.create({
      authorId: author.id,
      title,
      body,
    });
    const id = String(doc._id);
    data.trackPost(id);
    return id;
  }

  async function search(
    q: string,
    extra: Record<string, string | number> = {},
  ) {
    const res = await http()
      .get('/posts/search')
      .query({ q, ...extra })
      .expect(200);
    return res.body.data as Result;
  }

  describe('matching', () => {
    it('returns the posts that contain the word and nothing else', async () => {
      const w = word('match');
      const hit = await makePost(`About ${w}`, 'some body text');
      await makePost('Something else', 'no relevant words in here');

      const result = await search(w);

      expect(result.items.map((p) => p.id)).toEqual([hit]);
      expect(result.hasMore).toBe(false);
    });

    it('answers a word with no matches with 200 and an empty list', async () => {
      const result = await search(word('nomatch'));
      expect(result).toEqual({ items: [], hasMore: false });
    });

    it('always returns rankScore null', async () => {
      const w = word('rank');
      await makePost(`Ranked ${w}`, 'body');
      await makePost(`Ranked again ${w}`, 'body');

      const result = await search(w);

      expect(result.items).toHaveLength(2);
      for (const item of result.items) expect(item.rankScore).toBeNull();
    });

    it('puts posts with identical scores in newest-first order, every time', async () => {
      const w = word('tie');
      const first = await makePost(`Same ${w}`, 'identical body');
      const second = await makePost(`Same ${w}`, 'identical body');

      for (let i = 0; i < 3; i++) {
        const result = await search(w);
        expect(result.items.map((p) => p.id)).toEqual([second, first]);
      }
    });
  });

  describe('q validation', () => {
    it('rejects a missing, empty or whitespace-only q', async () => {
      await http().get('/posts/search').expect(400);
      await http().get('/posts/search?q=').expect(400);
      await http().get('/posts/search?q=%20%20%20').expect(400);
    });

    it('accepts a q of exactly 100 characters and rejects 101', async () => {
      await http()
        .get('/posts/search')
        .query({ q: 'a'.repeat(100) })
        .expect(200);
      await http()
        .get('/posts/search')
        .query({ q: 'a'.repeat(101) })
        .expect(400);
    });

    it('rejects a q sent as an array (repeated key)', async () => {
      // A repeated key arrives as query.q = ['a', 'b'], which @IsString()
      // rejects.
      await http().get('/posts/search?q=a&q=b').expect(400);
    });

    it('rejects a bracket-style key without ever forming an object', async () => {
      // Express 5's default query parser (`querystring`, not the older
      // `qs`) has no bracket support: q[$ne]=x parses to one literal
      // property named "q[$ne]" — q itself is left unset. The 400 here
      // comes from that unknown property (forbidNonWhitelisted) plus q
      // missing, not from @IsString() rejecting an object — a nested-object
      // query never reaches validation on this route, or anywhere else in
      // this app, because Express never builds one in the first place.
      await http().get('/posts/search?q[$ne]=x').expect(400);
    });

    it('rejects parameters the route does not declare', async () => {
      await http().get('/posts/search?q=x&cursor=abc').expect(400);
      await http().get('/posts/search?q=x&sort=top').expect(400);
      await http().get('/posts/search?q=x&authorId=abc').expect(400);
    });
  });

  describe('limit and hasMore', () => {
    it('accepts limit 20 and rejects 21', async () => {
      await http()
        .get('/posts/search')
        .query({ q: 'x', limit: 20 })
        .expect(200);
      await http()
        .get('/posts/search')
        .query({ q: 'x', limit: 21 })
        .expect(400);
    });

    it('flags hasMore when more posts matched than limit, and not when exactly limit did', async () => {
      const w = word('cap');
      for (let i = 0; i < 3; i++) await makePost(`Cap ${w} ${i}`, 'body');

      const capped = await search(w, { limit: 2 });
      expect(capped.items).toHaveLength(2);
      expect(capped.hasMore).toBe(true);

      const exact = await search(w, { limit: 3 });
      expect(exact.items).toHaveLength(3);
      expect(exact.hasMore).toBe(false);
    });
  });

  describe('$text query syntax', () => {
    it('lets a leading minus exclude a word from a positive search', async () => {
      const w = word('excl');
      const keep = await makePost(`Keep ${w}`, 'body');
      await makePost(`Drop ${w} banned`, 'body');

      const result = await search(`${w} -banned`);

      expect(result.items.map((p) => p.id)).toEqual([keep]);
    });

    it('returns an empty list, not an error, for a query of only an exclusion', async () => {
      const w = word('only');
      await makePost(`Present ${w}`, 'body');

      const result = await search(`-${w}`);

      expect(result).toEqual({ items: [], hasMore: false });
    });

    it('handles an unbalanced quote without an error', async () => {
      const result = await search('"unbalanced quote');
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.hasMore).toBe('boolean');
    });
  });

  describe('soft-deleted posts', () => {
    it('never appear in results', async () => {
      const w = word('gone');
      const id = await makePost(`Delete me ${w}`, 'body');
      expect((await search(w)).items.map((p) => p.id)).toEqual([id]);

      await http()
        .delete(`/posts/${id}`)
        .set('Cookie', author.cookie)
        .expect((res) => expect(res.status).toBeLessThan(300));

      expect(await search(w)).toEqual({ items: [], hasMore: false });
    });
  });

  describe('myReaction', () => {
    it('is null for an anonymous reader and the real reaction for a signed-in one', async () => {
      const w = word('react');
      const id = await makePost(`Reactions ${w}`, 'body');

      await http()
        .post(`/posts/${id}/reaction`)
        .set('Cookie', reader.cookie)
        .send({ type: 'like' })
        .expect((res) => expect([200, 201]).toContain(res.status));

      const anonymous = await search(w);
      expect(anonymous.items[0].myReaction).toBeNull();

      const signedIn = await http()
        .get('/posts/search')
        .query({ q: w })
        .set('Cookie', reader.cookie)
        .expect(200);
      expect(signedIn.body.data.items[0].myReaction).toBe('like');
    });
  });
});
