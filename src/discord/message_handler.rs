use serenity::async_trait;
use serenity::client::{Context, EventHandler};
use serenity::model::gateway::Ready;

pub struct DiscordHandler;

#[async_trait]
impl EventHandler for DiscordHandler {
    async fn ready(&self, _: Context, ready: Ready) {
        println!("{} is connected", ready.user.name);
    }
}
