#!/usr/bin/env node

const { exec } = require("node:child_process");
const { promisify } = require("node:util");
const { Ollama } = require("ollama");
const readline = require("readline");
const fs = require("node:fs");
const path = require("node:path");
const { consola } = require("consola");

const execAsync = promisify(exec);

// Create a custom debug logger with teal background
const debugLogger = consola.withTag("DEBUG").withDefaults({
  formatOptions: {
    colors: true,
    compact: false,
  },
});

// Helper for debug logging
function debugLog(debug, ...args) {
  if (debug) {
    // Use ANSI escape codes for teal background and black text on tag only
    const background = "\x1b[48;5;10m"; // Green background
    const blackText = "\x1b[30m"; // Black text
    const reset = "\x1b[0m"; // Reset colors
    const message = args.join(" ");
    debugLogger.info(`${background}${blackText} DEBUG ${reset} ${message}`);
  }
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
    } else if (args[i] === "--debug") {
      result.debug = true;
    }
  }
  return result;
}

// Helper function to display help information
function showHelp() {
  consola.box(`
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

// Fetch recent commit messages
async function getRecentCommits(debug) {
  try {
    const maxBuffer = 1024 * 1024; // 1 MB
    const { stdout } = await execAsync("git log -n 3 --oneline", {
      maxBuffer,
    });
    return stdout.trim();
  } catch (err) {
    debugLog(debug, "Error in getRecentCommits:", err);
    return "";
  }
}

// Fetch current branch name
async function getBranchName(debug) {
  try {
    const maxBuffer = 1024 * 1024; // 1 MB
    const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
      maxBuffer,
    });
    return stdout.trim();
  } catch (err) {
    debugLog(debug, "Error in getBranchName:", err);
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
    (placeholder) => !template.includes(placeholder),
  );

  if (missingPlaceholders.length > 0) {
    consola.error(
      `Invalid prompt template. Missing required placeholders: ${missingPlaceholders.join(
        ", ",
      )}`,
    );
    consola.error(
      "Required placeholders: {gitStagedChanges}, {gitDiff}, {userContext}, {recentCommits}, {branchName}, {gitDiffSummary}, {conventionalText}",
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
async function getGitData(debug) {
  try {
    const maxBuffer = 10 * 1024 * 1024; // 10 MB
    // Check if we're in a git repository
    try {
      await execAsync("git rev-parse --is-inside-work-tree", { maxBuffer });
    } catch (err) {
      consola.error(
        "Not a git repository. Please run this script inside a git repo.",
      );
      debugLog(debug, "git rev-parse error:", err);
      process.exit(1);
    }
    // Fast check: are there any staged changes?
    try {
      await execAsync("git diff --cached --quiet", { maxBuffer });
    } catch (err) {
      // There are staged changes (git diff --cached --quiet exits with 1 if there are changes)
      if (err.code !== 1) {
        debugLog(debug, "Error in git diff --cached --quiet:", err);
      }
    }
    // Get both name-status and full diff in parallel
    let statusResult, diffResult;
    try {
      [statusResult, diffResult] = await Promise.all([
        execAsync("git diff --cached --name-status", { maxBuffer }),
        execAsync("git diff --cached", { maxBuffer }),
      ]);
    } catch (err) {
      debugLog(debug, "Error fetching git diff:", err);
      throw err;
    }
    const gitStagedChanges = statusResult.stdout;
    const gitDiff = diffResult.stdout;
    if (!gitStagedChanges.trim()) {
      // No staged changes
      return {
        gitStagedChanges: "",
        gitDiff: "",
        hasStaged: false,
      };
    }
    return {
      gitStagedChanges: gitStagedChanges.trim(),
      gitDiff: gitDiff.trim(),
      hasStaged: true,
    };
  } catch (error) {
    consola.error("Git error in getGitData:", error.message);
    debugLog(debug, "getGitData error:", error);
    throw error;
  }
}

// Helper function to copy text to clipboard (cross-platform)
async function copyToClipboard(text) {
  try {
    const clipboardy = await import("clipboardy");
    await clipboardy.default.write(text);
    return true;
  } catch (error) {
    consola.error("Clipboard copy failed:", error.message);
    return false;
  }
}

// Helper function to get user input from command line
async function getUserInput(question) {
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
  let templatePath;
  if (customPath) {
    templatePath = path.isAbsolute(customPath)
      ? customPath
      : path.join(process.cwd(), customPath);
    // Validate the path exists and is a file
    if (!fs.existsSync(templatePath) || !fs.statSync(templatePath).isFile()) {
      consola.error(
        `Prompt template path does not exist or is not a file: ${templatePath}`,
      );
      process.exit(1);
    }
  } else {
    templatePath = path.join(__dirname, "prompt.md");
  }
  try {
    return fs.readFileSync(templatePath, "utf8");
  } catch (e) {
    consola.error(
      `Could not load prompt template at ${templatePath}:`,
      e.message,
    );
    process.exit(1);
  }
}

async function generateCommitMessage(
  gitData,
  args,
  recentCommits,
  branchName,
  gitDiffSummary,
  userContext = "",
  useConventional = false,
  promptTemplate = null, // New parameter
) {
  const debug = args.debug;
  try {
    // Prepare all possible values for template replacement
    const values = {
      gitStagedChanges: gitData.gitStagedChanges,
      gitDiff: gitData.gitDiff,
      userContext,
      recentCommits: recentCommits || "",
      branchName: branchName || "",
      gitDiffSummary: gitDiffSummary || "",
      conventionalText: useConventional
        ? "Use the Conventional Commits format (type: scope: subject)."
        : "Do not use Conventional Commit types (e.g., feat:, fix:, docs:).",
      examples: useConventional
        ? `
- feat(auth): add OAuth2 login support for Google accounts
- fix: correct user ID validation in registration endpoint
- refactor: extract shared logic into utility functions
- docs: update README with setup instructions for new contributors
- style: reformat codebase with Prettier
- chore: bump dependencies to latest minor versions
- test: add unit tests for payment processing module
- perf: optimize image loading for faster page render
        `
        : `
- Add OAuth2 login support for Google accounts
- Correct user ID validation in registration endpoint
- Extract shared logic into utility functions
- Update README with setup instructions for new contributors
- Reformat codebase with Prettier
- Upgrade dependencies to latest minor versions
- Add unit tests for payment processing module
- Optimize image loading for faster page render
`,
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
    debugLog(debug, "Prompt sent to AI:\n", prompt);
    // Use Ollama library with streaming
    const ollama = new Ollama();
    let response;
    try {
      response = await ollama.generate({
        model: args.model || "llama3.2:latest",
        prompt: prompt,
        stream: true,
      });
    } catch (err) {
      debugLog(debug, "Error from Ollama generate:", err);
      throw err;
    }
    let fullResponse = "";
    try {
      for await (const part of response) {
        if (part.response) {
          fullResponse += part.response;
        }
        if (part.done) {
          break;
        }
      }
    } catch (err) {
      debugLog(debug, "Error streaming Ollama response:", err);
      throw err;
    }
    // Only use the first line of the response, strip quotes/markdown, and trim
    let aiMessage = fullResponse
      .trim()
      .split("\n")[0]
      .replace(/^['"`]+|['"`]+$/g, "")
      .replace(/\s+/g, " ");
    // If the message is too generic or empty, warn the user
    if (
      !aiMessage ||
      aiMessage.toLowerCase().includes("commit message") ||
      aiMessage.length < 5
    ) {
      consola.warn(
        "⚠️  AI returned a generic or empty message. Consider adding more context or editing manually.",
      );
      debugLog(debug, "AI full response:", fullResponse);
    }
    return aiMessage;
  } catch (error) {
    consola.error("Error generating commit message:", error.message);
    debugLog(debug, "generateCommitMessage error:", error);
    throw error;
  }
  return aiMessage;
}

