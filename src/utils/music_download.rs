use std::path::PathBuf;

use serde::Deserialize;
use tokio::process::Command;

use crate::media::player::MediaItem;

pub struct YtDlp {
    binary: PathBuf,
    ffmpeg: Option<PathBuf>,
    cache_dir: PathBuf,
}

#[derive(Deserialize)]
struct YtDlpInfo {
    id: String,
    title: String,
    duration: u64,
    webpage_url: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum YtDlpDump {
    Video(YtDlpInfo),
    Search { entries: Vec<YtDlpInfo> },
}

impl YtDlp {
    pub fn new(binary: PathBuf, ffmpeg: Option<PathBuf>, cache_dir: PathBuf) -> Self {
        Self {
            binary,
            ffmpeg,
            cache_dir,
        }
    }

    pub async fn download_audio(&self, query: &str) -> Result<MediaItem, String> {
        tokio::fs::create_dir_all(&self.cache_dir)
            .await
            .map_err(|err| format!("failed to create cache dir: {err}"))?;

        let input = yt_dlp_input(query);
        let info = self.fetch_info(&input).await?;
        let file_path = self.cached_file_path(&info.id);

        if !file_path.exists() {
            self.download_file(&info.webpage_url).await?;
        }

        if !file_path.exists() {
            return Err(format!(
                "yt-dlp did not create expected cache file: {}",
                file_path.display()
            ));
        }

        Ok(MediaItem {
            id: info.id,
            title: info.title,
            duration_seconds: info.duration,
            url: info.webpage_url,
            file_path,
        })
    }

    fn cached_file_path(&self, id: &str) -> PathBuf {
        self.cache_dir.join(format!("{id}.opus"))
    }

