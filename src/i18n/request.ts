import { getRequestConfig } from "next-intl/server";

/**
 * The single locale this project serves today. No proxy or middleware file
 * negotiates it from the request — next-intl's documented setup for a
 * project with no i18n routing reads it from here instead. Adding a second
 * locale is a matter of extending this list and adding its message catalog
 * under `messages/`, not of reinstating a proxy.
 */
export const locales = ["en"] as const;

export const defaultLocale: (typeof locales)[number] = "en";

export default getRequestConfig(async () => {
	const locale = defaultLocale;

	return {
		locale,
		messages: (await import(`../../messages/${locale}.json`)).default,
	};
});
