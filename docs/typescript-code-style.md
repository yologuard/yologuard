# TypeScript Code Style

## Formatting
- Prioritise project biome configuration and established patterns

## Comments
- Use comments sparingly. Code should be self-documenting
- descriptive naming over explanatory comments
- only add comments to document examples or when the "why" isn't obvious

## Idiomatic TypeScript Patterns
## Exports & module boundaries
- Avoid barrel `index.ts` files (prefer explicit imports)
- Prefer named exports over default exports (reduces misdirection)

- Prefer modules over classes
- Prefer arrow functions over `function` keyword
- Keep functions small and testable
- Use `as const` for config objects and literal types
- Use `satisfies` instead of `as` for type assertions
- Use `unknown` with runtime parsing, never `any`
- Use immutable updates: `const next = { ...prev, updated: value }`
- Prefer union types + `as const` over enumseslint/prettier/biome configuration and established patterns

## Function Parameters
- If a function takes more than one parameter, use the params object pattern with destructuring

Good:
```ts
const createUser = (params: { name, email, age }) => ...
```

Bad:
```ts
const createUser = (name: string, email: string, age: number) => ...
```