    async fn fetch_info(&self, input: &str) -> Result<YtDlpInfo, String> {
        let output = Command::new(&self.binary)
            .arg("--no-playlist")
            .arg("--dump-single-json")
            .arg(input)
            .output()
            .await
            .map_err(|err| format!("failed to run yt-dlp metadata lookup: {err}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        let dump: YtDlpDump = serde_json::from_slice(&output.stdout)
            .map_err(|err| format!("failed to parse yt-dlp metadata: {err}"))?;

        match dump {
            YtDlpDump::Video(info) => Ok(info),
            YtDlpDump::Search { mut entries } => entries
                .drain(..)
                .next()
                .ok_or_else(|| "yt-dlp search returned no entries".to_string()),
        }
    }

    async fn download_file(&self, url: &str) -> Result<PathBuf, String> {
        let output_template = self.cache_dir.join("%(id)s.%(ext)s");
        let mut command = Command::new(&self.binary);
        command
            .arg("--no-playlist")
            .arg("--extract-audio")
            .arg("--audio-format")
            .arg("opus")
            .arg("--audio-quality")
            .arg("0")
            .arg("--output")
            .arg(output_template)
            .arg("--print")
            .arg("after_move:filepath");

        if let Some(ffmpeg) = &self.ffmpeg {
            command.arg("--ffmpeg-location").arg(ffmpeg);
        }

        let output = command
            .arg(url)
            .output()
            .await
            .map_err(|err| format!("failed to run yt-dlp download: {err}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        let path = String::from_utf8_lossy(&output.stdout)
            .lines()
            .last()
            .ok_or_else(|| "yt-dlp did not print an output file".to_string())?
            .trim()
            .to_string();

        Ok(PathBuf::from(path))
    }
}

fn yt_dlp_input(input: &str) -> String {
    if looks_like_url(input) {
        input.to_string()
    } else {
        format!("ytsearch1:{input}")
    }
}

fn looks_like_url(input: &str) -> bool {
    input.starts_with("https://") || input.starts_with("http://")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn builds_yt_dlp_input() {
        assert_eq!(
            yt_dlp_input("https://example.com/song"),
            "https://example.com/song"
        );
        assert_eq!(
            yt_dlp_input("never gonna give you up"),
            "ytsearch1:never gonna give you up"
        );
    }

    #[test]
    fn parses_search_dump() {
        let dump: YtDlpDump = serde_json::from_str(
            r#"{"entries":[{"id":"fake-id","title":"Fake Song","duration":123,"webpage_url":"https://youtu.be/fake-id"}]}"#,
        )
        .unwrap();

        let YtDlpDump::Search { entries } = dump else {
            panic!("expected search dump");
        };

        assert_eq!(entries[0].duration, 123);
    }

    #[tokio::test]
    async fn download_audio_returns_track_and_saves_to_cache_dir() {
        let root = std::env::temp_dir().join(format!(
            "bothoven-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let binary = root.join("yt-dlp-fake");
        let cache = root.join(".cache/music");

        fs::create_dir_all(&root).unwrap();
        // ponytail: fake yt-dlp keeps this test offline; use real yt-dlp in manual smoke tests.
        fs::write(
            &binary,
            r#"#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "--dump-single-json" ]; then
    printf '%s\n' '{"id":"fake-id","title":"Fake Song","duration":123,"webpage_url":"https://youtu.be/fake-id"}'
    exit 0
  fi
done

out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output" ]; then
    shift
    out="$1"
  fi
  shift
done
path=$(printf '%s' "$out" | sed 's/%(id)s/fake-id/g; s/%(ext)s/opus/g')
mkdir -p "$(dirname "$path")"
touch "$path"
printf '%s\n' "$path"
"#,
        )
        .unwrap();
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o755)).unwrap();

        let downloader = YtDlp::new(binary, None, cache.clone());
        let track = downloader.download_audio("lofi beats").await.unwrap();

        assert_eq!(track.id, "fake-id");
        assert_eq!(track.title, "Fake Song");
        assert_eq!(track.duration_seconds, 123);
        assert_eq!(track.url, "https://youtu.be/fake-id");
        assert_eq!(track.file_path, cache.join("fake-id.opus"));
        assert!(track.file_path.exists());

        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn download_audio_uses_existing_cache_file() {
        let root = std::env::temp_dir().join(format!(
            "bothoven-cache-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let binary = root.join("yt-dlp-fake");
        let cache = root.join(".cache/music");
        let cached_file = cache.join("fake-id.opus");

        fs::create_dir_all(&cache).unwrap();
        fs::write(&cached_file, "already cached").unwrap();
        fs::write(
            &binary,
            r#"#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "--dump-single-json" ]; then
    printf '%s\n' '{"id":"fake-id","title":"Fake Song","duration":123,"webpage_url":"https://youtu.be/fake-id"}'
    exit 0
  fi
done
printf '%s\n' 'download should not be called' >&2
exit 42
"#,
        )
        .unwrap();
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o755)).unwrap();

        let downloader = YtDlp::new(binary, None, cache.clone());
        let track = downloader.download_audio("lofi beats").await.unwrap();

        assert_eq!(track.file_path, cached_file);
        assert_eq!(
            fs::read_to_string(track.file_path).unwrap(),
            "already cached"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    #[ignore = "hits YouTube and writes to .cache/music"]
    async fn real_yt_dlp_smoke_test() {
        let _ = dotenvy::dotenv();

        let binary = std::env::var("YTDL_BINARY").unwrap_or_else(|_| ".venv/bin/yt-dlp".into());
        let ffmpeg = std::env::var("FFMPEG_BINARY")
            .ok()
            .filter(|path| !path.is_empty())
            .filter(|path| PathBuf::from(path).exists());
        let cache = std::env::var("MUSIC_CACHE_DIR").unwrap_or_else(|_| ".cache/music".into());

        let downloader = YtDlp::new(
            PathBuf::from(binary),
            ffmpeg.map(PathBuf::from),
            PathBuf::from(cache),
        );

        let track = downloader
            .download_audio("never gonna give you up")
            .await
            .unwrap();

        assert!(!track.id.is_empty());
        assert!(!track.title.is_empty());
        assert!(track.duration_seconds > 0);
        assert!(track.url.starts_with("http"));
        assert!(track.file_path.exists());
    }

    #[tokio::test]
    #[ignore = "hits YouTube"]
    async fn real_yt_dlp_metadata_smoke_test() {
        let _ = dotenvy::dotenv();

        let binary = std::env::var("YTDL_BINARY").unwrap_or_else(|_| ".venv/bin/yt-dlp".into());
        let downloader = YtDlp::new(binary.into(), None, ".cache/music".into());
        let info = downloader
            .fetch_info("ytsearch1:never gonna give you up")
            .await
            .unwrap();

        assert!(!info.id.is_empty());
        assert!(!info.title.is_empty());
        assert!(info.duration > 0);
        assert!(info.webpage_url.starts_with("http"));
    }
}
