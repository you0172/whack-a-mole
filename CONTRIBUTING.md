# Contributing

Thanks for taking the time to contribute! 🎉

## Ways to help

- 🐛 **Report a bug** — open an issue with steps to reproduce
- 💡 **Suggest a feature** — open an issue describing the player benefit
- 🧪 **Improve tests** — more edge cases are always welcome
- 🎨 **Polish the UI** — animations, responsive edge cases, accessibility
- 📝 **Fix docs** — typos, unclear steps, missing examples

## Development setup

```bash
git clone https://github.com/you0172/whack-a-mole.git
cd whack-a-mole
pnpm install
pnpm dev
```

Requirements: **Node 20+** and **pnpm 10+**.

## Before you open a PR

Run the full gate locally — CI runs the same commands:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

If formatting fails, run `pnpm format`.

## Project conventions

| Area           | Rule                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| **Game rules** | Belong in `src/game/`, never in the UI layer                                                              |
| **Randomness** | Never call `Math.random()` in `src/game/`; take a `RandomSource`                                          |
| **DOM access** | Only inside `src/ui/` and `src/main.ts`                                                                   |
| **Types**      | No `any`; strict mode is enforced                                                                         |
| **Tests**      | New rule → new test in `tests/`                                                                           |
| **Commits**    | [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `chore:` |

## Commit messages

```
feat(game): add endless mode
fix(ui): stop moles overflowing their holes
docs: clarify scoring table
test(engine): cover zero-delta ticks
```

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

Open a discussion or an issue — happy to help.
