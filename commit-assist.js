#!/usr/bin/env node

const { exec, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Ollama } = require("ollama");
const readline = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
const { consola } = require("consola");

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:3b";

// Create a custom debug logger
const debugLogger = consola.withTag("DEBUG").withDefaults({
  formatOptions: {
    colors: true,
    compact: false,
  },
});

// Helper for debug logging
function debugLog(debug, ...args) {
  if (debug) {
    // Use ANSI escape codes for green background and black text on tag only
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

  const result = {
    provider: "ollama", // Default provider
    model: DEFAULT_OLLAMA_MODEL, // Default model
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      showHelp();
      process.exit(0);
    } else if (args[i] === "--provider" || args[i] === "-p") {
      result.provider = args[i + 1] || "ollama";
      i++;
    } else if (args[i] === "--context" || args[i] === "-ctx") {
      result.context = args[i + 1] || "";
      i++; // Skip the next argument as it's the value
    } else if (args[i] === "--conventional-format" || args[i] === "-cf") {
      result.useAiConventional = true;
    } else if (args[i] === "--no-append-ticket" || args[i] === "-nat") {
      result.noAppendTicket = true;
      i++;
    } else if (args[i] === "--type" || args[i] === "-t") {
      result.conventionalType = args[i + 1] || "";
      i++; // Skip the next argument as it's the value
    } else if (args[i] === "--ticketid" || args[i] === "-tid") {
      result.ticketID = args[i + 1] || "";
      i++; // Skip the next argument as it's the value
    } else if (args[i] === "--copy" || args[i] === "-c") {
      result.autoCopy = true;
    } else if (args[i] === "--api-key" || args[i] === "-k") {
      result.apiKey = args[i + 1] || "";
      i++;
    } else if (args[i] === "--model" || args[i] === "-m") {
      result.model = args[i + 1] || "";
      i++;
    } else if (args[i] === "--prompt-template" || args[i] === "-pt") {
      result.promptTemplate = args[i + 1] || "";
      i++; // Skip the next argument as it's the value
    } else if (args[i] === "--debug") {
      result.debug = true;
    }
  }

  // Auto-detect OpenRouter if env var is present and provider not explicitly set
  if (!result.apiKey && process.env.OPENROUTER_API_KEY) {
    result.apiKey = process.env.OPENROUTER_API_KEY;
    // If user didn't specify a provider but has the key, we could default to openrouter
    // But let's keep it explicit or check if they changed the provider
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
    (placeholder) => !template.includes(placeholder)
  );

  if (missingPlaceholders.length > 0) {
    consola.error(
      `Invalid prompt template. Missing required placeholders: ${missingPlaceholders.join(
        ", "
      )}`
    );
    consola.error(
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

// Helper function to get git status and smart diff
async function getGitData(debug) {
  try {
    const maxBuffer = 10 * 1024 * 1024; // 10 MB

    // Check if repo exists
    try {
      await execAsync("git rev-parse --is-inside-work-tree", { maxBuffer });
    } catch (err) {
      consola.error(
        "Not a git repository. Please run this script inside a git repo."
      );
      process.exit(1);
    }

    // Get Staged Files Names
    const { stdout: statusOutput } = await execAsync(
      "git diff --cached --name-only",
      { maxBuffer }
    );
    const stagedFiles = statusOutput.trim().split("\n").filter(Boolean);

    if (stagedFiles.length === 0) {
      return { gitStagedChanges: "", gitDiff: "", hasStaged: false };
    }

    // Filter out lockfiles from the content diff to save tokens/memory
    const filesToDiff = stagedFiles.filter(
      (f) =>
        !f.match(/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock)/)
    );

    let gitDiff = "";
    if (filesToDiff.length > 0) {
      // Limit diff to specific files that aren't lockfiles
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "--cached", "--", ...filesToDiff],
        { maxBuffer }
      );
      gitDiff = stdout.trim();
    } else {
      gitDiff = "(Lockfiles only changed - diff suppressed to save tokens)";
    }

    // Hard limit on diff characters (approx 20k chars) to prevent context overflow
    if (gitDiff.length > 20000) {
      gitDiff = gitDiff.slice(0, 20000) + "\n... (Diff truncated due to size)";
    }

    return {
      gitStagedChanges: statusOutput.trim(), // Keep full file list for context
      gitDiff: gitDiff,
      hasStaged: true,
    };
  } catch (error) {
    consola.error("Git error:", error.message);
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
        `Prompt template path does not exist or is not a file: ${templatePath}`
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
      e.message
    );
    process.exit(1);
  }
}

