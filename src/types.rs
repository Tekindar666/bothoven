use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MediaItem {
    pub id: String,
    pub title: String,
    pub duration_seconds: u64,
    pub url: String,
    pub file_path: PathBuf,
}
