import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/");
});

test("Visitor loads the placeholder route, sees the wired-up stack, and cycles the persisted theme preference", {
	tag: [
		"@scenario:home.toolchain-proof",
		"@area:home",
		"@priority:must",
		"@smoke",
	],
}, async ({ page }) => {
	const card = page.getByTestId("card");

	await test.step("Verify the title and description render through next-intl", async () => {
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("tsuzuri");
		await expect(card).toContainText("GitHub repository");
	});

	await test.step("Verify the wired-up stack list and the live Base UI separator", async () => {
		const stackList = page.getByTestId("stack-list");

		await expect(stackList.getByRole("listitem")).toHaveCount(3);
		await expect(card.getByRole("separator")).toBeVisible();
	});

	await test.step("Verify the scoped component styles actually apply", async () => {
		// `@scope` has no fallback: a browser that does not understand it drops
		// the whole block, and every rule inside goes with it. Asserting text
		// alone would still pass against a completely unstyled page, so this
		// checks a computed value that can only come from the token layer
		// reaching through the cascade-layer skeleton.
		await expect(page.getByTestId("page")).toHaveCSS("padding", "32px");
		await expect(page.getByTestId("card")).toHaveCSS("border-radius", "12px");
	});

	await test.step("Verify the Zustand-backed theme preference cycles and reaches the document", async () => {
		const preference = page.getByTestId("theme-preference");

		await expect(preference).toHaveText("System");
		await expect(page.locator("html")).not.toHaveAttribute("data-theme");

		await preference.click();

		await expect(preference).toHaveText("Light");
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
	});
});
