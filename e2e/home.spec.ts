import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/");
});

test("Visitor loads the placeholder route and sees the wired-up stack", {
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
});
