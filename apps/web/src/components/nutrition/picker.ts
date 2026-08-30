/**
 * How many rows a picker asks for.
 *
 * The API's ceiling, and deliberately not the list default: a picker showing
 * page one of a paginated collection is a picker that cannot see most of it.
 * With the shipped library that meant 20 of 79 foods — a trainer could not
 * compose a meal containing chicken. The search box below covers the rest.
 */
export const PICKER_PAGE_SIZE = 100;

/**
 * An option list that always contains what is already selected.
 *
 * A row whose food is not in the current search results would otherwise render
 * blank and read as a different food than it is. The names already travel with
 * the meal, so a selected row can name itself without another request.
 */
export function withSelected(
  options: { value: string; label: string }[],
  selected: { value: string; label: string }[],
): { value: string; label: string }[] {
  const known = new Set(options.map((option) => option.value));
  const missing = selected.filter((option) => option.value !== '' && !known.has(option.value));

  return [...missing, ...options];
}
