import {
  counterDelta,
  displayCount,
  oppositeType,
  resultingReaction,
} from './reaction-toggle';

// A table of the helpers' own contract. It does not prove the service picks
// the right action for what the database did — that is reactions.service.spec.ts,
// which runs these same helpers behind mocked models.

describe('oppositeType', () => {
  it('flips like and dislike', () => {
    expect(oppositeType('like')).toBe('dislike');
    expect(oppositeType('dislike')).toBe('like');
  });
});

describe('counterDelta', () => {
  it.each([
    ['created', 'like', { likeCount: 1, dislikeCount: 0 }],
    ['created', 'dislike', { likeCount: 0, dislikeCount: 1 }],
    ['removed', 'like', { likeCount: -1, dislikeCount: 0 }],
    ['removed', 'dislike', { likeCount: 0, dislikeCount: -1 }],
    // Switched: the type is the NEW one, so switching to like takes a dislike
    // away, and the mirror.
    ['switched', 'like', { likeCount: 1, dislikeCount: -1 }],
    ['switched', 'dislike', { likeCount: -1, dislikeCount: 1 }],
  ] as const)('%s %s', (action, type, expected) => {
    expect(counterDelta(action, type)).toEqual(expected);
  });

  it('only a switch moves both counters', () => {
    for (const type of ['like', 'dislike'] as const) {
      const moved = (action: 'created' | 'removed' | 'switched') => {
        const d = counterDelta(action, type);
        return [d.likeCount, d.dislikeCount].filter((n) => n !== 0).length;
      };
      expect(moved('created')).toBe(1);
      expect(moved('removed')).toBe(1);
      expect(moved('switched')).toBe(2);
    }
  });

  it('a create followed by a remove of the same type nets to zero', () => {
    const up = counterDelta('created', 'like');
    const down = counterDelta('removed', 'like');
    expect(up.likeCount + down.likeCount).toBe(0);
    expect(up.dislikeCount + down.dislikeCount).toBe(0);
  });

  it('a switch there and back nets to zero', () => {
    const toLike = counterDelta('switched', 'like');
    const toDislike = counterDelta('switched', 'dislike');
    expect(toLike.likeCount + toDislike.likeCount).toBe(0);
    expect(toLike.dislikeCount + toDislike.dislikeCount).toBe(0);
  });
});

describe('resultingReaction', () => {
  it('is the requested type after a create or a switch', () => {
    expect(resultingReaction('created', 'like')).toBe('like');
    expect(resultingReaction('created', 'dislike')).toBe('dislike');
    expect(resultingReaction('switched', 'like')).toBe('like');
    expect(resultingReaction('switched', 'dislike')).toBe('dislike');
  });

  it('is null after a remove', () => {
    expect(resultingReaction('removed', 'like')).toBeNull();
    expect(resultingReaction('removed', 'dislike')).toBeNull();
  });
});

describe('displayCount', () => {
  it('passes a normal counter through', () => {
    expect(displayCount(0)).toBe(0);
    expect(displayCount(7)).toBe(7);
  });

  it('floors a drifted (negative) counter at 0', () => {
    expect(displayCount(-1)).toBe(0);
    expect(displayCount(-40)).toBe(0);
  });

  it('reads a counter that is not stored as 0', () => {
    expect(displayCount(undefined)).toBe(0);
    expect(displayCount(null)).toBe(0);
  });
});
