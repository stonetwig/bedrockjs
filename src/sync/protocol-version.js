/**
 * Sync wire protocol version.
 *
 * Kept in its own tiny .js module so the browser entry never reaches into
 * `./protocol.ts` (which is server/Deno-only). The server-side `.ts`
 * mirror of this constant lives in `./protocol.ts`.
 */
export const PROTOCOL_VERSION = 1;
