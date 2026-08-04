import { Fragment } from 'react';

/** Matches bare URLs; the scheme check below decides what becomes a link. */
const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;

function isSafeHttpUrl(candidate: string): boolean {
  try {
    const { protocol } = new URL(candidate);

    // Only these two. A `javascript:` or `data:` URL renders as plain text.
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Message text with its links made clickable — and nothing else.
 *
 * There is deliberately no server-side unfurling: fetching arbitrary URLs to
 * build a preview card is an SSRF surface, and doing it safely means resolving
 * DNS ourselves, rejecting private ranges, pinning the connection against
 * rebinding, re-validating every redirect and capping size and time. Our API
 * sits beside Postgres, MinIO, Redis and, in production, a cloud metadata
 * endpoint — a naive fetcher would hand an attacker a scanner for exactly
 * those. The link still works; only the thumbnail is missing.
 *
 * Text is rendered as text: React escapes it, and no markup is ever built from
 * user input.
 */
export function MessageText({ body }: { body: string }) {
  const parts = body.split(URL_PATTERN);

  return (
    <>
      {parts.map((part, index) =>
        URL_PATTERN.test(part) && isSafeHttpUrl(part) ? (
          <a
            // Positional keys are correct here: the parts are a split of one
            // string and have no identity of their own.
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
