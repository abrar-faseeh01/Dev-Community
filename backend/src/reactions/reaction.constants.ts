// How many reactors a "who reacted" request returns. A capped list rather than
// pages: the UI shows the people behind the like/dislike counts, it is not a
// feed to scroll. The counts in the same response are the true totals, so a UI
// can say "showing 50 of 812" without a second request.
export const MAX_REACTORS_LISTED = 50;
