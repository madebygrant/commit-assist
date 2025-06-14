#!/usr/bin/env node
// npm install child_process ollama readline clipboardy

const { exec } = require("child_process");
const { promisify } = require("util");
const { Ollama } = require("ollama");
const readline = require("readline");

const execAsync = promisify(exec);

// Configuration
const ollama = new Ollama();

// Helper function to parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      showHelp();
      process.exit(0);
    } else if (args[i] === "--context" || args[i] === "-ctx") {
      result.context = args[i + 1] || "";
      i++; // Skip the next argument as it's the value
    } else if (args[i] === "--conventional-format" || args[i] === "-cf") {
      result.useAiConventional = true;
    } else if (args[i] === "--type" || args[i] === "-t") {
      result.conventionalType = args[i + 1] || "";
      i++; // Skip the next argument as it's the value
    } else if (args[i] === "--ticketid" || args[i] === "-tid") {
      result.ticketID = args[i + 1] || "";
      i++; // Skip the next argument as it's the value
    } else if (args[i] === "--copy" || args[i] === "-c") {
      result.autoCopy = true;
    } else if (args[i] === "--model" || args[i] === "-m") {
      result.model = args[i + 1] || "";
      i++; // Skip the next argument as it's the value
    } else if (args[i] === "--prompt-template" || args[i] === "-pt") {
      result.promptTemplate = args[i + 1] || "";
      i++; // Skip the next argument as it's the value
    }
  }

  return result;
}

// Helper function to display help information
function showHelp() {
  console.log(`
Usage: commit-assist [options]

Generate AI-powered commit messages for your staged git changes.

Options:
  -h, --help                          Show this help message
  -ctx, --context <text>              Additional context for commit message
  -cf, --conventional-format          Tell AI to use conventional commit format
  -t, --type <type>                   Custom conventional commit type
  -tid, --ticketid <ticket>           Ticket id/number to append
  -c, --copy                          Automatically copy to clipboard (no prompt)
  -m, --model <model>                 Specify Ollama model to use
  -pt, --prompt-template <template>   Custom prompt template

Examples:
  commit-assist
  commit-assist -ctx "fix login bug"
  commit-assist -cf -tid "PROJ-123"
  commit-assist -t "fix" -ctx "authentication issue"
  commit-assist -m "codellama:latest" -c
  commit-assist -pt "Create a commit message for: {gitStagedChanges}"
`);
}

// Helper function to validate prompt template
function validatePromptTemplate(template) {
  const requiredPlaceholders = [
    "{gitStagedChanges}",
    "{gitDiff}",
    "{userContext}",
  ];
  const missingPlaceholders = requiredPlaceholders.filter(
    (placeholder) => !template.includes(placeholder)
  );

  if (missingPlaceholders.length > 0) {
    console.error(
      `❌ Invalid prompt template. Missing required placeholders: ${missingPlaceholders.join(
        ", "
      )}`
    );
    console.error(
      "Required placeholders: {gitStagedChanges}, {gitDiff}, {userContext}"
    );
    process.exit(1);
  }

  return true;
}

// Helper function to create dynamic prompt template
function createPromptTemplate(useConventional, userContext) {
  const conventionalText = useConventional
    ? "Use the conventional commit format (e.g., feat:, fix:, docs:)."
    : "Do not include conventional commit types (e.g., feat:, fix:, docs:) in the commit message.";

  userContextText = userContext
    ? ` The additional context is: "${userContext}".`
    : " No additional user context provided.";

  return `Summarise and write a brief, single line commit message based on the following information: {gitDiff} changes were made and {gitStagedChanges} files are staged.${userContextText} Keep the message concise and focused on the main change or feature being added.${conventionalText}\n\n Just output the single line commit message. No additional text, lists, markdown syntax, and formatting.`;
}

// Helper function to apply custom conventional type
function applyCustomConventionalType(message, customType) {
  if (!customType) {
    return message;
  }

  // If custom type is empty, use default conventional behavior
  if (customType.trim() === "") {
    return message;
  }

  // Remove any existing conventional commit type and scope using regex
  // This matches patterns like "feat:", "fix(scope):", "docs(api):", etc.
  const conventionalRegex = /^[a-z]+(\([^)]*\))?\s*:\s*/i;

  if (conventionalRegex.test(message)) {
    // Replace existing conventional format with custom type
    return message.replace(conventionalRegex, `${customType}: `);
  } else {
    // Prepend custom type to message that doesn't have conventional format
    return `${customType}: ${message}`;
  }
}

// Helper function to format final commit message with ticket
function formatCommitMessage(message, ticketID) {
  if (!ticketID) {
    return message;
  }

  // Remove any existing ticket references to avoid duplication
  const cleanMessage = message.replace(/\s*\([A-Z]+-\d+\)\s*$/, "");

  return `${cleanMessage} (${ticketID})`;
}

