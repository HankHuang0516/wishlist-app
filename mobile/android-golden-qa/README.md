# Isolated Golden regression instrumentation

This new, separate AndroidX UI Automator suite exercises the actual static QA APK. It does not restore the unavailable historical `NativeQaTest.kt`, replace an app screen, grant authentication, or prove release acceptance merely by compiling.

The target must be an exact `.visualqaYYYYMMDDHHmm` package. A one-use loopback broker supplies only synthetic `example.invalid` fixture credentials in memory. The runner is a separate, uniquely named local test host; it never instruments or resets the production app. Runtime requires a supervised Simulator Manager lease. Build outputs, dependencies and runtime evidence stay in the owned SSD test copy. No release credentials are used.

Each phase has assertions, bounded waits, explicit checkpoints, and screenshots after login. The buyer phase inspects wish cards and photo/manual editors, creates and edits one synthetic wish, toggles hidden/completed states, then inspects security and deletion impact without submitting deletion. Its database audit verifies the resulting budget/flags, original creation receipt and absence of duplicate wishes. The seller phase checks reserve/restore and batch-to-manual navigation, then verifies the actual listing status/version. The controller checks the installed APK hash, preserves pre-existing QA app data, and removes only its own test hosts, reverse bindings and server fixtures.

Partial or failed phases do not count as passed; all images require visual review against the Goldens. Screenshots before credential input may diagnose onboarding; entered credentials are never captured, and instrumentation logs redact all synthetic credential values. Additional targets, iOS transitions, actual push delivery and final store artifacts remain separate acceptance work. These tests alone do not assign an85% score.

Primary framework references: [Android UI Automator](https://developer.android.com/training/testing/other-components/ui-automator), [instrumentation from the command line](https://developer.android.com/studio/test/command-line). The installed stable UI Automator 2.3 API is used; no alpha runtime is installed.
