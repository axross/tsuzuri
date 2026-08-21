"use client";

import { useEffect } from "react";
import {
	type ThemePreference,
	usePreferencesStore,
} from "@/shared/state/preferences-store";
import styles from "./theme-preference-control.module.css";

const ORDER: readonly ThemePreference[] = ["system", "light", "dark"];

type ThemePreferenceControlProps = {
	label: string;
	optionLabels: Record<ThemePreference, string>;
};

/**
 * Reads and cycles the stored theme preference, and mirrors it onto the
 * document so the theme layer can act on it.
 *
 * This is the placeholder route's proof that the Zustand store is live rather
 * than merely defined: the value it renders comes from the store, the button
 * dispatches through the store's action, and `persist` keeps the choice across
 * reloads.
 */
export function ThemePreferenceControl({
	label,
	optionLabels,
}: ThemePreferenceControlProps) {
	const theme = usePreferencesStore((state) => state.theme);
	const setTheme = usePreferencesStore((state) => state.setTheme);

	useEffect(() => {
		const root = document.documentElement;

		if (theme === "system") {
			root.removeAttribute("data-theme");
		} else {
			root.setAttribute("data-theme", theme);
		}
	}, [theme]);

	return (
		<div className={styles.control}>
			<span className={styles.label}>{label}</span>
			<button
				className={styles.button}
				data-testid="theme-preference"
				onClick={() =>
					setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length])
				}
				type="button"
			>
				{optionLabels[theme]}
			</button>
		</div>
	);
}