// Helper function to get both git status and diff in parallel
async function getGitData() {
  try {
    const [statusResult, diffResult] = await Promise.all([
      execAsync("git diff --cached --name-status"),
      execAsync("git diff --cached"),
    ]);

    const gitStagedChanges = statusResult.stdout.trim();
    const gitDiff = diffResult.stdout.trim();

    // Early exit if no staged changes
    if (!gitStagedChanges) {
      console.log(
        "❌ No staged changes found. Please stage some changes first with 'git add'."
      );
      process.exit(0);
    }

    return {
      gitStagedChanges: gitStagedChanges || "No staged changes found",
      gitDiff: gitDiff || "No diff available",
    };
  } catch (error) {
    console.error("❌ Git error:", error.message);
    process.exit(1);
  }
}

// Helper function to copy text to clipboard (cross-platform)
async function copyToClipboard(text) {
  try {
    const clipboardy = await import("clipboardy");
    await clipboardy.default.write(text);
    return true;
  } catch (error) {
    console.error("❌ Clipboard copy failed:", error.message);
    return false;
  }
}

// Helper function to get user input from command line
function getUserInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function generateCommitMessage(
  gitData,
  args, // Add args as a parameter
  userContext = "",
  useConventional = false
) {
  try {
    // Remove redundant call to parseArgs()
    // const args = parseArgs();

    // Determine prompt template with priority: CLI flag > default template
    let promptTemplate;
    if (args.promptTemplate) {
      validatePromptTemplate(args.promptTemplate);
      promptTemplate = args.promptTemplate;
    } else {
      promptTemplate = createPromptTemplate(useConventional, userContext);
    }

    // Construct the prompt
    const prompt = promptTemplate
      .replace("{gitStagedChanges}", gitData.gitStagedChanges)
      .replace("{gitDiff}", gitData.gitDiff)
      .replace("{userContext}", userContext);

    // Use Ollama library with streaming
    const response = await ollama.generate({
      model: args.model || "llama3.2:latest",
      prompt: prompt,
      stream: true,
    });

    let fullResponse = "";

    for await (const part of response) {
      if (part.response) {
        fullResponse += part.response;
      }
      if (part.done) {
        break;
      }
    }

    return fullResponse.trim();
  } catch (error) {
    console.error("Error generating commit message:", error.message);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    // Parse CLI arguments once at the start
    const args = parseArgs();

    // Determine if conventional commits should be used
    // Priority: CLI args > custom conventional type
    const useConventional =
      args.useAiConventional !== undefined
        ? args.useAiConventional
        : args.conventionalType ?? false;

    // Get git data first (fast exit if no changes)
    console.log("Checking staged changes...");
    const gitData = await getGitData();

    // Get user context - either from CLI or interactive prompt
    let userContext = "";
    if (args.context !== undefined) {
      userContext = args.context;
      console.log(`Using context: "${userContext}"`);
    } else {
      userContext = await getUserInput(
        "Enter any additional context (optional): "
      );
    }

    console.log("Generating commit message...");
    const commitMessage = await generateCommitMessage(
      gitData,
      args, // Pass args here
      userContext,
      useConventional
    );

    if (commitMessage) {
      console.log("\nGenerated Commit Message:");

      // Remove quotes from start and end of commit message
      let cleanCommitMessage = commitMessage.replace(/^["']|["']$/g, "");

      // Apply custom conventional type if provided
      if (args.conventionalType !== undefined) {
        cleanCommitMessage = applyCustomConventionalType(
          cleanCommitMessage,
          args.conventionalType
        );
      }

      // Add ticket number if provided
      if (args.ticketID) {
        cleanCommitMessage = formatCommitMessage(
          cleanCommitMessage,
          args.ticketID
        );
      }

      console.log("\x1b[36m" + cleanCommitMessage + "\x1b[0m"); // Cyan color

      // Handle clipboard copying based on flags
      if (args.autoCopy) {
        // Auto-copy without prompting
        const copySuccess = await copyToClipboard(cleanCommitMessage);
        console.log(
          copySuccess ? "✅ Copied to clipboard!" : "❌ Clipboard copy failed."
        );
        process.exit(0);
      } else {
        // Ask user if they want to copy to clipboard
        const copyResponse = await getUserInput("\nCopy to clipboard? (Y/n): ");
        const shouldCopy =
          copyResponse.trim().toLowerCase() !== "n" &&
          copyResponse.trim().toLowerCase() !== "no";

        if (shouldCopy) {
          const copySuccess = await copyToClipboard(cleanCommitMessage);
          console.log(
            copySuccess
              ? "✅ Copied to clipboard!"
              : "❌ Clipboard copy failed."
          );
          process.exit(0);
        } else {
          process.exit(0);
        }
      }
    } else {
      console.log("Failed to generate commit message.");
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
