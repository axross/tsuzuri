import { Separator } from "@base-ui-components/react/separator";
import clsx from "clsx";
import { getTranslations } from "next-intl/server";
import { ThemePreferenceControl } from "@/shared/ui/theme-preference-control";
import styles from "./page.module.css";

export default async function HomePage() {
	const t = await getTranslations("HomePage");
	const stack = [
		t("stack.framework"),
		t("stack.locale"),
		t("stack.theme"),
	] as const;

	return (
		<main className={styles.main} data-testid="page">
			<section className={styles.card} data-testid="card">
				<h1 className={styles.title}>{t("title")}</h1>
				<p className={styles.description}>{t("description")}</p>

				<Separator className={styles.separator} />

				<h2 className={styles.stackHeading}>{t("stackHeading")}</h2>
				<ul className={styles.stackList} data-testid="stack-list">
					{stack.map((item, index) => (
						<li
							key={item}
							className={clsx(
								styles.stackItem,
								index === 0 && styles.stackItemPrimary,
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
