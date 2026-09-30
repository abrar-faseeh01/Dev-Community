// The URL for the current search term: the current pathname and search params
// with only `q` changed. Other params (e.g. ?sort=, ?notice=) are kept. An
// empty term removes `q`, so bare /posts stays the canonical URL when there is
// no search. The caller passes the normalized term; nothing is trimmed here.
export function searchHref(
  pathname: string,
  params: { toString(): string },
  term: string,
): string {
  const next = new URLSearchParams(params.toString());
  if (term) next.set("q", term);
  else next.delete("q");
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
