// Instant alerts for the clinic admin.
// Each channel is optional and switched on by its settings in .env.local, so a new
// channel (email, Slack…) can be added here without touching the rest of the app.

interface AlertChannel {
  name: string;
  send(text: string): Promise<void>;
}

function telegram(): AlertChannel | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  return {
    name: "Telegram",
    async send(text) {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Telegram replied ${response.status}`);
    },
  };
}

function channels(): AlertChannel[] {
  return [telegram()].filter((c): c is AlertChannel => c !== null);
}

export function alertsAreSetUp(): boolean {
  return channels().length > 0;
}

/** Sends the alert on every channel that is set up. Returns true if at least one delivered it. */
export async function sendAlert(text: string): Promise<boolean> {
  let delivered = false;
  for (const channel of channels()) {
    try {
      await channel.send(text);
      delivered = true;
    } catch (error) {
      // Never let a failed alert break the website; the event is still on the dashboard
      console.error(`${channel.name} alert failed:`, error);
    }
  }
  return delivered;
}
