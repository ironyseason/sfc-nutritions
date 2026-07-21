exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { type, imageBase64, deficit, activityLevel, location, timeOfDay } = body;

  try {
    // ── Mode 1: Food photo recognition (GPT-4o Vision) ──
    if (type === "food") {
      if (!imageBase64) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "No image provided" }) };
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
                },
                {
                  type: "text",
                  text: `You are a nutrition assistant for SFC (Shonan Fujisawa Campus) students in Japan. 
Look at this food photo and identify what it is. This is likely from Lawson convenience store, SFC Coop Cafeteria, Salt Dining cafeteria, or Subway on campus.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "name": "food name in English",
  "nameJa": "食べ物の名前",
  "kcal": estimated calories as a number,
  "location": "Lawson or Coop Cafeteria or Salt Dining or Subway or Other",
  "confidence": "high or medium or low"
}`
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "{}";

      let result;
      try {
        result = JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch {
        result = { name: "Unknown food", nameJa: "不明", kcal: 300, location: "Other", confidence: "low" };
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── Mode 2: Meal recommendation (ChatGPT) ──
    if (type === "recommend") {
      const prompt = `You are a nutrition assistant for SFC (Shonan Fujisawa Campus) students in Japan.

Student's current situation:
- Calorie deficit: ${deficit} kcal (negative means they need to eat more)
- Activity level today: ${activityLevel}
- Current location: ${location}
- Time of day: ${timeOfDay}

Campus food options:
- Lawson (convenience store): onigiri ~190kcal, sandwiches ~300kcal, bento ~500kcal
- Coop Cafeteria: lunch set ~600kcal, curry rice ~650kcal, udon ~400kcal
- Salt Dining: various sets ~600-800kcal, healthier options available
- Subway: 6-inch sub ~340kcal, footlong ~680kcal

Give a short, friendly meal recommendation in English. Be specific about what to eat and where. Keep it under 2 sentences.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 150,
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await response.json();
      const recommendation = data.choices?.[0]?.message?.content || "Try the Coop Cafeteria lunch set for a balanced meal.";

      return { statusCode: 200, headers, body: JSON.stringify({ recommendation }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid type. Use 'food' or 'recommend'" }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
