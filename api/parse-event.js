export default async function handler(req, res) {
  // Always return JSON (even on errors)
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).end(JSON.stringify({ error: "POST only" }));
  }

  try {
    const body = req.body ?? {};
    const text = body.text;

    if (!text || typeof text !== "string") {
      return res.status(400).end(JSON.stringify({ error: "Missing text" }));
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).end(JSON.stringify({ error: "Missing OPENAI_API_KEY" }));
    }

    const schema = {
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
              "Return ONLY JSON matching the schema. " +
              "deadlines must be an array (use []). " +
              "attachment must be an object with title and url (use empty strings). " +
              "registrationLink must be null if unknown. " +
              "Dates should be ISO-8601 strings or null."
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
      return res.status(500).end(JSON.stringify({ error: "OpenAI failed", detail: data }));
    }

    // Extract output text safely (works even when output_text is not at top level)
    const message = data.output?.find((o) => o.type === "message");
    const contentText = message?.content?.find((c) => c.type === "output_text")?.text;

    if (!contentText || typeof contentText !== "string") {
      return res.status(500).end(JSON.stringify({ error: "No output_text", detail: data }));
    }

    // Sometimes models still wrap JSON in fences; strip just in case
    let cleaned = contentText.trim();
    cleaned = cleaned.replace(/^```json\s*/i, "");
    cleaned = cleaned.replace(/^```\s*/i, "");
    cleaned = cleaned.replace(/\s*```$/i, "");

    const proposal = JSON.parse(cleaned);
    return res.status(200).end(JSON.stringify(proposal));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ error: "Server error", detail: String(e) }));
  }
}
