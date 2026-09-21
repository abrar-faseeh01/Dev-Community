// NEXT_PUBLIC_* vars are inlined at build time only when read as a literal
// `process.env.NEXT_PUBLIC_X`, so this must stay a direct property access.
export const API_URL = process.env.NEXT_PUBLIC_API_URL;
