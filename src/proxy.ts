import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * next-intl's locale negotiation, in front of every matched request. The file
 * is `proxy.ts` rather than the deprecated `middleware.ts`: Next.js 16 renamed
 * the convention, and new code uses the current name.
 */
export const proxy = createMiddleware(routing);

export const config = {
	// Skip API routes, Next.js internals, Vercel internals, and any path with
	// a file extension (static assets).
	matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
