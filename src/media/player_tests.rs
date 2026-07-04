use super::*;

fn item(id: &str) -> MediaItem {
    MediaItem {
        id: id.to_string(),
        title: format!("Song {id}"),
        duration_seconds: 123,
        url: format!("https://example.com/{id}"),
        file_path: PathBuf::from(format!(".cache/music/{id}.opus")),
    }
}

#[test]
fn enqueue_sets_current_item() {
    let mut player = Player::new();

    player.enqueue_single(item("a"));

    assert_eq!(player.current().unwrap().id, "a");
}

#[test]
fn play_next_and_play_prev_move_current_position() {
    let mut player = Player::new();
    player.enqueue_single(item("a"));
    player.enqueue_single(item("b"));

    assert_eq!(player.play_next().unwrap().id, "b");
    assert_eq!(player.play_prev().unwrap().id, "a");
}

#[test]
fn single_loop_keeps_current_item() {
    let mut player = Player::new();
    player.enqueue_single(item("a"));
    player.enqueue_single(item("b"));
    player.set_single_loop(true);

    assert_eq!(player.play_next().unwrap().id, "a");
}
