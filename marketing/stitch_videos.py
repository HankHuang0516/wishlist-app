from moviepy.editor import VideoFileClip, concatenate_videoclips
import os

input_dir = "pomelli-output"
output_dir = "pomelli-output"

# Ensure absolute paths if needed, but relative should work from 'marketing' dir
# input_dir contains the clips

clips_files = ["video1_bad_gift.mp4", "video2_solution.mp4", "video3_happiness.mp4"]
clips = []

print(f"Looking for clips in {os.path.abspath(input_dir)}")

for f in clips_files:
    path = os.path.join(input_dir, f)
    if os.path.exists(path):
        print(f"Found {f}")
        clips.append(VideoFileClip(path))
    else:
        print(f"Missing: {path}")

if clips:
    print(f"Stitching {len(clips)} clips...")
    final_clip = concatenate_videoclips(clips, method="compose")
    output_path = os.path.join(output_dir, "final_ad.mp4")
    print(f"Writing to {output_path}...")
    final_clip.write_videofile(output_path, fps=24, codec='libx264', audio_codec='aac')
    print("Video stitching successful!")
else:
    print("No clips found to stitch.")
