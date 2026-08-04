---
title: Tests
---

Include _at least_ **one** unit test in your repo to demonstrate how testing works (full testing coverage is _not_ required!)

## E2E Tests

A shared [Playwright E2E test suite](https://github.com/realworld-apps/realworld/tree/main/specs/e2e) is available to validate your frontend implementation. It covers authentication, articles, comments, navigation, settings, social features, error handling, and even basic XSS security.

To make your implementation compatible with the E2E tests, it **must** follow the [selectors contract](https://github.com/realworld-apps/realworld/blob/main/specs/e2e/SELECTORS.md), which defines:

- Form input `name` attributes
- Required CSS classes (layout, feed, tags, comments, profile, pagination, buttons, errors)
- Required text content for buttons and links
- Routes
- A debug interface (`window.__conduit_debug__`)
- LocalStorage key for the JWT token
- Default avatar behavior

### Running the tests

The test suite ships with a [base Playwright config](https://github.com/realworld-apps/realworld/blob/main/specs/e2e/playwright.base.ts) that you can extend in your implementation. Override `baseURL` and `webServer` to point to your dev server.

See the [Angular implementation](https://github.com/realworld-apps/angular-realworld-example-app) for a working example.
