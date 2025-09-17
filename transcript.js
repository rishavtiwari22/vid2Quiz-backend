import { getSubtitles } from 'headless-youtube-captions';

export async function getYouTubeTranscript(videoId) {
    try {
        // Validate video ID
        if (!videoId || typeof videoId !== 'string') {
            throw new Error('Invalid video ID provided');
        }
        
        // Extract captions using headless-youtube-captions
        const captions = await getSubtitles({
            videoID: videoId,
            lang: 'en'
        });
        
        // Check if captions were found
        if (!captions || captions.length === 0) {
            throw new Error('No captions found for this video');
        }
        
        // Join all caption text into a single transcript
        const transcript = captions.map(c => c.text).join(" ");
        
        // Validate transcript length
        if (transcript.split(' ').length < 50) {
            return { error: "Not enough reliable information in the transcript" };
        }
        
        return transcript;
        
    } catch (error) {
        // Handle specific error cases
        if (error.message.includes('No captions')) {
            return { error: "No captions available for this video. Please try a video with subtitles." };
        } else if (error.message.includes('Invalid video ID')) {
            return { error: "Invalid YouTube video ID provided" };
        } else {
            return { error: "Failed to extract transcript. Please try another video." };
        }
    }
}
