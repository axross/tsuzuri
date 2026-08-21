import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { routing } from "@/i18n/routing";
import "@/shared/styles/theme.css";
import "@/shared/styles/global.css";

export const metadata: Metadata = {
	title: "tsuzuri",
};

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

type LocaleLayoutProps = {
	children: ReactNode;
	params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({
	children,
	params,
}: LocaleLayoutProps) {
	const { locale } = await params;

	if (!hasLocale(routing.locales, locale)) {
		notFound();
	}

	return (
		<html lang={locale}>
			<body>
				<NextIntlClientProvider locale={locale}>
					{children}
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
