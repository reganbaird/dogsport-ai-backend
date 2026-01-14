export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { text } = req.body ?? {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        eventName: { type: "string" },
        sport: { type: "string" },
        startDate: { type: ["string", "null"] },         // ISO-8601 preferred
        endDate: { type: ["string", "null"] },           // ISO-8601 preferred
        registrationLink: { type: ["string", "null"] },  // null if unknown
        deadlines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string" },
              date: { type: ["string", "null"] },
              notes: { type: ["string", "null"] }
            },
            required: ["type", "date", "notes"]
          }
        },
        attachment: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            url: { type: "string" }
          },
          required: ["title", "url"]
        }
      },
      required: [
        "eventName",
        "sport",
        "startDate",
        "endDate",
        "registrationLink",
        "deadlines",
        "attachment"
      ]
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Extract ONE event proposal from the user's text. " +
              "Return ONLY JSON that matches the provided schema. " +
              "Rules: deadlines must always be an array (use [] if none). " +
              "attachment must always be an object with title and url (use empty strings if none). " +
              "registrationLink must be null if unknown. " +
              "Dates should be ISO-8601 strings if present, otherwise null."
          },
          { role: "user", content: text }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "AIEventProposal",
            strict: true,
            schema
          }
        }
      })
    });

        const data = await r.json();

    if (!r.ok) {
      return res.status(500).json({ error: "OpenAI failed", detail: JSON.stringify(data) });
    }

    // Structured output text is inside: output -> [message] -> content -> [output_text] -> text
    const message = data.output?.find((o) => o.type === "message");
    const contentText = message?.content?.find((c) => c.type === "output_text")?.text;

    if (!contentText) {
      return res.status(500).json({ error: "No output_text", detail: JSON.stringify(data) });
    }

    return res.status(200).json(JSON.parse(contentText));
