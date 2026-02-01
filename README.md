# VidTok 🎥

A professional, high-performance Electron application that transforms YouTube into a TikTok-style discovery experience. VidTok uses advanced recommendation signals (likes and watch-time) to recursively build an infinite feed of long-form content.

## 🚀 Features

*   **Vertical Feed:** TikTok-inspired vertical snap-scrolling layout.
*   **Discovery Engine:** Real-time recursive recommendation algorithm based on user interest signals.
*   **High-Quality Streaming:** Backend extraction powered by `pytubefix` for smooth playback.
*   **Automatic Clean-up:** Intelligent disk management that deletes temporary video files automatically.
*   **Shorts-Free:** Filtered logic to ensure you only get high-quality, long-form content in your feed.

## 🛠️ Prerequisites

Before setting up VidTok, ensure you have the following installed:

1.  **Node.js** (v18 or higher)
2.  **Python 3.10+**
3.  **YouTube Data API v3 Key** (Obtain one from the [Google Cloud Console](https://console.cloud.google.com/))

## 📦 Installation

Follow these steps to set up VidTok on your local machine:

### 1. Clone the Repository
```bash
git clone https://github.com/Baker-Harrison/VidTok.git
cd VidTok
```

### 2. Install Node.js Dependencies
```bash
npm install
```

### 3. Install Python Dependencies
It is recommended to use a virtual environment named `venv` in the root directory (the app will automatically detect it):
```bash
# Create and activate a venv
python3 -m venv venv
source venv/bin/activate # On Windows use `venv\Scripts\activate`

# Install requirements
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Create a `.env` file in the root directory and add your YouTube API key:
```env
YOUTUBE_API_KEY=your_api_key_here
```

## 🏃 Running the App

To launch VidTok, simply run:

```bash
npm start
```

## 🏗️ Architecture

VidTok is built with a decoupled, professional architecture:

*   **Main Process (`src/main.js`):** Orchestrates API calls to YouTube, manages IPC communication, and handles global application state.
*   **Renderer Process (`src/renderer.js`):** Manages the TikTok UI, utilizes `IntersectionObserver` for lazy-loading videos, and tracks user analytics for the recommendation engine.
*   **Python Engine (`backend/streamer.py`):** A specialized bridge that handles the heavy lifting of video extraction and local buffering.

## 🤝 Contributing

This project is maintained by **Baker-Harrison**. Contributions and bug reports are welcome via Issues and Pull Requests.

## ⚖️ License

ISC License - see [package.json](package.json) for details.
