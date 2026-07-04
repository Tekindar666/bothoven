use serenity::client::Client;
use serenity::prelude::GatewayIntents;
use songbird::SerenityInit;

use crate::discord::message_handler::DiscordHandler;

pub async fn build_client(token: &str) -> serenity::Result<Client> {
    let intents = GatewayIntents::GUILDS | GatewayIntents::GUILD_VOICE_STATES;

    Client::builder(token, intents)
        .event_handler(DiscordHandler)
        .register_songbird()
        .await
}
