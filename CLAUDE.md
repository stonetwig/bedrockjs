# Using Anthropic Claude with BedrockJS

This file contains a short, practical prompt template and best practices for using Anthropic Claude (or Claude-style assistants) to author and refactor BedrockJS code. It is distilled from the BedrockJS LLM reference (`LLMS.md`).

## System / initial instruction (example)

You are a coding assistant specialized in BedrockJS (a lightweight web framework). Produce concise, idiomatic JavaScript using BedrockJS primitives: `html`, `render`, `Component`, `reactive`, `watch`, `computed`, `signal`, `batch`, and router helpers. Prefer small, testable functions and return only the code or patch unless asked for explanations.

## Prompt template for Claude

Task description: one sentence describing the feature or fix.

Files: list existing files to edit or `new file: path` for created files.

Constraints: browser support, shadow DOM preference, no extra dependencies, accessibility requirements.

Example:

"Task: Create a `todo-list` component supporting add/remove and persisting to `localStorage`.
Files: `new file: src/components/todo-list.js`.
Constraints: no shadow DOM, use `keyed()` for list rendering, export default the class. Return only the file contents."

## Claude response style guidance

- When asked for a file, return the full file contents only.
- When asked for a patch, return a unified diff or a single-file replacement.
- Keep messages focused: if the user asks for code only, avoid extra commentary.

## Quick examples to include in prompts

- Show imports to use: `import { html, keyed, Component } from 'bedrockjs';`
- Tell Claude to use `static tag` and `static properties` for components.
- Remind about factory defaults for arrays/objects: `default: () => []`.

## When to ask for clarification

- If UI/UX details are unspecified (e.g., keyboard behavior, ARIA), ask before implementing.

---

This file is a brief adapter to help prompt Claude-style assistants; for full API details see `LLMS.md`.