// Helper function to clean and format a commit message
function cleanAndFormatMessage(message, args) {
  // Remove quotes from start and end of commit message
  let cleanMessage = message
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");

  // Uncomment this to enforce character limit
  // if (cleanMessage.length > 90) {
  //   cleanMessage = cleanMessage.slice(0, 87) + "...";
  // }

  // Apply custom conventional type if provided
  if (args.conventionalType !== undefined) {
    cleanMessage = applyCustomConventionalType(
      cleanMessage,
      args.conventionalType,
    );
  }

  // Add ticket number if provided
  if (args.ticketID) {
    cleanMessage = formatCommitMessage(cleanMessage, args.ticketID);
  }

  return cleanMessage;
}

// Helper function to refine commit message interactively
async function refineCommitMessage(initialMessage, args) {
  const cleanCommitMessage = cleanAndFormatMessage(initialMessage, args);
  consola.success("Regenerated Commit Message:");
  consola.box(cleanCommitMessage);
  return cleanCommitMessage;
}

// Main execution
async function main() {
  try {
    // Parse CLI arguments once at the start
    const args = parseArgs();
    const debug = args.debug;

    // Determine if conventional commits should be used
    const useConventional =
      args.useAiConventional !== undefined
        ? args.useAiConventional
        : (args.conventionalType ?? false);

    // Get git data first (fast exit if no changes)
    consola.info("Checking staged changes...");
    const gitData = await getGitData(debug);

    // Get user context - either from CLI or interactive prompt
    let userContext = "";
    if (args.context !== undefined) {
      userContext = args.context;
      consola.info(`Using context: "${userContext}"`);
    } else {
      userContext = await getUserInput(
        "Enter any additional context (optional): ",
      );
    }

    // Fetch recent commits and branch name
    const [recentCommits, branchName] = await Promise.all([
      getRecentCommits(debug),
      getBranchName(debug),
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
    consola.start("Generating commit message...");
    const commitMessage = await generateCommitMessage(
      gitData,
      args,
      recentCommits,
      branchName,
      gitDiffSummary,
      userContext,
      useConventional,
      promptTemplate,
    );

    if (commitMessage) {
      // Clean and format the message
      let cleanCommitMessage = cleanAndFormatMessage(commitMessage, args);

      // Show the generated message
      consola.success("Generated Commit Message:");
      consola.box(cleanCommitMessage);

      // If autoCopy is enabled, copy and exit immediately (no prompt to edit/regenerate)
      if (args.autoCopy) {
        const copySuccess = await copyToClipboard(cleanCommitMessage);
        copySuccess
          ? consola.success("Copied to clipboard!")
          : consola.error("Clipboard copy failed.");
        process.exit(0);
      }

      // Interactive refinement
      while (true) {
        const action = await getUserInput(
          "Accept, regenerate, or quit? (a/r/q): ",
        );
        if (action.trim().toLowerCase() === "r") {
          // Regenerate with same context
          consola.start("Generating commit message...");
          const newMsg = await generateCommitMessage(
            gitData,
            args,
            recentCommits,
            branchName,
            gitDiffSummary,
            userContext,
            useConventional,
            promptTemplate,
          );
          cleanCommitMessage = await refineCommitMessage(
            newMsg,
            gitData,
            args,
            recentCommits,
            branchName,
            gitDiffSummary,
            userContext,
            useConventional,
            promptTemplate,
          );
        } else if (action.trim().toLowerCase() === "a" || action === "") {
          // Automatically copy to clipboard on accept
          const copySuccess = await copyToClipboard(cleanCommitMessage);
          copySuccess
            ? consola.success("Copied to clipboard!")
            : consola.error("Clipboard copy failed.");
          process.exit(0);
        } else if (action.trim().toLowerCase() === "q") {
          consola.info("Quitting without copying commit message.");
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
        copySuccess
          ? consola.success("Copied to clipboard!")
          : consola.error("Clipboard copy failed.");
      }
      process.exit(0);
    } else {
      consola.error("Failed to generate commit message.");
    }
  } catch (error) {
    consola.error("Error:", error.message);
    process.exit(1);
  }
}

// Execute the main function
main();
