# Commit Assist

An AI-powered commit message generator that uses Ollama to create meaningful Git commit messages based on your staged changes.

## Features

- 🤖 **AI-powered**: Uses Ollama models to generate intelligent commit messages
- 📝 **Conventional Commits**: Optional support for conventional commit format
- 📋 **Clipboard Integration**: Automatically copy generated messages to clipboard
- 🎯 **Context Aware**: Add custom context to improve message generation
- 🏷️ **Ticket Integration**: Append ticket IDs to commit messages
- ⚙️ **Customizable**: Choose different Ollama models and prompt templates

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- [Ollama](https://ollama.ai/) installed and running
- Git repository with staged changes
- macOS (for clipboard functionality via `pbcopy`)

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

### Basic Usage

Generate a commit message for your staged changes:

```bash
commit-assist
```

### Command Line Options

| Option                         | Short  | Description                               | Example                                         |
| ------------------------------ | ------ | ----------------------------------------- | ----------------------------------------------- |
| `--help`                       | `-h`   | Show help message                         | `commit-assist -h`                              |
| `--context <text>`             | `-ctx` | Add context for better message generation | `commit-assist -ctx "fix login bug"`            |
| `--conventional-format`        | `-cf`  | Use conventional commit format            | `commit-assist -cf`                             |
| `--type <type>`                | `-t`   | Custom conventional commit type           | `commit-assist -t "fix"`                        |
| `--ticketid <ticket>`          | `-tid` | Append ticket ID to message               | `commit-assist -tid "PROJ-123"`                 |
| `--copy`                       | `-c`   | Auto-copy to clipboard (no prompt)        | `commit-assist -c`                              |
| `--model <model>`              | `-m`   | Specify Ollama model to use               | `commit-assist -m "codellama:latest"`           |
| `--prompt-template <template>` | `-pt`  | Use custom prompt template                | `commit-assist -pt "Brief commit: {gitStatus}"` |

### Examples

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

**Custom prompt template:**

```bash
commit-assist -pt "Create a brief commit message for:\nChanges: {gitStatus}\nDiff: {gitDiff}\nContext: {userContext}
```

**Full example with all options:**

````bash
commit-assist -m "llama3.2:latest" -cf -t "feat" -tid "PROJ-456" -ctx "add user authentication" -pt "Generate a detailed commit message:\nChanges: {gitStatus}\nDiff: {gitDiff}\nContext: {userContext}" -c
```iff}\nContext: {userContext}" -ctx "performance optimization"
````

## Workflow

1. **Stage your changes** with `git add`
2. **Run the script** with desired options
3. **Review** the generated commit message
4. **Copy to clipboard** (automatically or when prompted)
5. **Commit** using `git commit -m "paste_message_here"`

## Configuration

### Model Priority

The script determines which model to use in this order:

1. `--model` or `-m` flag
2. Default: `llama3.2:latest`

### Prompt Template Variables

You can customize how the AI generates commit messages using the `--prompt-template` or `-pt` flag. Custom templates must include these required variables:

- `{gitStatus}` - Git status of staged files
- `{gitDiff}` - Git diff of staged changes
- `{userContext}` - Additional context provided by user

**Example custom template:**

```bash
commit-assist -pt "Write a commit message for these changes: {gitStatus}. Additional context: {userContext}. Diff details: {gitDiff}"
```

**Template Validation:**

The script validates that your custom template includes all required placeholders. If any are missing, it will show an error and exit.

## Conventional Commits

When using conventional commit format (`-cf` flag), the AI will generate messages following the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>
```

### Common Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

## Troubleshooting

### Common Issues

**"No staged changes found"**

- Make sure you have staged files with `git add <files>`
- Check `git status` to see staged changes

**"Error generating commit message"**

- Ensure Ollama is running: `ollama serve`
- Verify the model exists: `ollama list`
- Try a different model with `-m` flag

**"Clipboard copy failed"**

- Only works on macOS with `pbcopy`
- Check if `pbcopy` command is available

### Dependencies

The script requires these npm packages:

- `ollama` - Ollama API client
- `dotenv` - Environment variable loading
- `child_process` - Git command execution
- `readline` - User input handling

## License

MIT License

## Contributing

Feel free to submit issues and pull requests to improve the script's functionality.
