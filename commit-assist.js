#!/usr/bin/env node

const { exec } = require("child_process");
const { promisify } = require("util");
const { Ollama } = require("ollama");
const readline = require("readline");
const fs = require("fs");

const execAsync = promisify(exec);

// Fetch recent commit messages
async function getRecentCommits() {
  try {
    const { stdout } = await execAsync("git log -n 3 --oneline");
    return stdout.trim();
  } catch {
    return "";
  }
}

// Fetch current branch name
async function getBranchName() {
  try {
    const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD");
    return stdout.trim();
  } catch {
    return "";
  }
}

// Summarize the diff by listing changed files
function summarizeDiff(gitDiff) {
  const fileMatches = [...gitDiff.matchAll(/^diff --git a\/(.+?) b\/.+$/gm)];
  const files = fileMatches.map((match) => match[1]);
  return files.length
    ? `Files changed: ${files.join(", ")}`
    : "No files changed";
}

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
  -pt, --prompt-template <path>       Path to custom prompt template markdown file

Examples:
  commit-assist
  commit-assist -ctx "fix login bug"
  commit-assist -cf -tid "PROJ-123"
  commit-assist -t "fix" -ctx "authentication issue"
  commit-assist -m "codellama:latest" -c
  commit-assist -pt ./my-custom-prompt.md
