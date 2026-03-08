import logger from "../utils/logger.js";
import { PodcastSegment } from "./NewsDigestService.js";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";

// Set ffmpeg path from the bundled installer
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Voice configuration
const VOICE_MAP: Record<string, { name: string; ssmlGender: "MALE" | "FEMALE" }> = {
    ALEX: { name: "en-US-Journey-D", ssmlGender: "MALE" },
    SAM: { name: "en-US-Journey-F", ssmlGender: "FEMALE" },
};

// Fallback voices if Journey voices are not available
const FALLBACK_VOICE_MAP: Record<string, { name: string; ssmlGender: "MALE" | "FEMALE" }> = {
    ALEX: { name: "en-US-Neural2-D", ssmlGender: "MALE" },
    SAM: { name: "en-US-Neural2-F", ssmlGender: "FEMALE" },
};

const SPEAKING_RATE = parseFloat(process.env.NEWS_TTS_SPEAKING_RATE || "1.05");
const MIN_AUDIO_DURATION_SECONDS = 90; // Never send audio shorter than 90s

export class AudioService {
    private ttsClient: TextToSpeechClient | null = null;
    private useFallbackVoices = false;

    constructor() {
        try {
            this.ttsClient = new TextToSpeechClient();
            logger.info("AudioService initialized with Google Cloud TTS");
        } catch (error) {
            logger.warn("Failed to initialize Google Cloud TTS client. Audio features will be disabled.", {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Returns true if the TTS client is available
     */
    isAvailable(): boolean {
        return this.ttsClient !== null;
    }

    /**
     * Full pipeline: synthesize all segments → merge into single .ogg → return file path
     * Returns null if any step fails or audio is too short.
     */
    async generatePodcastAudio(segments: PodcastSegment[]): Promise<string | null> {
        if (!this.ttsClient) {
            logger.warn("TTS client not available. Skipping audio generation.");
            return null;
        }

        if (segments.length === 0) {
            logger.warn("No segments to synthesize. Skipping audio generation.");
            return null;
        }

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "podcast-"));
        const segmentPaths: string[] = [];

        try {
            // 1. Synthesize each segment
            logger.info(`Synthesizing ${segments.length} podcast segments...`);
            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];
                const segmentPath = path.join(tempDir, `segment_${String(i).padStart(3, "0")}.ogg`);

                const success = await this.synthesizeSegment(segment, segmentPath);
                if (!success) {
                    logger.error(`Failed to synthesize segment ${i} (${segment.speaker}). Aborting audio generation.`);
                    this.cleanup(segmentPaths, tempDir);
                    return null;
                }
                segmentPaths.push(segmentPath);
            }

            // 2. Merge all segments
            const outputPath = path.join(tempDir, "daily_news.ogg");
            logger.info(`Merging ${segmentPaths.length} segments into ${outputPath}...`);
            await this.mergeSegments(segmentPaths, outputPath);

            // 3. Validate duration
            const duration = await this.getAudioDuration(outputPath);
            if (duration !== null && duration < MIN_AUDIO_DURATION_SECONDS) {
                logger.warn(`Audio duration (${duration.toFixed(1)}s) is below minimum (${MIN_AUDIO_DURATION_SECONDS}s). Skipping.`);
                this.cleanup(segmentPaths, tempDir);
                return null;
            }

            logger.info(`Podcast audio generated successfully: ${duration?.toFixed(1)}s`);

            // Clean up individual segments but keep the merged file
            for (const sp of segmentPaths) {
                try { fs.unlinkSync(sp); } catch { /* ignore */ }
            }

            return outputPath;
        } catch (error) {
            logger.error("Failed to generate podcast audio:", {
                error: error instanceof Error ? error.message : String(error)
            });
            this.cleanup(segmentPaths, tempDir);
            return null;
        }
    }

    /**
     * Synthesizes a single segment using Google Cloud TTS
     */
    private async synthesizeSegment(segment: PodcastSegment, outputPath: string): Promise<boolean> {
        if (!this.ttsClient) return false;

        const voiceMap = this.useFallbackVoices ? FALLBACK_VOICE_MAP : VOICE_MAP;
        const voiceConfig = voiceMap[segment.speaker] || voiceMap["ALEX"];

        try {
            const [response] = await this.ttsClient.synthesizeSpeech({
                input: { text: segment.text },
                voice: {
                    languageCode: "en-US",
                    name: voiceConfig.name,
                    ssmlGender: voiceConfig.ssmlGender as any,
                },
                audioConfig: {
                    audioEncoding: "OGG_OPUS" as any,
                    speakingRate: SPEAKING_RATE,
                },
            });

            if (response.audioContent) {
                const audioBuffer = response.audioContent instanceof Uint8Array
                    ? Buffer.from(response.audioContent)
                    : Buffer.from(response.audioContent as string, "base64");
                fs.writeFileSync(outputPath, audioBuffer);
                return true;
            }

            return false;
        } catch (error: any) {
            // If Journey voices are not available, try fallback
            if (!this.useFallbackVoices && error?.code === 5) { // NOT_FOUND
                logger.warn(`Journey voice "${voiceConfig.name}" not found. Switching to Neural2 fallback.`);
                this.useFallbackVoices = true;
                return this.synthesizeSegment(segment, outputPath);
            }

            logger.error(`TTS synthesis failed for ${segment.speaker}:`, {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Merges multiple OGG segment files into a single OGG file using ffmpeg
     */
    private mergeSegments(segmentPaths: string[], outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Create a file list for ffmpeg concat demuxer
            const listPath = path.join(path.dirname(outputPath), "filelist.txt");
            const fileListContent = segmentPaths
                .map(p => `file '${p.replace(/\\/g, "/")}'`)
                .join("\n");
            fs.writeFileSync(listPath, fileListContent);

            ffmpeg()
                .input(listPath)
                .inputOptions(["-f", "concat", "-safe", "0"])
                .outputOptions(["-c", "copy"])
                .output(outputPath)
                .on("end", () => {
                    // Clean up the file list
                    try { fs.unlinkSync(listPath); } catch { /* ignore */ }
                    resolve();
                })
                .on("error", (err) => {
                    try { fs.unlinkSync(listPath); } catch { /* ignore */ }
                    reject(err);
                })
                .run();
        });
    }

    /**
     * Gets the duration of an audio file in seconds using ffprobe
     */
    private getAudioDuration(filePath: string): Promise<number | null> {
        return new Promise((resolve) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    logger.debug(`Could not determine audio duration: ${err.message}`);
                    resolve(null);
                } else {
                    resolve(metadata.format.duration || null);
                }
            });
        });
    }

    /**
     * Cleans up temp files and directory
     */
    cleanup(paths: string[], tempDir?: string): void {
        for (const p of paths) {
            try { fs.unlinkSync(p); } catch { /* ignore */ }
        }
        if (tempDir) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    }

    /**
     * Cleans up a single file (used after sending audio)
     */
    cleanupFile(filePath: string): void {
        try {
            fs.unlinkSync(filePath);
            // Also try to clean up the parent temp directory
            const dir = path.dirname(filePath);
            if (dir.includes("podcast-")) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        } catch { /* ignore */ }
    }
}

export const audioService = new AudioService();
