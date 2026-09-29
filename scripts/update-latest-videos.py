import json
import re
from pathlib import Path
from urllib.request import Request, urlopen


CHANNEL_URL = "https://www.youtube.com/@Church_P/videos?hl=ru"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "latest-videos.json"
VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")


def fetch_channel_data():
    request = Request(
        CHANNEL_URL,
        headers={
            "Accept-Language": "ru-RU,ru;q=0.9",
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
        },
    )
    with urlopen(request, timeout=30) as response:
        page = response.read().decode("utf-8")

    match = re.search(r"var ytInitialData = (\{.*?\});</script>", page, re.DOTALL)
    if not match:
        raise RuntimeError("YouTube channel page did not include its upload data")
    return json.loads(match.group(1))


def find_upload_grid(value):
    if isinstance(value, dict):
        grid = value.get("richGridRenderer")
        if isinstance(grid, dict) and isinstance(grid.get("contents"), list):
            videos = [
                entry.get("richItemRenderer", {})
                .get("content", {})
                .get("lockupViewModel")
                for entry in grid["contents"]
            ]
            has_video = any(
                isinstance(video, dict)
                and video.get("contentType") == "LOCKUP_CONTENT_TYPE_VIDEO"
                for video in videos
            )
            if has_video:
                return videos

        for child in value.values():
            result = find_upload_grid(child)
            if result is not None:
                return result
    elif isinstance(value, list):
        for child in value:
            result = find_upload_grid(child)
            if result is not None:
                return result
    return None


def extract_videos(data):
    upload_grid = find_upload_grid(data)
    if upload_grid is None:
        raise RuntimeError("Could not find the channel uploads grid")

    videos = []
    for item in upload_grid:
        if not isinstance(item, dict) or item.get("contentType") != "LOCKUP_CONTENT_TYPE_VIDEO":
            continue

        video_id = item.get("contentId", "")
        metadata = item.get("metadata", {}).get("lockupMetadataViewModel", {})
        title = metadata.get("title", {}).get("content", "")
        if not VIDEO_ID_PATTERN.fullmatch(video_id) or not title:
            continue

        videos.append({"id": video_id, "title": title})
        if len(videos) == 3:
            break

    if len(videos) != 3:
        raise RuntimeError(f"Expected three channel videos, found {len(videos)}")
    return {"videos": videos}


def main():
    latest_videos = extract_videos(fetch_channel_data())
    OUTPUT_PATH.write_text(
        json.dumps(latest_videos, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Updated {len(latest_videos['videos'])} latest videos in {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