async function callOpenRouter(prompt, model, apiKey, debug) {
  if (!apiKey) {
    throw new Error(
      "OpenRouter API key is required. Use --api-key or set OPENROUTER_API_KEY env var."
    );
  }

  // Default to a cheap, fast model if the user didn't specify one
  // Note: OpenRouter requires "provider/model-name" format usually
  const targetModel =
    model === "llama3.2:latest"
      ? "meta-llama/llama-3.2-3b-instruct:free"
      : model;

  debugLog(debug, `Calling OpenRouter with model: ${targetModel}`);

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/your-username/commit-assist", // Optional: OpenRouter asks for this
          "X-Title": "Commit Assist Script", // Optional
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    // Extract message
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    } else {
      throw new Error("OpenRouter returned no choices.");
    }
  } catch (error) {
    debugLog(debug, "OpenRouter Fetch Error:", error);
    throw error;
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
  promptTemplate = null // New parameter
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
      ticketID: args.ticketID || "",
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

    let fullResponse = "";

    if (args.provider === "openrouter") {
      // call OpenRouter
      consola.start(`Connecting to OpenRouter (${args.model || "default"})...`);
      fullResponse = await callOpenRouter(
        prompt,
        args.model,
        args.apiKey,
        debug
      );
    } else {
      // Default: call Ollama (Existing Logic)
      consola.start(
        `Connecting to local Ollama (${args.model || "default"})...`
      );
      const ollama = new Ollama();
      const response = await ollama.generate({
        model: args.model || DEFAULT_OLLAMA_MODEL,
        prompt: prompt,
        stream: false, // Turn off streaming for simplicity to match OpenRouter logic, or keep it if you prefer
      });
      fullResponse = response.response;
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
        "⚠️  AI returned a generic or empty message. Consider adding more context or editing manually."
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
      args.conventionalType
    );
  }

  if (args.ticketID && !args.noAppendTicket) {
    cleanMessage = formatCommitMessage(cleanMessage, args.ticketID);
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
    const args = parseArgs();
    const debug = args.debug;

    const useConventional =
      args.useAiConventional !== undefined
        ? args.useAiConventional
        : args.conventionalType ?? false;

    consola.info("Checking staged changes...");
    const gitData = await getGitData(debug);

    if (!gitData.hasStaged) {
      consola.warn(
        "No staged changes found. Stage files with 'git add' first."
      );
      process.exit(0);
    }

    let userContext = args.context;
    if (userContext === undefined) {
      userContext = await getUserInput(
        "Enter any additional context (optional): "
      );
    }

    const [recentCommits, branchName] = await Promise.all([
      getRecentCommits(debug),
      getBranchName(debug),
    ]);
    const gitDiffSummary = summarizeDiff(gitData.gitDiff);

    let promptTemplate;
    if (args.promptTemplate) {
      promptTemplate = loadPromptTemplate(args.promptTemplate);
      validatePromptTemplate(promptTemplate);
    } else {
      promptTemplate = loadPromptTemplate();
    }

    consola.start("Generating commit message...");

    // Initial Generation
    let currentCommitMessage = await generateCommitMessage(
      gitData,
      args,
      recentCommits,
      branchName,
      gitDiffSummary,
      userContext,
      useConventional,
      promptTemplate
    );

    // Main Interactive Loop
    while (true) {
      if (!currentCommitMessage) {
        consola.error("Failed to generate message.");
        process.exit(1);
      }

      // 1. Format the message
      const formattedMessage = cleanAndFormatMessage(
        currentCommitMessage,
        args
      );

      // 2. Display
      consola.success("Generated Commit Message:");
      consola.box(formattedMessage);

      // 3. Auto-copy check
      if (args.autoCopy) {
        const copySuccess = await copyToClipboard(formattedMessage);
        copySuccess
          ? consola.success("Copied to clipboard!")
          : consola.error("Copy failed.");
        process.exit(0);
      }

      // 4. Interactive prompt
      const action = await getUserInput(
        "Action? [Enter] to Accept, (r)egenerate, (q)uit: "
      );
      const choice = action.trim().toLowerCase();

      if (choice === "r") {
        consola.start("Regenerating...");
        currentCommitMessage = await generateCommitMessage(
          gitData,
          args,
          recentCommits,
          branchName,
          gitDiffSummary,
          userContext,
          useConventional,
          promptTemplate
        );
        // Loop continues, creating a new formatted message next iteration
      } else if (choice === "q") {
        consola.info("Cancelled.");
        process.exit(0);
      } else {
        // Accept (default)
        const copySuccess = await copyToClipboard(formattedMessage);
        copySuccess
          ? consola.success("Copied to clipboard!")
          : consola.error("Copy failed.");
        process.exit(0);
      }
    }
  } catch (error) {
    consola.error("Error:", error.message);
    process.exit(1);
  }
}

// Execute the main function
main();
