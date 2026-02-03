import { Annotation } from "@langchain/langgraph";

export const VidScribeState = Annotation.Root({
    /**
     * The input URL provided by the user (X/Twitter or public video URL)
     */
    url: Annotation<string>(),

    /**
     * Path to the downloaded audio file
     */
    audioPath: Annotation<string>(),

    /**
     * Duration of the audio in seconds
     */
    duration: Annotation<number>(),

    /**
     * The full transcription text
     */
    transcription: Annotation<string>(),

    /**
     * The generated summary
     */
    summary: Annotation<string>(),

    /**
     * Creative content ideas derived from the transcription
     */
    contentIdeas: Annotation<string[]>(),

    /**
     * Status or error messages
     */
    status: Annotation<string>(),
});

export type VidScribeStateType = typeof VidScribeState.State;
