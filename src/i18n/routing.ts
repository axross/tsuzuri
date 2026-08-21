import { defineRouting } from "next-intl/routing";

/**
 * Single-locale routing today; adding a second locale is a matter of
 * extending `locales` and adding its message catalog under `messages/`, not
 * a refactor of the routing or request configuration.
 */
export const routing = defineRouting({
	locales: ["en"],
	defaultLocale: "en",
});
