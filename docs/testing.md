# Testing

We use [Vitest](https://vitest.dev/) as our test runner with globals enabled.

## File Organization

Test files should be colocated next to the implementation files they test.

Good:
```
src/
  api-handler.ts
  api-handler.test.ts
  user-service.ts
  user-service.test.ts
```

Bad:
```
src/
  __tests__/
    api-handler.test.ts
    user-service.test.ts
  api-handler.ts
  user-service.ts
```

## Naming Convention

- Test files use the `.test.ts` suffix
- Name test files after the module they test: `{module-name}.test.ts`

## Basic Test Structure

With vitest globals enabled, no imports are needed:

```ts
import { calculateTotal } from './calculate-total'

describe('calculateTotal', () => {
  it('sums item prices', () => {
    const items = [{ price: 10 }, { price: 20 }]

    expect(calculateTotal(items)).toBe(30)
  })

  it('returns 0 for empty array', () => {
    expect(calculateTotal([])).toBe(0)
  })
})
```

## Unit Testing Guidelines

Good tests are essential for maintainable code. Write tests as you develop, not as an afterthought.

### Test Structure

Follow the Given-When-Then pattern:

```ts
it('calculates discount for premium users', () => {
  // Given
  const user = { tier: 'premium', purchaseAmount: 100 }

  // When
  const discount = calculateDiscount(user)

  // Then
  expect(discount).toBe(20)
})
```

### Best Practices

- Test behavior, not implementation details
- Use descriptive test names that explain the expected behavior
- Keep tests focused and independent
- Prefer realistic test data over trivial examples
- Avoid testing private functions directly
