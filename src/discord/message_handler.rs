use serenity::all::{Command, CreateCommand};
use serenity::async_trait;
use serenity::client::{Context, EventHandler};
use serenity::model::gateway::Ready;

pub struct DiscordHandler;

impl DiscordHandler {
    pub fn new() -> Self {
        Self
    }

    fn response(responseBody: String) -> Result<String, String> {
        // create a response to discord based.
        // takes in a string for the response
        // could potentially need to take in a token or id for the server to return to.
        Ok(String::from("successfully return to discord"))
    }
}

#[async_trait]
impl EventHandler for DiscordHandler {
    /*
     * implement eventhandler
     */
    async fn ready(&self, context: Context, ready: Ready) {
        println!("{} is connected", ready.user.name);

        Command::create_global_command(
            &context.http,
            CreateCommand::new("help").description("show bot commands"),
        )
        .await
        .expect("failed to register /help");
    }
}
