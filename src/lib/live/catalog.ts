/**
 * The default lists behind the live pages: the GitHub topics Nexverse follows, and the projects whose
 * releases it tracks. Plain data, safe to import from client components. Admins edit all three in
 * /admin/lists; server code reads the live version with getGhTopics(), getMoreGhTopics() and
 * getReleaseRepos() from lib/lists/server.ts, which fall back to these.
 */

/** The topics Nexverse follows on GitHub, in the order they are shown. */
export const GH_TOPICS = [
  { id: "llm", label: "LLMs", blurb: "Large language models: training, serving, fine-tuning and the apps built on them." },
  { id: "ai-agents", label: "AI agents", blurb: "Frameworks and tools for agents that plan, call tools and act on their own." },
  { id: "rag", label: "RAG", blurb: "Retrieval-augmented generation: search, embeddings and grounding answers in your data." },
  { id: "diffusion", label: "Diffusion", blurb: "Image, video and audio generation with diffusion models." },
  { id: "machine-learning", label: "Machine learning", blurb: "Libraries, courses and research code across machine learning." },
] as const

/** More topics worth browsing, linked from the topic pages. */
export const MORE_GH_TOPICS = [
  "deep-learning",
  "computer-vision",
  "nlp",
  "generative-ai",
  "mcp",
  "vector-database",
  "inference",
  "fine-tuning",
  "multimodal",
  "reinforcement-learning",
  "speech-recognition",
  "mlops",
] as const

export const topicInfo = (id: string) => GH_TOPICS.find((t) => t.id === id)

/** Popular open-source AI projects whose releases appear on /trending. */
export const RELEASE_REPOS = [
  ["ollama", "ollama"],
  ["vllm-project", "vllm"],
  ["ggml-org", "llama.cpp"],
  ["sgl-project", "sglang"],
  ["pytorch", "pytorch"],
  ["langchain-ai", "langgraph"],
  ["run-llama", "llama_index"],
  ["open-webui", "open-webui"],
  ["comfyanonymous", "ComfyUI"],
  ["unslothai", "unsloth"],
] as const
