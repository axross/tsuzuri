import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import "@/shared/styles/layers.css";
import "@/shared/styles/theme.css";
import "@/shared/styles/global.css";

export const metadata: Metadata = {
	title: "tsuzuri",
};

type RootLayoutProps = {
	children: ReactNode;
};

/**
 * There is no locale segment to read a `params` promise from: this project
 * ships one locale and negotiates none, so `getLocale` — next-intl's server
 * API — resolves the active locale from `src/i18n/request.ts` directly.
 * `NextIntlClientProvider` needs no explicit `locale` or `messages` prop
 * either, for the same reason: rendered from a Server Component, it reads
 * both from that same request configuration.
 */
export default async function RootLayout({ children }: RootLayoutProps) {
	const locale = await getLocale();

	return (
		<html lang={locale}>
			<body>
				<NextIntlClientProvider>{children}</NextIntlClientProvider>
			</body>
		</html>
	);
}
