export type VolvoAppCreds = {
  clientId: string;
  clientSecret: string;
  vccApiKey: string;
};

export function getPublishedAppCreds(): VolvoAppCreds | null {
  const clientId = process.env.VOLVO_CLIENT_ID;
  const clientSecret = process.env.VOLVO_CLIENT_SECRET;
  const vccApiKey = process.env.VOLVO_VCC_API_KEY;
  if (!clientId || !clientSecret || !vccApiKey) return null;
  return { clientId, clientSecret, vccApiKey };
}
