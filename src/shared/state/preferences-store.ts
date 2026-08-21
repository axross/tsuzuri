import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * One example client-state store, demonstrating the Zustand pattern the rest
 * of the app follows: no product state here, only an app-shell preference.
 */
export type ThemePreference = "system" | "light" | "dark";

type PreferencesState = {
	theme: ThemePreference;
	setTheme: (theme: ThemePreference) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
	persist(
		(set) => ({
			theme: "system",
			setTheme: (theme) => set({ theme }),
		}),
		{ name: "tsuzuri.preferences" },
	),
);
