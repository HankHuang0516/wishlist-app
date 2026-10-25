# LINE desktop read budget

The native LINE accessibility tree can be mostly empty and a cold binding has
previously taken 364 seconds. Use the existing CUA app handle and screenshot to
read visible text, then open a verified joined group's notebook through its
normal UI. Search only a field verified by a fresh screenshot and AX state;
never press Return when the chat composer has focus. Do not hardcode AX indexes.

Load `line-read-budget.mjs` in the persistent CUA REPL and create a budget **after**
the simulator-manager GUI lease is granted. Wrap only `cua.getApp`,
`app.getAXState` and `app.getScreenshot` in `budget.read(name, () => ...)`.
For example: `await budget.read('LINE_AX', () => lineApp.getAXState())`.
The default reserves 15 seconds out of a 100-second phase and caps a read at
12 seconds. Reuse one budget for the phase; don't reset the clock per read.

A deadline returns control; it does not cancel an underlying native call.
Never duplicate a pending read or use its late result to perform an action.
If AX times out and an app handle already exists, one bounded screenshot is
allowed. If binding itself times out without a handle, end the phase, release
the lease and preserve the pending work. Never bypass CUA or continue UI actions
after the lease expires. A timeout is not evidence of deletion or sale.
Close only notebook/photo windows opened by this phase, preserve the main LINE
window, and release the supervised GUI lease in cleanup. No chat/comment/private
message transmission is authorized by this helper.

Run `node --test tools/source-pipeline/line-read-budget.test.mjs`.
