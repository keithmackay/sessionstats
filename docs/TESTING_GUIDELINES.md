# cc-session-track Testing Guidelines

This document defines the testing strategy and requirements for cc-session-track development.

---

## Testing Pyramid

cc-session-track follows a comprehensive testing strategy with multiple layers:

```
        /\
       /  \  E2E (Playwright)
      /----\
     /      \  Widget Tests
    /--------\
   /          \  Unit Tests
  /--------------\
```

### 1. Unit Tests (Foundation)
**What**: Test individual functions, classes, and business logic in isolation.
**Tools**: Flutter's `test` package
**Coverage Target**: 80% line coverage minimum

**Examples**:
- Repository CRUD operations
- Service business logic (SchedulingService, StreakService, etc.)
- Model serialization/deserialization
- Utility functions

### 2. Widget Tests (UI Components)
**What**: Test individual widgets and screens in isolation.
**Tools**: Flutter's `flutter_test` package
**Coverage Target**: 75% branch coverage minimum

**Examples**:
- Screen rendering and state management
- User input handling
- Navigation flows
- Error states and loading indicators

### 3. End-to-End Tests (Full Flows)
**What**: Test complete user workflows across the entire application.
**Tools**: **Playwright** (preferred) or manual testing
**Coverage Target**: All critical user paths

**Examples**:
- Creating a habit → Receiving notification → Completing interaction
- Onboarding flow → First habit creation → First peep
- Streak tracking over multiple days
- Data persistence across app restarts

---

## Test-Driven Development (TDD) - MANDATORY

**ALL code must follow TDD**:

1. ✅ Write failing test FIRST
2. ✅ Run test → verify FAIL
3. ✅ Implement minimum code to pass
4. ✅ Run test → verify PASS
5. ✅ Refactor if needed
6. ✅ Run test → verify still PASS
7. ✅ Commit

**No exceptions**: Every line of production code must be test-driven.

---

## End-to-End Testing with Playwright

### When to Use Playwright

**Use Playwright instead of manual testing when**:
- Implementation or test plans recommend "manual testing"
- Testing multi-screen user workflows
- Verifying notification behavior
- Testing platform-specific features (web, macOS, etc.)
- Regression testing after refactoring
- Validating UI interactions and navigation

### Playwright Setup

1. **Install Playwright MCP** (if not already installed):
   ```bash
   claude mcp add playwright npx @playwright/mcp@latest
   ```

2. **Run app in debug mode**:
   ```bash
   flutter run -d chrome --web-port=8080
   # or
   flutter run -d macos
   ```

3. **Write Playwright tests** to automate user interactions

### Playwright Test Examples

#### Example 1: Creating a Habit
```typescript
// Test: User can create a new habit
await page.goto('http://localhost:8080');
await page.click('text=My Habits');
await page.click('[aria-label="Add habit"]');
await page.fill('input[placeholder="Habit name"]', 'Morning Meditation');
await page.fill('textarea[placeholder="Description"]', 'Daily meditation practice');
await page.selectOption('select[name="category"]', 'Mindfulness');
await page.click('text=Save');
await expect(page.locator('text=Morning Meditation')).toBeVisible();
```

#### Example 2: Completing an Interaction
```typescript
// Test: User can complete a TAP interaction
await page.goto('http://localhost:8080');
await page.click('text="Today\'s Peeps"');
await page.click('text=Morning Meditation');
await page.click('button:has-text("Acknowledge")');
await expect(page.locator('text=👁️ Seen')).toBeVisible();
```

#### Example 3: Selecting Intention Words
```typescript
// Test: User can select 3 intention words
await page.goto('http://localhost:8080');
// Navigate to intentionWords interaction
await page.click('text="Today\'s Peeps"');
await page.click('[data-interaction-type="intentionWords"]');
// Select 3 words
await page.click('text=Focused');
await page.click('text=Calm');
await page.click('text=Strong');
// Commit
await page.click('button:has-text("Commit")');
await expect(page.locator('text=👁️ Seen')).toBeVisible();
```

### Benefits of Playwright Over Manual Testing

✅ **Repeatable**: Run tests consistently across all changes
✅ **Fast**: Automated tests run in seconds vs. minutes of manual testing
✅ **Reliable**: No human error in test execution
✅ **Documentation**: Tests serve as living documentation of user flows
✅ **Regression Prevention**: Catch breaking changes immediately
✅ **CI/CD Ready**: Can be integrated into automated pipelines

---

## Test Organization

### Directory Structure
```
test/
├── unit/                    # Unit tests
│   ├── models/
│   ├── repositories/
│   └── services/
├── widget/                  # Widget tests
│   ├── screens/
│   └── widgets/
└── e2e/                     # Playwright E2E tests
    ├── onboarding_test.ts
    ├── habit_management_test.ts
    └── interactions_test.ts
```

