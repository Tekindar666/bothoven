import { getAccessToken } from "./auth.js";

// --- response types (only the fields we consume) ---

type SpotifyArtist = {
  name: string;
};

type SpotifyTrack = {
  name: string; // the music title
  artists: SpotifyArtist[];
  album: { name: string };
  duration_ms: number;
  external_urls: { spotify: string };
  uri: string; // e.g. "spotify:track:..."
};

type PlaylistTrackItem = {
  is_local: boolean;
  // null if the item is unavailable/removed
  track: SpotifyTrack | null;
};

export type SpotifyPlaylist = {
  name: string;
  owner: {
    display_name: string | null;
  };
  tracks: {
    items: PlaylistTrackItem[];
  };
};

// all types that can be passed to spotify get playlist endpoint
// only use playlist id and fields for now
type PlaylistsParams = {
  playlistId: string;
  market?: string;
  // filter the api call to prevent a large pile of data
  fields?: string;
  additional_types?: string;
};

const SPOTIFY_GET_PLAYLIST_ENDPOINT = "https://api.spotify.com/v1/playlists/";

export const getPlaylist = async (
  params: PlaylistsParams,
): Promise<SpotifyPlaylist> => {
  const { playlistId: id, fields } = params;

  const query = new URLSearchParams();
  if (fields) query.set("fields", fields);

  const qs = query.toString();
  const url = `${SPOTIFY_GET_PLAYLIST_ENDPOINT}${id}${qs ? `?${qs}` : ""}`;

  const token = await getAccessToken();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Spotify playlist request failed: ${res.status} ${res.statusText} ${body}`.trim(),
    );
  }
  const data = (await res.json()) as SpotifyPlaylist;

  return data;
};
