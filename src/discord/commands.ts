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
    name: "play",
    description: "Play the current queue in your voice channel",
  },
];