### Naming Conventions

**Unit tests**: `{component_name}_test.dart`
- Example: `streak_service_test.dart`

**Widget tests**: `{screen_name}_test.dart`
- Example: `home_screen_test.dart`

**E2E tests**: `{feature_name}_test.ts`
- Example: `habit_creation_flow_test.ts`

---

## Test Coverage Requirements

### Critical Paths (100% Coverage Required)
- Data persistence (all repository operations)
- Streak calculations
- Notification scheduling
- User data sync (when Azure backend is implemented)

### High Priority (≥90% Coverage)
- Interaction flows (TAP, QUESTION, INTENTIONWORDS)
- Scheduling algorithms
- Business logic services

### Standard Priority (≥80% Coverage)
- UI screens and widgets
- Navigation flows
- Form validation

---

## Running Tests

### Unit + Widget Tests
```bash
# Run all tests
flutter test

# Run specific test file
flutter test test/unit/services/streak_service_test.dart

# Run with coverage
flutter test --coverage
```

### E2E Tests (Playwright)
```bash
# Start app in test mode
flutter run -d chrome --web-port=8080

# In another terminal, run Playwright tests
npx playwright test

# Run specific test
npx playwright test e2e/habit_creation_flow_test.ts

# Run in headed mode (see browser)
npx playwright test --headed
```

---

## Test Data Management

### In-Memory Databases
- All unit and widget tests use in-memory SQLite databases
- DatabaseService automatically detects test environment
- Each test gets a clean database via `setUp()` and `tearDown()`

### Test Fixtures
- Create reusable test data factories
- Example: `createTestHabit()`, `createTestPeep()`
- Keep test data minimal but representative

### Mock Repositories
- Use mock repositories for widget tests
- Avoid network calls and real database operations in widget tests
- Example: `MockPeepRepository`, `MockHabitRepository`

---

## Test Quality Standards

### Good Test Characteristics

✅ **Fast**: Unit tests run in milliseconds, widget tests in seconds
✅ **Isolated**: Each test is independent, no shared state
✅ **Repeatable**: Same result every time
✅ **Readable**: Clear test names and well-structured arrange-act-assert
✅ **Maintainable**: Easy to update when requirements change

### Anti-Patterns to Avoid

❌ **Testing implementation details**: Test behavior, not internal structure
❌ **Brittle tests**: Don't break from minor UI changes
❌ **Slow tests**: Keep unit tests under 100ms, widget tests under 1s
❌ **Flaky tests**: No random timeouts or race conditions
❌ **Testing mocked behavior**: Test real logic, not mock returns

---

## Continuous Integration

### Pre-Commit Checklist
- [ ] All new code has tests
- [ ] `flutter test` passes locally
- [ ] Coverage meets minimum thresholds
- [ ] No skipped or disabled tests

### CI Pipeline (Future)
1. Run `flutter test` on all commits
2. Run Playwright E2E tests on main branch
3. Generate coverage reports
4. Block merges if tests fail or coverage drops

---

## When Implementation Plans Say "Manual Testing"

**Replace with Playwright testing**:

1. Read the manual testing instructions
2. Translate steps into Playwright test script
3. Run app in debug mode
4. Execute Playwright tests to verify functionality
5. Add Playwright tests to `test/e2e/` directory
6. Commit both implementation and E2E tests

**Example transformation**:

**Before (Manual Testing)**:
```
Task 3.5: Test manually
1. Create a habit
2. Wait for notification
3. Tap notification
4. Verify TapInteractionScreen opens
5. Tap "Acknowledge" button
6. Verify peep marked as acknowledged
```

**After (Playwright Testing)**:
```typescript
test('notification opens TapInteractionScreen and acknowledges peep', async ({ page }) => {
  // Create habit
  await page.goto('http://localhost:8080');
  await page.click('text=My Habits');
  await page.click('[aria-label="Add"]');
  await page.fill('input[name="name"]', 'Test Habit');
  await page.click('text=Save');

  // Simulate notification tap (or wait for scheduled time)
  await page.click('[data-peep-id="1"]');

  // Verify TapInteractionScreen
  await expect(page.locator('text=Acknowledge')).toBeVisible();

  // Acknowledge
  await page.click('button:has-text("Acknowledge")');

  // Verify status
  await page.goto('http://localhost:8080');
  await expect(page.locator('text=👁️ Seen')).toBeVisible();
});
```

---

## Questions?

- **Playwright not working?** Ensure app is running in debug mode on expected port
- **Tests flaky?** Add explicit waits: `await page.waitForSelector('text=...')`
- **Coverage dropping?** Run `flutter test --coverage` and check gaps
- **Stuck on test design?** Follow arrange-act-assert pattern

---

**Remember**: Tests are not just verification — they're documentation, design tools, and safety nets. Write them first, write them well, and your code will thank you! ✅
