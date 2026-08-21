import { Separator } from "@base-ui-components/react/separator";
import clsx from "clsx";
import { getTranslations } from "next-intl/server";
import { ThemePreferenceControl } from "@/shared/ui/theme-preference-control";
import css from "./page.module.css";

export default async function HomePage() {
	const t = await getTranslations("HomePage");
	const stack = [
		t("stack.framework"),
		t("stack.locale"),
		t("stack.theme"),
	] as const;

	return (
		<main className={css.main} data-testid="page">
			<section className={css.card} data-testid="card">
				<h1 className={css.title}>{t("title")}</h1>
				<p className={css.description}>{t("description")}</p>

				<Separator className={css.separator} />

				<h2 className={css.stackHeading}>{t("stackHeading")}</h2>
				<ul className={css.stackList} data-testid="stack-list">
					{stack.map((item, index) => (
						<li
							key={item}
							className={clsx(
								css.stackItem,
								index === 0 && css.stackItemPrimary,
							)}
						>
							{item}
						</li>
					))}
				</ul>

				<ThemePreferenceControl
					label={t("themePreference.label")}
					optionLabels={{
						system: t("themePreference.system"),
						light: t("themePreference.light"),
						dark: t("themePreference.dark"),
					}}
				/>
			</section>
		</main>
	);
}
