// Extract a Spotify playlist id from a raw id, an open.spotify.com URL, or a
// spotify:playlist: URI. Returns undefined if nothing valid is found.
export function parsePlaylistId(query: string): string | undefined {
  const trimmed = query.trim();

  // spotify:playlist:<id>
  const uriMatch = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(trimmed);
  if (uriMatch) return uriMatch[1];

  // https://open.spotify.com/playlist/<id>?si=...
  try {
    const url = new URL(trimmed);
    if (url.hostname.endsWith("spotify.com")) {
      const segments = url.pathname.split("/").filter(Boolean);
      const index = segments.indexOf("playlist");
      if (index !== -1) return segments[index + 1];
    }
  } catch {
    // not a URL — fall through to raw-id check
  }

  // raw id
  if (/^[A-Za-z0-9]+$/.test(trimmed)) return trimmed;

  return undefined;
}