`);
}

// Helper function to validate prompt template
function validatePromptTemplate(template) {
  const requiredPlaceholders = [
    "{gitStagedChanges}",
    "{gitDiff}",
    "{userContext}",
    "{recentCommits}",
    "{branchName}",
    "{gitDiffSummary}",
    "{conventionalText}",
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
      "Required placeholders: {gitStagedChanges}, {gitDiff}, {userContext}, {recentCommits}, {branchName}, {gitDiffSummary}, {conventionalText}"
    );
    process.exit(1);
  }

  return true;
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
    const maxBuffer = 10 * 1024 * 1024; // 10 MB
    const [statusResult, diffResult] = await Promise.all([
      execAsync("git diff --cached --name-status", { maxBuffer }),
      execAsync("git diff --cached", { maxBuffer }),
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

// Helper function to fill template placeholders with values from an object
function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in values ? values[key] : match;
  });
}

// Helper function to load the prompt template from a custom path or default prompt.md
function loadPromptTemplate(customPath = null) {
  const path = require("path");
  let templatePath;
  if (customPath) {
    templatePath = path.isAbsolute(customPath)
      ? customPath
      : path.join(process.cwd(), customPath);
    // Validate the path exists and is a file
    if (!fs.existsSync(templatePath) || !fs.statSync(templatePath).isFile()) {
      console.error(
        `❌ Prompt template path does not exist or is not a file: ${templatePath}`
      );
      process.exit(1);
    }
  } else {
    templatePath = path.join(__dirname, "prompt.md");
  }
  try {
    return fs.readFileSync(templatePath, "utf8");
  } catch (e) {
    console.error(
      `❌ Could not load prompt template at ${templatePath}:`,
      e.message
    );
    process.exit(1);
  }
}

async function generateCommitMessage(
  gitData,
  args,
  userContext = "",
  useConventional = false,
  promptTemplate = null // New parameter
) {
  try {
    // Prepare all possible values for template replacement
    const values = {
      gitStagedChanges: gitData.gitStagedChanges,
      gitDiff: gitData.gitDiff,
      userContext,
      recentCommits: args.recentCommits || "",
      branchName: args.branchName || "",
      gitDiffSummary: args.gitDiffSummary || "",
      conventionalText: useConventional
        ? "Use the Conventional Commits format (type: scope: subject)."
        : "Do not use Conventional Commit types (e.g., feat:, fix:, docs:).",
    };

    let prompt;
    if (promptTemplate) {
      prompt = fillTemplate(promptTemplate, values);
    } else if (args.promptTemplate) {
      // args.promptTemplate is now a file path
      const customTemplate = loadPromptTemplate(args.promptTemplate);
      validatePromptTemplate(customTemplate);
      prompt = fillTemplate(customTemplate, values);
    } else {
      const defaultTemplate = loadPromptTemplate();
      prompt = fillTemplate(defaultTemplate, values);
    }

    // Use Ollama library with streaming
    const ollama = new Ollama();
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
    // Only use the first line of the response, strip quotes/markdown, and trim
    let aiMessage = fullResponse
      .trim()
      .split("\n")[0]
      .replace(/^['"`]+|['"`]+$/g, "");
    // If the message is too generic or empty, warn the user
    if (
      !aiMessage ||
      aiMessage.toLowerCase().includes("commit message") ||
      aiMessage.length < 5
    ) {
      console.warn(
        "⚠️  AI returned a generic or empty message. Consider adding more context or editing manually."
      );
    }
    return aiMessage;
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

    // Fetch recent commits and branch name
    const [recentCommits, branchName] = await Promise.all([
      getRecentCommits(),
      getBranchName(),
    ]);
    const gitDiffSummary = summarizeDiff(gitData.gitDiff);

    // Build the improved prompt
    let promptTemplate = null;
    if (args.promptTemplate) {
      promptTemplate = loadPromptTemplate(args.promptTemplate);
      validatePromptTemplate(promptTemplate);
    } else {
      promptTemplate = loadPromptTemplate();
    }

    // Generate commit message
    console.log("Generating commit message...");
    const commitMessage = await generateCommitMessage(
      gitData,
      args,
      userContext,
      useConventional,
      promptTemplate // Pass the improved prompt
    );

    if (commitMessage) {
      // Remove quotes from start and end of commit message
      let cleanCommitMessage = commitMessage.replace(/^["']|["']$/g, "");

      // Enforce 80-character limit
      if (cleanCommitMessage.length > 80) {
        cleanCommitMessage = cleanCommitMessage.slice(0, 77) + "...";
      }

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

      // Show the generated message
      console.log("\nGenerated Commit Message:");
      console.log("\x1b[36m" + cleanCommitMessage + "\x1b[0m"); // Cyan color

      // If autoCopy is enabled, copy and exit immediately (no prompt to edit/regenerate)
      if (args.autoCopy) {
        const copySuccess = await copyToClipboard(cleanCommitMessage);
        console.log(
          copySuccess ? "✅ Copied to clipboard!" : "❌ Clipboard copy failed."
        );
        process.exit(0);
      }

      // Interactive refinement
      while (true) {
        const action = await getUserInput("Accept or regenerate? (a/r): ");
        if (action.trim().toLowerCase() === "r") {
          // Regenerate with same context
          const newMsg = await generateCommitMessage(
            gitData,
            args,
            userContext,
            useConventional,
            promptTemplate
          );
          cleanCommitMessage = newMsg.replace(/^(\["'])|(\["'])$/g, "");
          if (cleanCommitMessage.length > 80) {
            cleanCommitMessage = cleanCommitMessage.slice(0, 77) + "...";
          }
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
          console.log("\nRegenerated Commit Message:");
          console.log("\x1b[36m" + cleanCommitMessage + "\x1b[0m");
        } else if (action.trim().toLowerCase() === "a") {
          // Automatically copy to clipboard on accept
          const copySuccess = await copyToClipboard(cleanCommitMessage);
          console.log(
            copySuccess
              ? "✅ Copied to clipboard!"
              : "❌ Clipboard copy failed."
          );
          process.exit(0);
        } else {
          break;
        }
      }

      const copyResponse = await getUserInput("\nCopy to clipboard? (Y/n): ");
      const shouldCopy =
        copyResponse.trim().toLowerCase() !== "n" &&
        copyResponse.trim().toLowerCase() !== "no";

      if (shouldCopy) {
        const copySuccess = await copyToClipboard(cleanCommitMessage);
        console.log(
          copySuccess ? "✅ Copied to clipboard!" : "❌ Clipboard copy failed."
        );
      }
      process.exit(0);
    } else {
      console.log("Failed to generate commit message.");
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
