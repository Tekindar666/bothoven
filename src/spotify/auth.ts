import { config } from "../config.js";

const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

export const getAccessToken = async (): Promise<string> => {
  // reuse if still valid (60s safety margin before expiry)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const basic = Buffer.from(
    `${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!res.ok) {
    throw new Error(
      `Spotify token request failed: ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as TokenResponse;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
};
