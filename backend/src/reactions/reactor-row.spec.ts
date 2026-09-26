import { Types } from 'mongoose';
import { toReactor, type PopulatedReaction } from './reactor-row';

// The contract of the one place a stored reaction becomes a "who reacted"
// entry. The service spec runs this same function behind a mocked model.

const USER_ID = new Types.ObjectId();

describe('toReactor', () => {
  it('returns the user as {id, fullName, headline} plus the reaction type', () => {
    const row: PopulatedReaction = {
      _id: new Types.ObjectId(),
      type: 'like',
      userId: { _id: USER_ID, fullName: 'Ada Lovelace', headline: 'Engineer' },
    };

    expect(toReactor(row)).toEqual({
      user: {
        id: String(USER_ID),
        fullName: 'Ada Lovelace',
        headline: 'Engineer',
      },
      type: 'like',
    });
  });

  it('keeps the type as it is, for a dislike too', () => {
    const row: PopulatedReaction = {
      _id: new Types.ObjectId(),
      type: 'dislike',
      userId: { _id: USER_ID, fullName: 'Ada Lovelace' },
    };

    expect(toReactor(row).type).toBe('dislike');
  });

  it('turns a deleted account (populated to null) into the Deleted user placeholder', () => {
    const row: PopulatedReaction = {
      _id: new Types.ObjectId(),
      type: 'like',
      userId: null,
    };

    expect(toReactor(row)).toEqual({
      user: { id: null, fullName: 'Deleted user', headline: null },
      type: 'like',
    });
  });

  it('lets nothing else through, whatever the populated object carries', () => {
    const row = {
      _id: new Types.ObjectId(),
      type: 'like',
      userId: {
        _id: USER_ID,
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'admin',
        passwordHash: 'secret',
      },
      updatedAt: new Date(),
    } as unknown as PopulatedReaction;

    const reactor = toReactor(row);

    expect(Object.keys(reactor).sort()).toEqual(['type', 'user']);
    expect(Object.keys(reactor.user).sort()).toEqual([
      'fullName',
      'headline',
      'id',
    ]);
  });
});
