# Shared Packages

This directory contains shared code used across the monorepo.

## Structure

- **`ui/`** - Shared React UI components (buttons, forms, layouts, etc.)
- **`shared/`** - Shared utilities, types, and business logic
- **`config/`** - Shared configuration (ESLint, TypeScript, Tailwind configs)

## Usage

Each package should have its own `package.json` and can be imported by apps:

```json
{
  "dependencies": {
    "@aaiaas/ui": "*",
    "@aaiaas/shared": "*"
  }
}
```

## Creating a New Package

1. Create a new directory under `packages/`
2. Initialize with `npm init` or copy package.json template
3. Add package name as `@aaiaas/<package-name>`
4. Export your modules from `index.ts` or `index.js`
5. Reference in app's package.json dependencies

## Best Practices

- Keep packages focused and single-purpose
- Use TypeScript for type safety
- Export types alongside implementation
- Document public APIs
- Version packages independently if needed
