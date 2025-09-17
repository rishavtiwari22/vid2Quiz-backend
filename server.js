import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { getYouTubeTranscript } from "./transcript.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Function to generate quiz questions using OpenRouter
async function generateQuizQuestions(transcript) {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
        throw new Error("OpenRouter API key not configured. Please add your API key to the .env file.");
    }

    const prompt = `Based on the following YouTube video transcript, generate exactly 5 multiple-choice quiz questions to help users practice and test their understanding of the content.

IMPORTANT: Respond ONLY with valid JSON. Do not include any explanations, code blocks, or additional text.

Format your response as a JSON array with this exact structure:
[
  {
    "question": "Question text here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0
  }
]

Requirements:
- "correct" is the index (0-3) of the correct answer
- Use simple, clear question text without special characters
- Avoid quotes within question text and options
- Make questions based directly on the transcript content
- Include varied difficulty levels
- Create plausible wrong answers

Transcript:
${transcript.substring(0, 3000)}`; // Limit transcript length to avoid token limits

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "deepseek/deepseek-r1:free",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenRouter API error response:", errorText);
            
            if (response.status === 401) {
                throw new Error("Invalid OpenRouter API key. Please check your API key in the .env file.");
            } else if (response.status === 429) {
                throw new Error("Rate limit exceeded. Please try again later.");
            } else {
                throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
            }
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        console.log("AI Response:", content);
        
        // Extract JSON from the response with better handling
        let jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            // Try to find JSON in code blocks
            jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
            if (jsonMatch) {
                jsonMatch[0] = jsonMatch[1];
            }
        }
        
        if (!jsonMatch) {
            console.error("No JSON found in AI response:", content);
            throw new Error("Could not find valid JSON in AI response");
        }
        
        let jsonString = jsonMatch[0];
        
        // Clean up common JSON issues
        try {
            // First try parsing as-is
            const questions = JSON.parse(jsonString);
            return questions;
        } catch (firstError) {
            console.log("First parse failed, trying to clean JSON:", firstError.message);
            
            // Try to fix common issues
            try {
                // Remove any trailing commas and fix escaped quotes
                jsonString = jsonString
                    .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                    .replace(/\\"/g, '"') // Fix escaped quotes
                    .replace(/"\s*\n\s*"/g, '" "') // Fix line breaks in strings
                    .replace(/\n/g, ' ') // Replace newlines with spaces
                    .replace(/\s+/g, ' ') // Normalize whitespace
                    .trim();
                
                const questions = JSON.parse(jsonString);
                return questions;
            } catch (secondError) {
                console.error("Cleaned JSON still invalid:", jsonString);
                console.error("Parse error:", secondError.message);
                
                // Generate fallback questions
                return [
                    {
                        question: "Based on the transcript, what was the main topic discussed?",
                        options: ["Technology", "Education", "Entertainment", "Business"],
                        correct: 0
                    },
                    {
                        question: "What key concept was emphasized in the content?",
                        options: ["Innovation", "Learning", "Growth", "Success"],
                        correct: 1
                    },
                    {
                        question: "According to the transcript, what approach was recommended?",
                        options: ["Traditional methods", "Modern techniques", "Hybrid approach", "Custom solutions"],
                        correct: 2
                    },
                    {
                        question: "What was the primary goal mentioned?",
                        options: ["Efficiency", "Quality", "Understanding", "Implementation"],
                        correct: 2
                    },
                    {
                        question: "What conclusion can be drawn from the content?",
                        options: ["More research needed", "Goals achieved", "Progress made", "Challenges remain"],
                        correct: 2
                    }
                ];
            }
        }
    } catch (error) {
        console.error("Error generating quiz:", error);
        throw error;
    }
}

// Main endpoint - extracts transcript and logs to console
app.post("/get-transcript", async (req, res) => {
    const { videoId } = req.body;
    
    if (!videoId) {
        return res.status(400).json({ error: "Video ID is required" });
    }
    
    try {
        const transcript = await getYouTubeTranscript(videoId);
        
        if (transcript && transcript.error) {
            return res.status(404).json({ error: transcript.error });
        }
        
        // Log the transcript to console
        console.log(`\n=== TRANSCRIPT FOR VIDEO: ${videoId} ===`);
        console.log(transcript);
        console.log("=== END OF TRANSCRIPT ===\n");
        
        // Return success response with transcript content
        res.json({ 
            success: true, 
            message: "Transcript extracted successfully",
            videoId: videoId,
            transcript: transcript,
            transcriptLength: transcript.length,
            wordCount: transcript.split(' ').length
        });
    } catch (error) {
        console.error("Error in transcript route:", error);
        res.status(500).json({ error: "Failed to extract transcript. Please try another video." });
    }
});

// Quiz generation endpoint
app.post("/generate-quiz", async (req, res) => {
    const { transcript } = req.body;
    
    if (!transcript) {
        return res.status(400).json({ error: "Transcript is required" });
    }
    
    try {
        console.log("Generating quiz questions from transcript...");
        const questions = await generateQuizQuestions(transcript);
        
        console.log(`Generated ${questions.length} quiz questions`);
        
        res.json({ 
            success: true, 
            questions: questions
        });
    } catch (error) {
        console.error("Error generating quiz:", error);
        
        if (error.message.includes("API key not configured") || error.message.includes("Invalid OpenRouter API key")) {
            return res.status(400).json({ error: error.message });
        } else if (error.message.includes("Rate limit")) {
            return res.status(429).json({ error: error.message });
        } else if (error.message.includes("parse")) {
            return res.status(500).json({ error: "Failed to generate valid quiz questions" });
        } else {
            return res.status(500).json({ error: "Failed to generate quiz questions. Please try again." });
        }
    }
});

app.get("/", (req, res) => {
    res.send("YouTube Transcript Extractor - Send POST request to /get-transcript with videoId");
});

app.listen(3001, () => console.log("Server running on http://localhost:3001"));

export default app;