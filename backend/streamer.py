import sys
import os
import json
from pytubefix import YouTube
from pytubefix.cli import on_progress
import tempfile

def download_video(url):
    try:
        yt = YouTube(url, on_progress_callback=on_progress)
        # Filter for progressive streams (video + audio in one file)
        stream = yt.streams.filter(progressive=True, file_extension='mp4').order_by('resolution').desc().first()
        
        if not stream:
            return {"error": "No suitable stream found"}

        # Create a temp directory if it doesn't exist
        temp_dir = os.path.join(tempfile.gettempdir(), "vidtok")
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)

        file_path = stream.download(output_path=temp_dir)
        return {"path": file_path, "title": yt.title}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No URL provided"}))
        sys.exit(1)
    
    url = sys.argv[1]
    result = download_video(url)
    print(json.dumps(result))
