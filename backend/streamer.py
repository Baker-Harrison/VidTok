import sys
import json
from pytubefix import YouTube

def get_video_metadata(url):
    try:
        yt = YouTube(url)
        # Filter for progressive streams (video + audio)
        stream = yt.streams.filter(progressive=True, file_extension='mp4').order_by('resolution').desc().first()
        
        if not stream:
            return {"error": "No suitable stream found"}

        return {
            "stream_url": stream.url,
            "title": yt.title,
            "id": yt.video_id,
            "filesize": stream.filesize
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No URL provided"}))
        sys.exit(1)
    
    url = sys.argv[1]
    result = get_video_metadata(url)
    print(json.dumps(result))
