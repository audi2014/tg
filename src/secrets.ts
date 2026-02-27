export const TG_API_ID = Number(process.env.TG_API_ID || 0);
export const TG_API_HASH = process.env.TG_API_HASH || '';
export const TG_INVITE_HASH = process.env.TG_INVITE_HASH || '';
export const TG_SESSION = process.env.TG_SESSION || '';
export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

if (!TG_API_ID || !TG_API_HASH || !TG_INVITE_HASH || !TG_SESSION || !GOOGLE_API_KEY) {
    console.log(process.env)
    throw new Error('Missing required environment variables')
}
