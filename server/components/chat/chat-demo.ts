export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Array<string>;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: Array<ChatMessage>;
}

export type ResponseStyle = "balanced" | "concise" | "creative";

export const suggestions = [
  {
    icon: "spark",
    title: "Find a fresh angle",
    description: "Turn a small idea into something good",
    prompt: "Help me find a fresh angle for my next Instagram story.",
  },
  {
    icon: "edit",
    title: "Make the words flow",
    description: "A caption that sounds more like you",
    prompt: "Help me write a natural, engaging caption for an everyday moment.",
  },
  {
    icon: "lightbulb",
    title: "Get a little inspired",
    description: "Break out of the same old ideas",
    prompt: "Give me a few unexpected ideas for stories this week.",
  },
  {
    icon: "globe",
    title: "See the bigger picture",
    description: "Step back and explore a new perspective",
    prompt: "Help me think about what makes a meaningful social media presence.",
  },
] as const;

export function createDemoReply(prompt: string, style: ResponseStyle, attachments: Array<string>) {
  const normalized = prompt.toLowerCase();
  let content: string;
  if (/caption|words|write/u.test(normalized)) {
    content =
      "The best captions usually start with something real. Here are a few directions to play with:\n\n• A little observation: “Nothing special. Just one of those moments I wanted to keep.”\n• A conversation starter: “What’s one small thing that made your day better?”\n• Short and sweet: “More of this, please.”\n\nPick the one that feels most like you, then add a detail only you would notice.";
  } else if (/idea|inspir|creative|story|stories|angle/u.test(normalized)) {
    content =
      "Let’s start with the ordinary and make it interesting. Here are three ideas you could make your own:\n\n• The in-between moment. Share something that happened just before or after the photo you’d normally post.\n• One thing, three ways. Show a familiar place, routine, or object from three unexpected angles.\n• A tiny recommendation. Share one thing you enjoyed this week, and tell people why it stayed with you.\n\nYou don’t need a big production. A specific detail and your own point of view are a great place to start.";
  } else if (/presence|perspective|meaning|picture/u.test(normalized)) {
    content =
      "A meaningful presence starts with a simple question: what do you want people to feel when they spend a moment in your world?\n\n• Choose a few things you actually care about. Curiosity is easier to sustain than a content formula.\n• Leave room for ordinary moments. They’re often the ones people relate to most.\n• Think in conversations. A good question can be more memorable than a perfect image.\n\nTry finishing this sentence: “I want this space to feel like…” That can become your compass.";
  } else {
    content =
      "Here’s a starting point for exploring that idea:\n\n• Name the goal. What would a useful outcome look like for you?\n• Find the interesting detail. Start with something specific, personal, or unexpected.\n• Make one small draft. Give yourself something to react to before trying to perfect it.\n\nThis is a scripted preview of the chat experience. A connected assistant will be able to respond to your specific question and build on our conversation.";
  }
  if (style === "concise") {
    content =
      "A simple starting point:\n\n• Choose one specific, everyday detail.\n• Add your own perspective.\n• End with a question people can relate to.\n\nKeep it personal, and keep it simple.";
  } else if (style === "creative") {
    content = `A small creative experiment: imagine this idea as a postcard to a friend. What would you show them first?\n\n${content}`;
  }
  if (attachments.length > 0) {
    content +=
      "\n\nYour attachments are shown locally in this preview. Their contents haven’t been uploaded or analyzed.";
  }
  return content;
}

export const initialThreads: Array<ChatThread> = [
  {
    id: "fresh-perspective",
    title: "A fresh perspective on my feed",
    messages: [
      {
        id: "seed-1",
        role: "user",
        content: "Help me think about what makes a meaningful social media presence.",
      },
      {
        id: "seed-2",
        role: "assistant",
        content: createDemoReply("meaningful presence", "balanced", []),
      },
    ],
  },
  {
    id: "story-ideas",
    title: "Ideas for next week’s stories",
    messages: [
      {
        id: "seed-3",
        role: "user",
        content: "Give me a few unexpected ideas for stories this week.",
      },
      { id: "seed-4", role: "assistant", content: createDemoReply("story ideas", "creative", []) },
    ],
  },
  {
    id: "creative-rhythm",
    title: "Finding my creative rhythm",
    messages: [
      { id: "seed-5", role: "user", content: "How do I find a creative rhythm?" },
      {
        id: "seed-6",
        role: "assistant",
        content: createDemoReply("creative ideas", "concise", []),
      },
    ],
  },
];
