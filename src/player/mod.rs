use crate::types::MediaItem;

#[cfg(test)]
mod tests;

pub struct Player {
    media_items: Vec<MediaItem>,
    current_pos: Option<usize>,
    single_loop: bool,
}

impl Player {
    pub fn new() -> Self {
        Self {
            media_items: Vec::new(),
            current_pos: None,
            single_loop: false,
        }
    }

    pub fn enqueue_single(&mut self, media_item: MediaItem) {
        self.media_items.push(media_item);

        if self.current_pos.is_none() {
            self.current_pos = Some(0);
        }
    }

    pub fn current(&self) -> Result<&MediaItem, String> {
        let pos = self
            .current_pos
            .ok_or_else(|| "playlist is empty".to_string())?;

        self.media_items
            .get(pos)
            .ok_or_else(|| "current position is invalid".to_string())
    }

    pub fn play_next(&mut self) -> Result<&MediaItem, String> {
        if self.single_loop {
            return self.current();
        }

        let pos = self
            .current_pos
            .ok_or_else(|| "playlist is empty".to_string())?;
        let next_pos = pos + 1;

        if next_pos >= self.media_items.len() {
            return Err("already at end of playlist".to_string());
        }

        self.current_pos = Some(next_pos);
        self.current()
    }

    pub fn play_prev(&mut self) -> Result<&MediaItem, String> {
        let pos = self
            .current_pos
            .ok_or_else(|| "playlist is empty".to_string())?;

        if pos == 0 {
            return Err("already at start of playlist".to_string());
        }

        self.current_pos = Some(pos - 1);
        self.current()
    }

    pub fn set_single_loop(&mut self, enabled: bool) {
        self.single_loop = enabled;
    }
}

impl Default for Player {
    fn default() -> Self {
        Self::new()
    }
}
