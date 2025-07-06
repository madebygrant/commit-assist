# Commit Assist

An AI-powered commit message generator that uses Ollama to create meaningful Git commit messages based on your staged changes.

## Features

- 🤖 **AI-powered**: Uses Ollama models to generate intelligent commit messages
- 📝 **Conventional Commits**: Optional support for conventional commit format
- 📋 **Clipboard Integration**: Automatically copy generated messages to clipboard
- 🎯 **Context Aware**: Add custom context to improve message generation
- 🏷️ **Ticket Integration**: Append ticket IDs to commit messages
- 🕑 **Recent Commit & Branch Context**: AI sees your last 3 commits and current branch for better relevance
- 🗂️ **Diff Summarization**: AI sees a summary of changed files for clarity
- 🔁 **Message Regeneration**: Accept or regenerate commit messages interactively
- ⚙️ **Customizable Prompt Template**: Uses an external `prompt.md` file for the AI prompt, with full support for placeholders and user customization
- 🛠️ **Robust Placeholder Replacement**: All placeholders in the prompt template (e.g., `{gitStagedChanges}`, `{branchName}`) are replaced with real context

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- [Ollama](https://ollama.ai/) installed and running
- Git repository with staged changes
- macOS, Windows or Linux

## Installation

### Method 1: Global NPM Installation (Recommended)

1. Clone the repository:

   ```bash
   git clone https://github.com/madebygrant/commit-assist.git ~/scripts/commit-assist
   ```

2. Navigate to the script directory:

   ```bash
   cd ~/scripts/commit-assist
   ```

3. Install globally (this will also install dependencies):

   ```bash
   npm install -g .
   ```

After global installation, you can use `commit-assist` from any directory in your terminal.

### Method 2: Shell Alias (Alternative)

1. Clone the repository:

   ```bash
   git clone https://github.com/madebygrant/commit-assist.git ~/scripts/commit-assist
   ```

2. Navigate to the script directory and install dependencies:

   ```bash
   cd ~/scripts/commit-assist
   npm install
   ```

3. Create a shell alias:

   **For Zsh (default on macOS):**

   ```bash
   echo 'alias commit-assist="node ~/scripts/commit-assist/commit-assist.js"' >> ~/.zshrc
   source ~/.zshrc
   ```

   **For Bash:**

   ```bash
   echo 'alias commit-assist="node ~/scripts/commit-assist/commit-assist.js"' >> ~/.bashrc
   source ~/.bashrc
   ```

## Usage

Stage your changes with `git add`, then run:

```bash
commit-assist [options]
```

### Options

- `-h, --help`                          Show help message
- `-ctx, --context <text>`              Additional context for commit message
- `-cf, --conventional-format`          Tell AI to use conventional commit format
- `-t, --type <type>`                   Custom conventional commit type
- `-tid, --ticketid <ticket>`           Ticket id/number to append
- `-c, --copy`                          Automatically copy to clipboard (no prompt)
- `-m, --model <model>`                 Specify Ollama model to use
- `-pt, --prompt-template <path>`       Path to custom prompt template markdown file (overrides prompt.md)

## Prompt Template

Commit Assist can use an external `prompt.md` file as the default prompt for the AI. You can fully customize this file, or specify a custom prompt template file at runtime using the `--prompt-template` (or `-pt`) flag. For example:

```bash
commit-assist --prompt-template ./my-custom-prompt.md
```

You can use the following placeholders in your template (these are required for full context):

- `{gitStagedChanges}` — Output of `git diff --cached --name-status`, listing staged files and their status (A/M/D).
- `{gitDiff}` — Full unified diff of all staged changes (`git diff --cached`).
- `{userContext}` — Any extra context provided by the user.
- `{recentCommits}` — The last 3 commit messages from the current branch.
- `{branchName}` — The current git branch name.
- `{gitDiffSummary}` — A summary listing the names of files changed in the diff.
- `{conventionalText}` — Instruction for the AI to use or not use Conventional Commit format, depending on user options.

> **Note:** Your custom template file must exist and be readable. Inline templates are not supported.

#### Example `my-custom-prompt.md`

```markdown
You are an expert at writing concise, high-quality Git commit messages.
  - Write a single-line commit message (max 80 chars) in the imperative mood.
  - Summarize the core change and, if possible, briefly state the reason ("why").
  - Do not include "This commit", "Fixes", or similar phrases.
  - Do not use markdown, lists, or extra formatting.
  - If a ticket number is provided, do NOT include it in the message (it will be appended automatically).
  - If the branch name or recent commits provide context, use it to avoid repetition.
  - If the staged changes are trivial (e.g., formatting), mention that.
  - {conventionalText}

	Branch: {branchName}

	Recent commits:
	{recentCommits}

	Staged changes:
	{gitStagedChanges}

	Diff summary:
	{gitDiffSummary}

	User context: {userContext}
```

## Examples

**Basic commit message generation:**

```bash
commit-assist
```

**With context and conventional format:**

```bash
commit-assist -cf -ctx "authentication issue"
```

**Auto-copy with ticket ID:**

```bash
commit-assist -c -tid "PROJ-123"
```

**Custom model with specific type:**

```bash
commit-assist -m "codellama:latest" -t "fix" -ctx "database connection"
```

**Custom prompt template file:**

```bash
commit-assist -pt ./my-custom-prompt.md
```

**Full example with all options:**

```bash
commit-assist -m "llama3.2:latest" -cf -t "feat" -tid "PROJ-456" -ctx "add user authentication" -pt ./my-custom-prompt.md -c
```

## Workflow

1. **Stage your changes** with `git add`
2. **Run the script** with desired options
3. **Review** the generated commit message
4. **Copy to clipboard** (automatically or when prompted)
5. **Commit** using `git commit -m "paste_message_here"`

## Model Priority

The script determines which model to use in this order:

1. `--model` or `-m` flag
2. Default: `llama3.2:latest`

## Common Issues

**"No staged changes found"**

- Make sure you have staged files with `git add <files>`
- Check `git status` to see staged changes

**"Error generating commit message"**

- Ensure Ollama is running: `ollama serve`
- Verify the model exists: `ollama list`
- Try a different model with `-m` flag

**"Clipboard copy failed"**

- Cross-platform clipboard support provided by `clipboardy`
- If clipboard access fails, the message will still be displayed for manual copying

## Dependencies

The script requires these npm packages:

- `ollama` - Ollama API client for model interaction
- `clipboardy` - Cross-platform clipboard support
- `consola` - Elegant console output with interactive prompts

## Roadmap

- [ ] Support for config files, global and project based

## License

MIT License

## Contributing

Feel free to submit issues and pull requests to improve the script's functionality.
