# Contributing to Enso

Thanks for your interest in contributing to Enso! We welcome contributions of all sizes.

## Quick Start

1. Fork the repo and clone your fork
2. Install dependencies: `npm install` (root) + `cd server && npm install`
3. Start dev server: `npm run dev:all`
4. Make your changes on a feature branch
5. Submit a PR

## What Can I Contribute?

- **Bug fixes** — Found something broken? Fix it and send a PR
- **New app types** — Build a new app in `server/apps/` following the `media_gallery` pattern
- **UI improvements** — Components live in `src/components/`
- **Documentation** — Help us explain Enso better
- **Translations** — Add languages in `src/lib/i18n/`

## App Development Guide

Each app in `server/apps/` follows this structure:

```
my_app/
├── app.json          # Tool specification (parameters, sample data)
├── template.jsx      # React component for rendering
└── executors/        # Tool execution logic
    └── my_tool.ts
```

Use `server/apps/media_gallery/` as the reference implementation.

## Code Style

- TypeScript with strict mode
- React functional components with hooks
- Tailwind CSS for styling
- Zustand for state management

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a description of what changed and why
- Ensure `npm run build` passes
- Add tests for new functionality where applicable

## Reporting Issues

Use GitHub Issues with:

- **Bug reports**: Include steps to reproduce, expected vs actual behavior
- **Feature requests**: Describe the use case and proposed solution

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
