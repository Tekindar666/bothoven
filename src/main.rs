use std::env;

use bothoven::media::client::build_client;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt::init();

    let token = env::var("DISCORD_TOKEN").expect("set DISCORD_TOKEN in .env");
    let mut client = build_client(&token)
        .await
        .expect("failed to create Discord client");

    if let Err(why) = client.start().await {
        println!("Client error: {why:?}");
    }
}
