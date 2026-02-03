import { StateGraph, START, END } from "@langchain/langgraph";
import { VidScribeState } from "./state.js";
import { downloadNode, transcribeNode, summarizeNode } from "./nodes.js";

// Create the graph
const workflow = new StateGraph(VidScribeState)
    .addNode("download", downloadNode)
    .addNode("transcribe", transcribeNode)
    .addNode("summarize", summarizeNode)
    .addEdge(START, "download")
    .addEdge("download", "transcribe")
    .addEdge("transcribe", "summarize")
    .addEdge("summarize", END);

// Compile the graph
export const app = workflow.compile();
