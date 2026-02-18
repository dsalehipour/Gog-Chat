import { NextResponse } from "next/server";
import { runGogCommand, getDefaultAccount } from "@/lib/gog";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json();
  const { apiKey, model } = body as { apiKey: string; model: string };

  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 400 });
  }

  const account = await getDefaultAccount();

  const [emailsResult, calendarResult] = await Promise.allSettled([
    runGogCommand(
      ["gmail", "search", "is:unread newer_than:5d", "--max", "30", "--json"],
      account,
    ),
    runGogCommand(["calendar", "events", "--max", "10", "--json"], account),
  ]);

  const gather = (r: PromiseSettledResult<{ success: boolean; stdout: string }>) => {
    if (r.status === "fulfilled" && r.value.success) return r.value.stdout;
    return "[]";
  };

  const prompt = `Analyze these recent emails and calendar events. Identify items that truly need follow-up from the user.

You MUST use your own judgment to classify each email. Only include follow-ups for:
- Real person-to-person conversations (sales, partnerships, colleagues, clients)
- Emails with direct questions or requests aimed at the user
- Important meeting action items with real people
- Deadlines from real humans

You MUST exclude ALL of the following, no matter what:
- Automated emails from services, apps, or platforms (e.g. from noreply@, notifications@, any service domain)
- Calendar invite responses (Accepted, Declined, Tentative, RSVP, Updated invitation)
- Newsletters, marketing emails, promotional content
- Security alerts, login notifications, password resets
- E-signature requests (DocuSign, Adobe Sign, etc.)
- Shipping/order/receipt notifications
- Social media notifications
- Generic FYI or informational emails that don't require a response

Recent unread emails (analyze each one carefully before deciding):
${gather(emailsResult)}

Upcoming calendar events:
${gather(calendarResult)}

Return ONLY a JSON array of follow-up items (no other text). Each item should have:
- "title": the email subject line or a short actionable description
- "source": "email" or "calendar"
- "contactName": the name of the real person on the other end
- "contactEmail": their email address
- "company": company name (extract from email domain, e.g., john@acme.com -> Acme)
- "lastAction": brief description of the last thing that happened in the thread
- "dueDate": ISO date string if a deadline is mentioned, or null
- "notes": brief context about why this needs follow-up

If no important follow-ups are found, return an empty array [].`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: model || "claude-opus-4-6",
      max_tokens: 2048,
      system:
        "You are a productivity assistant focused on important, actionable follow-ups with real people. You are extremely selective -- when in doubt, leave it out. Respond with ONLY valid JSON, no markdown fences or other text.",
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "[]";

    let suggestions;
    try {
      suggestions = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      suggestions = match ? JSON.parse(match[0]) : [];
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
