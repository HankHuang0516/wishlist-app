---
description: Pre-work checklist before starting any task in this project
---

# Pre-Work Checklist

Before starting ANY task in this project, you MUST:

// turbo-all
1. Read the project rules file:
   ```
   view_file .cursorrules
   ```

2. Based on the task type, read the corresponding documentation as specified in `.cursorrules`.

3. **For Deployments**, ensure you:
   - Run `npm run test -- --run` and verify all tests pass
   - Update version in `client/package.json` using `git rev-list --count HEAD` + 1
   - Avoid special characters in git commit messages

4. **For Terminal Commands**:
   - NEVER chain commands with `;` or `&&`
   - Execute commands sequentially in separate steps
