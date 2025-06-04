# Ollama Commit

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

1. Navigate to the directory of the script

   ```bash
   Example: ~/scripts/ollama-commit
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. (Optional) Create a `.env` file for default configuration:

   ```bash
   # .env
   OLLAMA_MODEL=llama3.2:latest
   PROMPT_TEMPLATE=custom_template_here
   ```

4. (Optional) Create a shell alias for easy access from anywhere:

   **For Zsh (default on macOS):**

   ```bash
   echo 'alias ollama-commit="node ~/scripts/ollama-commit/ollama-commit.js"' >> ~/.zshrc
   source ~/.zshrc
   ```

   **For Bash:**

   ```bash
   echo 'alias ollama-commit="node ~/scripts/ollama-commit/ollama-commit.js"' >> ~/.bashrc
   source ~/.bashrc
   ```

   After adding the alias, you can run the script from any directory:

   ```bash
   ollama-commit -c -cf -tid "PROJ-123"
   ```

## Usage

### Basic Usage

Generate a commit message for your staged changes:

```bash
node ~/scripts/ollama-commit/ollama-commit.js
# OR if you've set up the alias:
ollama-commit
```

### Command Line Options

| Option                  | Short  | Description                               | Example                               |
| ----------------------- | ------ | ----------------------------------------- | ------------------------------------- |
| `--help`                | `-h`   | Show help message                         | `ollama-commit -h`                    |
| `--context <text>`      | `-ctx` | Add context for better message generation | `ollama-commit -ctx "fix login bug"`  |
| `--conventional-format` | `-cf`  | Use conventional commit format            | `ollama-commit -cf`                   |
| `--type <type>`         | `-t`   | Custom conventional commit type           | `ollama-commit -t "fix"`              |
| `--ticketid <ticket>`   | `-tid` | Append ticket ID to message               | `ollama-commit -tid "PROJ-123"`       |
| `--copy`                | `-c`   | Auto-copy to clipboard (no prompt)        | `ollama-commit -c`                    |
| `--model <model>`       | `-m`   | Specify Ollama model to use               | `ollama-commit -m "codellama:latest"` |

### Examples

**Basic commit message generation:**

```bash
ollama-commit
```

**With context and conventional format:**

```bash
ollama-commit -cf -ctx "authentication issue"
```

**Auto-copy with ticket ID:**

```bash
ollama-commit -c -tid "PROJ-123"
```

**Custom model with specific type:**

```bash
ollama-commit -m "codellama:latest" -t "fix" -ctx "database connection"
```

**Full example with all options:**

```bash
ollama-commit -m "llama3.2:latest" -cf -t "feat" -tid "PROJ-456" -ctx "add user authentication" -c
```

## Workflow

1. **Stage your changes** with `git add`
2. **Run the script** with desired options
3. **Review** the generated commit message
4. **Copy to clipboard** (automatically or when prompted)
5. **Commit** using `git commit -m "paste_message_here"`

## Configuration

### Environment Variables

Create a `.env` file in the script directory:

```env
# Default Ollama model (fallback if --model not specified)
OLLAMA_MODEL=llama3.2:latest

# Custom prompt template (optional)
PROMPT_TEMPLATE=Your custom prompt template here
```

### Model Priority

The script determines which model to use in this order:

1. `--model` or `-m` flag
2. `OLLAMA_MODEL` environment variable
3. Default: `llama3.2:latest`

### Prompt Template Variables

If using a custom `PROMPT_TEMPLATE`, these variables are available:

- `{gitStatus}` - Git status of staged files
- `{gitDiff}` - Git diff of staged changes
- `{userContext}` - Additional context provided by user

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
