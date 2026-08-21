import createMiddleware from "next-intl/middleware";
import { routing } from "./src/i18n/routing";

export default createMiddleware(routing);

export const config = {
	// Skip API routes, Next.js internals, Vercel internals, and any path with
	// a file extension (static assets).
	matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
