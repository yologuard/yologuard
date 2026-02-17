# Backend API Errors

## HTTP Error Creation

Use the `http-errors` library for creating HTTP errors:

```typescript
import createHttpError from 'http-errors'

// Named errors
throw new createHttpError.NotFound('Entity not found')
throw new createHttpError.BadRequest('Invalid input')
throw new createHttpError.Forbidden('Access denied')
throw new createHttpError.Conflict('Resource already exists')

// Status code errors
throw new createHttpError[404]('Entity not found')
throw new createHttpError[403]('Forbidden')
```

## Standard Error Response

All APIs return errors in this format:

```typescript
{
  status: number    // HTTP status code
  error: string     // Error message
}
```

With standard headers:
```typescript
{
  'content-type': 'application/json',
  'cache-control': 'no-cache,no-store,must-revalidate'
}
```

## Error Handler

Use the common `handleErrors` function in Lambda handlers:

```typescript
import { isHttpError } from 'http-errors'

export const handleErrors = (err: Error) => {
  if (isHttpError(err)) {
    const { statusCode, message, headers } = err
    return replyJSON({ status: statusCode, error: message }, { statusCode, headers })
  }

  logger.error('API error', { error: err })
  return replyJSON({ status: 500, error: 'Unknown API error' }, { statusCode: 500 })
}
```