import 'server-only';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '23.8');
    const lon = parseFloat(searchParams.get('lon') || '90.4');

    // Open-Meteo — completely free, no API key needed
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code,apparent_temperature` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
      `&timezone=Asia/Dhaka&forecast_days=7`;

    const res  = await fetch(url, { next: { revalidate: 1800 } }); // cache 30 min
    const data = await res.json();

    // Get location name via Nominatim
    let locationName = 'আপনার এলাকা';
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        { headers: { 'User-Agent': 'AgroBot/1.0 agro.com.bd' } }
      );
      const geo = await geoRes.json();
      const addr = geo.address || {};
      locationName = addr.county || addr.state_district || addr.city || addr.town || 'আপনার এলাকা';
    } catch (_) {}

    // Get farming advice from Gemini based on weather
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;
    const weatherSummary = `Temperature: ${data.current.temperature_2m}°C, Humidity: ${data.current.relative_humidity_2m}%, Rain today: ${data.current.precipitation}mm, Wind: ${data.current.wind_speed_10m}km/h. 7-day rain forecast: ${data.daily.precipitation_sum.join(', ')}mm`;

    let farmingAdvice = '';
    try {
      const aiRes = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Based on this Bangladesh weather: ${weatherSummary}. Give 3 short practical farming tips in Bengali (2 sentences each). Return as JSON array: ["tip1","tip2","tip3"]` }] }],
          generationConfig: { maxOutputTokens: 300, responseMimeType: 'application/json' }
        })
      });
      const aiData = await aiRes.json();
      const raw = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const tips = JSON.parse(raw.replace(/```json|```/gi,'').trim());
      farmingAdvice = Array.isArray(tips) ? tips : [];
    } catch (_) { farmingAdvice = []; }

    return Response.json({
      location: locationName,
      current: {
        temp:      data.current.temperature_2m,
        feelsLike: data.current.apparent_temperature,
        humidity:  data.current.relative_humidity_2m,
        rain:      data.current.precipitation,
        wind:      data.current.wind_speed_10m,
        code:      data.current.weather_code,
      },
      daily: data.daily.time.map((date, i) => ({
        date,
        maxTemp:   data.daily.temperature_2m_max[i],
        minTemp:   data.daily.temperature_2m_min[i],
        rain:      data.daily.precipitation_sum[i],
        rainChance:data.daily.precipitation_probability_max[i],
        code:      data.daily.weather_code[i],
      })),
      farmingAdvice,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
