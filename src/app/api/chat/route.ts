import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const { messages, context, role } = (await request.json()) as {
      messages: ChatMessage[];
      context?: {
        siteName?: string;
        zones?: string[];
        categories?: string[];
        activeIssues?: unknown[];
      };
      role?: "worker" | "admin";
    };

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it";

    if (!apiKey) {
      return NextResponse.json({
        reply:
          role === "admin"
            ? "Safety AI Assistant online. Please set OPENROUTER_API_KEY in your environment to enable real-time OpenRouter Gemma 4 31B analysis."
            : "Worker Safety Voice Assistant ready. Please set OPENROUTER_API_KEY to activate voice intelligence.",
      });
    }

    let systemPrompt = "";
    if (role === "admin") {
      systemPrompt = `You are FairShift Admin Voice Assistant for site safety directors.
You assist the administrator with triaging workplace hazards, reviewing audit logs, understanding SLA breach clocks, and verifying independent oversight sign-offs.
Keep responses concise, clear, and professional (under 3 sentences so it sounds natural when read aloud).
Context: ${JSON.stringify(context ?? {})}`;
    } else {
      systemPrompt = `You are FairShift Worker Safety Voice Assistant.
You guide verified workers on job sites (construction and hospital) to report safety hazards anonymously without fear.
Your goal is to help them identify:
1. Category: ELECTRICAL, FIRE, STRUCTURAL, CHEMICAL, MACHINERY, SANITATION, HARASSMENT, or OTHER.
2. Zone: Where on site it happened (e.g. Scaffolding, Basement, ICU, Ward, Electrical Room, etc.).
3. Description: What they saw in plain language.
Keep responses short, warm, and clear (1-2 sentences) so it speaks easily over browser voice synthesis.
Context: Site: ${context?.siteName ?? "General Site"}, Available Zones: ${(context?.zones ?? []).join(", ") || "General"}.`;
    }

    const fullMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(messages || []),
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://fairshift.local",
        "X-Title": "FairShift Voice Assistant",
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        temperature: 0.3,
        max_tokens: 350,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenRouter error:", response.status, errText);
      // Fallback response for resilience
      return NextResponse.json({
        content:
          role === "admin"
            ? "Desk assistant ready. You can ask to filter critical issues or check SLA breach countdowns."
            : "I am listening. Please describe what hazard you saw and where on site it happened.",
      });
    }

    const data = await response.json();
    const assistantContent =
      data.choices?.[0]?.message?.content ||
      "Understood. Please provide details on the hazard.";

    return NextResponse.json({ content: assistantContent });
  } catch (error) {
    console.error("Chat route failure:", error);
    return NextResponse.json(
      { content: "Voice service temporarily paused. Please speak again or type directly." },
      { status: 500 },
    );
  }
}
