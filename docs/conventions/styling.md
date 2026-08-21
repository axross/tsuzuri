# Styling

Styles here are CSS Modules over a token layer, ordered by cascade layers. The
general practice — what belongs in a global rule, how a token family is shaped,
how a module is structured — is owned by the installed `react-component-styling`
capability. This document states only this project's own answers, and the one
platform decision that capability requires a project to make for itself.

## The Layer Order Is `variables, base, components`

[`src/shared/styles/layers.css`](../../src/shared/styles/layers.css) declares
that order and nothing else, and the root layout imports it **before** any
stylesheet that populates a layer. Precedence comes from that statement, not
from import order.

Every rule MUST sit in one of the three layers. An unlayered rule outranks every
layered one regardless of specificity, so leaving one out does not produce a
small mistake — it inverts the whole order, and nothing reports it.

- `variables` — the tokens in `theme.css`, and the Radix Colors imports, which
  are pulled in with `layer(variables)` so they land in the layer rather than
  outside every one.
- `base` — the global rules in `global.css`.
- `components` — every CSS Module.

## Component Rules Are Scoped, Global Rules Are Specificity-Free

A CSS Module MUST wrap its rules as `@layer components { @scope (.<root>) {
:where(:scope) { … } } }`, with the scope root declared through
`:where(:scope)` rather than bare `:scope` — the bare form carries specificity,
and a consumer's single class has to be able to win.

A global rule MUST wrap its selector in `:where()` for the same reason. Layer
order already settles globals against components; `:where()` is what keeps them
safe against unlayered third-party CSS and against each other.

A module MUST be imported as `css` — `import css from "./thing.module.css"` —
so a reader recognises a module reference without checking the import.

## Values Come From Tokens

`theme.css` declares the families this project uses: colour, typography as
composite text roles, spacing, radius, and border width. A change MUST take its
values from them rather than inlining a literal, and MUST NOT borrow across
families — a radius is not a spacing step even when the numbers agree today.

Typography roles are applied whole. A component MUST NOT inline a numeric
`font-size`: a size with no role is a missing token, not an exception.

Three literals stay legal because no token would describe them: a ratio, a
multiplier, and a fixed element dimension such as a card's `max-width`.

A new family — duration and easing, once anything animates — gets declared
before its first use, not alongside it.

## The Browser Floor Is `@scope`

`@layer` has been Baseline widely available since March 2022 and costs nothing.
`@scope` reached Baseline newly available in March 2026, and this project
adopted it anyway on 2026-08-21; what that trades away is in
[the decision record](../decisions/2026-08-21-adopt-css-scope-and-accept-its-browser-floor.md).

The consequence a change has to respect: **neither at-rule can be given a
fallback.** A browser that does not understand `@scope` discards the entire
block, so its contents are unreachable — there is no degraded rendering to
write, and a `@supports` guard around it would only duplicate every rule.

So a change MUST NOT introduce a styling technique whose absence degrades worse
than the floor already does, and MUST NOT try to soften the floor with a
partial fallback. Lowering it means removing `@scope` from the skeleton
project-wide and superseding that decision record — not writing an exception
into one module.
