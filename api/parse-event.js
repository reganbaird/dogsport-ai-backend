export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { text } = req.body ?? {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Return ONLY valid JSON for ONE AIEventProposal with keys: " +
              "eventName (string), sport (string), startDate (string|null ISO-8601), endDate (string|null ISO-8601), " +
              "registrationLink (string|null), deadlines (array of {type,date,notes}), attachment ({title,url}).",
          },
          { role: "user", content: text },
        ],
      }),
    });

    const data = await r.json();

    // Pull the model's text output safely from `output`
    const message = data.output?.find((o) => o.type === "message");
    const contentText = message?.content?.find((c) => c.type === "output_text")?.text;

    if (!r.ok) {
      return res.status(500).json({
        error: "OpenAI failed",
        detail: contentText ?? JSON.stringify(data),
      });
    }

    if (!contentText) {
      return res.status(500).json({
        error: "OpenAI returned no output_text",
        detail: JSON.stringify(data),
      });
    }

    // contentText should be pure JSON per system prompt
    const proposal = JSON.parse(contentText);
    return res.status(200).json(proposal);
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}
