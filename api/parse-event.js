export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { text } = req.body ?? {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    // Ask OpenAI for STRICT JSON that matches your AIEventProposal model
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
              "Extract ONE event proposal from the user's text and output ONLY valid JSON with keys: " +
              "eventName (string), sport (string), startDate (string|null ISO-8601), endDate (string|null ISO-8601), " +
              "registrationLink (string|null), deadlines (array), attachment (object with title,url). " +
              "deadlines items must be objects with keys: type (string), date (string|null), notes (string|null). " +
              "attachment must be {title: string, url: string}.",
          },
          { role: "user", content: text },
        ],
        // Structured Outputs (schema enforcement)
        text: {
          format: {
            type: "json_schema",
            name: "AIEventProposal",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                eventName: { type: "string" },
                sport: { type: "string" },
                startDate: { type: ["string", "null"] },
                endDate: { type: ["string", "null"] },
                registrationLink: { type: ["string", "null"] },
                deadlines: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      type: { type: "string" },
                      date: { type: ["string", "null"] },
                      notes: { type: ["string", "null"] },
                    },
                    required: ["type", "date", "notes"],
                  },
                },
                attachment: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                  },
                  required: ["title", "url"],
                },
              },
              required: [
                "eventName",
                "sport",
                "startDate",
                "endDate",
                "registrationLink",
                "deadlines",
                "attachment",
              ],
            },
          },
        },
      }),
    });

    if (!r.ok) return res.status(500).json({ error: "OpenAI failed", detail: await r.text() });

    const data = await r.json();

    // Most responses put the final text in `output_text`
    const jsonText = data.output_text;
    const proposal = JSON.parse(jsonText);

    return res.status(200).json(proposal);
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}
