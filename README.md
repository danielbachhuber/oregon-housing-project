Oregon Housing Project
======================

The Oregon Housing Project is a collection of research and analysis on housing in Oregon. Its mission is to explore the topic of housing in Oregon at depth in a way that makes the topic accessible to more people.

[Visit the Oregon Housing Project](https://oregonhousingproject.org/) to learn more about the project.

## Installing

The project uses [Hugo](https://gohugo.io/) to generate the website. Once you have it installed locally, you can run:

```sh
hugo server
```

## Meeting Transcription

The project includes automated tools for downloading, transcribing, and publishing meeting videos from YouTube.

### Prerequisites

- Python 3.8 or higher
- ffmpeg (for audio/video processing)
- pip (Python package installer)

Install Python dependencies:

```sh
pip install -r scripts/requirements.txt
```

### Quick Start

Process a meeting video in one command:

```sh
./scripts/process_meeting.sh \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --date "2026-01-05" \
  --entity "dlcd" \
  --cleanup
```

This will:
1. Download the video from YouTube
2. Transcribe it using OpenAI Whisper
3. Create a Hugo markdown document with the transcript
4. Optionally delete the video file (with `--cleanup`)

### Supported Entities

- `dlcd` - Oregon DLCD meetings
- `tualatin` - Tualatin Planning Commission meetings

### Next Steps

After processing, the generated document requires manual review:
1. Add a summary of the meeting
2. Identify and document key topics
3. Add internal links to related legislation, people, and cities
4. Review the transcript for accuracy

See `templates/meeting.md` for detailed guidance on meeting documentation structure.

## Contributing

If you'd like to participate, feel free to [create a new issue](https://github.com/danielbachhuber/oregon-housing-project/issues/new), [join the discussion on existing issues](https://github.com/danielbachhuber/oregon-housing-project/issues), or submit a pull request!

Please [read the contribute page](https://oregonhousingproject.org/contribute/) for more information.