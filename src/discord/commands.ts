import {
  ApplicationCommandOptionType,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";

export const commands: RESTPostAPIApplicationCommandsJSONBody[] = [
  {
    name: "enqueue",
    description: "Add a song to the queue",
    options: [
      {
        name: "query",
        description: "YouTube URL or search terms",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: "dequeue",
    description: "Remove a song from the playlist",
    options: [
      {
        name: "index",
        description: "Playlist position to remove",
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 1,
      },
    ],
  },
  {
    name: "playlist",
    description: "Add a Spotify playlist to the queue (first 100 tracks)",
    options: [
      {
        name: "query",
        description: "spotify playlist link or id",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: "play",
    description: "Play the current queue in your voice channel",
  },
  {
    name: "pause",
    description: "Pause or resume the current song",
  },
  {
    name: "next",
    description: "Play the next song",
  },
  {
    name: "prev",
    description: "Play the previous song",
  },
  {
    name: "clear",
    description: "Clear the playlist and disconnect",
  },
  {
    name: "loop",
    description: "Toggle looping the current song",
  },
  {
    name: "shuffle",
    description: "Shuffle the upcoming songs",
  },
];
