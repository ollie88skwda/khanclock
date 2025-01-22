// content.js
let countdown;
let timeLeft = null; // Initialize as null to detect first start
let isTimerRunning = false;
let lastUrl = location.href;
let lastQuestionId = "";
let navigationTimeout = null;
let lastTimerReset = 0;
const TIMER_RESET_COOLDOWN = 1000; // 1 second cooldown
let isInitialStart = true; // Flag to track first start
let isSkipping = false; // Flag to track if we're in the process of skipping
let hasConnectionError = false; // Flag to track popup connection errors
let countdownInterval = null;

// Debug logging function
function debugLog(message, data = {}) {
  const state = {
    timeLeft,
    isTimerRunning,
    hasCountdown: !!countdown,
    currentUrl: location.href,
    lastUrl,
    lastQuestionId,
    isInitialStart,
    isSkipping,
    ...data,
  };
  console.log(`[DEBUG] ${message}`, state);
}

// Function to safely send messages to chrome runtime
function safeSendMessage(message) {
  try {
    chrome.runtime.sendMessage({
      ...message,
      isRunning: isTimerRunning,
      time: timeLeft
    });
  } catch (error) {
    debugLog("Error sending message:", { error: error.message });
  }
}

// Update timer display and notify popup
async function updateTimerDisplay() {
    try {
        chrome.runtime.sendMessage({
            action: 'updateCountdown',
            time: timeLeft,
            isRunning: isTimerRunning,
            skipped: false
        }).catch(error => {
            // Only log connection errors, don't set flag
            if (error.message.includes("Receiving end does not exist")) {
                debugLog("Popup is closed, will retry on next update");
            } else {
                throw error;
            }
        });
    } catch (error) {
        debugLog("Error updating timer display:", { error: error.message });
    }
}

// Timer tick function
function timerTick() {
    if (!isTimerRunning || timeLeft <= 0) return;

    timeLeft--;
    debugLog(timeLeft === CONFIG.TIMER_DURATION - 1 ? "Initial timer tick" : "Timer tick", {
        timeLeft,
        isTimerRunning,
        hasCountdown: !!countdown,
        currentUrl: window.location.href,
        lastUrl,
        questionTitle: undefined
    });

    updateTimerDisplay();

    if (timeLeft <= 0) {
        stopTimer();
        clickSkipButton();
    }
}

// Start countdown timer
function startCountdown() {
    if (isTimerRunning) return;
    
    debugLog("Starting countdown");
    isTimerRunning = true;
    hasConnectionError = false; // Reset connection error flag
    timeLeft = CONFIG.TIMER_DURATION;
    
    // Clear any existing interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    // Start new interval
    countdownInterval = setInterval(timerTick, 1000);
    updateTimerDisplay();
}

// Stop countdown timer
function stopTimer() {
    debugLog("Stopping timer");
    isTimerRunning = false;
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    updateTimerDisplay();
}

// Function to check if we're on a question page
function isQuestionPage() {
  debugLog("Checking if on question page");

  // Look for spans containing exactly "A", "B", "C", or "D"
  const answerSpans = Array.from(document.querySelectorAll("span")).filter(
    (span) => {
      const text = span.textContent.trim();
      return ["A", "B", "C", "D"].includes(text);
    }
  );

  // We need at least 3 of A, B, C, D to consider it a question page
  const hasEnoughAnswers = answerSpans.length >= 3;

  // Check if we're on a question page
  const questionTitle = document.querySelector('[data-test-id="question-title"]');
  
  // Check for "Ready to practice" text
  const readyToPractice = Array.from(document.querySelectorAll('h1, h2, h3, p'))
      .some(element => element.textContent.toLowerCase().includes('ready to practice'));
  
  // Return true only if we have a question title and are NOT on the ready to practice page
  return questionTitle && !readyToPractice && hasEnoughAnswers;
}

function resetTimer() {
  const now = Date.now();
  debugLog("Attempting timer reset", {
    timeSinceLastReset: now - lastTimerReset,
  });

  debugLog("Resetting timer");
  stopTimer();
  timeLeft = CONFIG.TIMER_DURATION;
  lastTimerReset = now;
  isInitialStart = false;
  startCountdown();
}

function clickSkipButton() {
  debugLog("Attempting to click skip button");
  const skipButton = document.querySelector(
    '[data-testid="exercise-skip-button"]'
  );
  if (skipButton) {
    debugLog("Found initial skip button");
    isSkipping = true; // Set skipping flag
    stopTimer(); // Stop the timer when auto-skipping too
    simulateClick(skipButton);

    // Wait for the confirmation dialog to appear and click the confirm button
    setTimeout(() => {
      if (clickConfirmSkip()) {
        debugLog("Successfully clicked confirm skip button");
        // Reset skipping flag after a brief delay to allow for navigation
        setTimeout(() => {
          isSkipping = false;
        }, 500);
      } else {
        debugLog("Could not find confirm skip button");
        isSkipping = false; // Reset flag if skip failed
      }
    }, 0);

    return true;
  }
  isSkipping = false; // Reset flag if no skip button found
  return false;
}

function simulateClick(element) {
  ["mousedown", "mouseup", "click"].forEach((eventType) => {
    const event = new MouseEvent(eventType, {
      view: window,
      bubbles: true,
      cancelable: true,
      buttons: 1,
    });
    element.dispatchEvent(event);
  });
}

function clickConfirmSkip() {
  debugLog("Attempting to click confirm skip button");
  // Look for the confirmation button with various possible selectors
  const confirmButtonSelectors = [
    '[data-test-id="skip-confirm-button"]',
    'button[aria-label="Yes, skip"]',
    // Dialog buttons are often in a dialog or modal element
    'div[role="dialog"] button',
    'div[role="modal"] button',
    // Fallback to all buttons
    "button",
  ];

  for (const selector of confirmButtonSelectors) {
    const buttons = document.querySelectorAll(selector);
    for (const button of buttons) {
      const buttonText = button.textContent.toLowerCase().trim();
      if (buttonText.includes("yes") && buttonText.includes("skip")) {
        debugLog("Found confirm skip button:", { buttonText });
        simulateClick(button);
        return true;
      }
    }
  }

  // Log all buttons for debugging
  debugLog("Available buttons:");
  document.querySelectorAll("button").forEach((button) => {
    console.log("Button text:", button.textContent.trim());
  });

  return false;
}

function checkAndStartTimer() {
  debugLog("Checking for question and starting timer");
  try {
    // Check if we're on a valid question page
    if (isQuestionPage()) {
      debugLog("Found question, starting timer");
      startCountdown();
      return true;
    } else {
      debugLog("No valid question found or on ready to practice page");
      return false;
    }
  } catch (error) {
    debugLog("Error checking for question:", { error: error.message });
    return false;
  }
}

// Initialize navigation observer
function initNavigationObserver() {
  debugLog("Initializing navigation observer");

  // Create an observer instance to watch for DOM changes
  const observer = new MutationObserver((mutations) => {
    let significantChange = false;

    for (const mutation of mutations) {
      // Only check added nodes that might contain answer spans
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Look for spans with A, B, C, D
            const answerSpans = node.querySelectorAll("span");
            for (const span of answerSpans) {
              const text = span.textContent.trim();
              if (["A", "B", "C", "D"].includes(text)) {
                significantChange = true;
                break;
              }
            }
            if (significantChange) break;
          }
        }
        if (significantChange) break;
      }
    }

    if (significantChange) {
      debugLog("Multiple choice answers detected");
      // Only reset timer if we're not currently skipping
      if (!isSkipping && isQuestionPage()) {
        debugLog("Question page confirmed after DOM change");
        resetTimer();
      }
    }
  });

  // Start observing with more specific options
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  });

  // Listen for next/check/let's go button clicks
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("button");
      if (!button) return;

      // Get all possible text content
      const buttonText = (button.textContent || "").toLowerCase().trim();
      const ariaLabel = (button.getAttribute("aria-label") || "").toLowerCase();
      const dialogText =
        button.closest('[role="dialog"]')?.textContent.toLowerCase() || "";
      const modalText =
        button
          .closest('[data-test-id="modal-content"]')
          ?.textContent.toLowerCase() || "";

      debugLog("Button clicked", {
        buttonText,
        ariaLabel,
        dialogText: dialogText.substring(0, 50),
        modalText: modalText.substring(0, 50),
        buttonClasses: button.className,
        buttonId: button.id,
        buttonRole: button.getAttribute("role"),
        parentRole: button.parentElement?.getAttribute("role"),
      });

      const isStartButton =
        buttonText.includes("let's go") ||
        buttonText.includes("Let's go") ||
        buttonText.includes("le") ||
        buttonText.includes("let's start") ||
        buttonText === "go" ||
        dialogText.includes("let's go") ||
        modalText.includes("let's go") ||
        buttonText.includes("start") ||
        dialogText.includes("start the section") ||
        modalText.includes("start the section");

      const isNextButton =
        buttonText.includes("next") ||
        buttonText.includes("check") ||
        buttonText.includes("let's") ||
        buttonText.includes("let") ||
        buttonText.includes("go") ||
        ariaLabel.includes("next");

      if (isStartButton) {
        debugLog("Start button clicked - forcing initial start", {
          buttonText,
          ariaLabel,
        });
        isSkipping = false; // Reset skipping flag
        isInitialStart = true; // Force start
        resetTimer();
      } else if (isNextButton) {
        debugLog("Next button clicked - normal reset", {
          buttonText,
          ariaLabel,
        });
        isSkipping = false; // Reset skipping flag
        resetTimer();
      }
    },
    true
  );

  // Add click event listener for skip button
  document.addEventListener("click", (event) => {
    // Check if clicked element or its parent is the skip button
    const skipButton = event.target.closest('[data-testid="exercise-skip-button"]');
    if (skipButton) {
      debugLog("Manual skip button click detected");
      stopTimer();
    }
  });
}

// Initialize when the page loads
debugLog("Content script loaded");
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    checkAndStartTimer();
    initNavigationObserver();
  });
} else {
  checkAndStartTimer();
  initNavigationObserver();
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        debugLog("Received message", { request });

        if (request.action === "ping") {
            debugLog("Received ping");
            sendResponse({ status: "ok" });
            return true;
        }

        if (request.action === "getTimerState") {
            debugLog("Received getTimerState request");
            sendResponse({
                timeLeft: timeLeft,
                isRunning: isTimerRunning
            });
            return true;
        }

        if (request.action === "checkForQuestion") {
            debugLog("Received checkForQuestion request");
            const result = checkAndStartTimer();
            sendResponse({ status: result ? "found_and_started" : "not_found" });
            return true;
        }

        if (request.action === "startTimer" && !isTimerRunning) {
            debugLog("Received startTimer request");
            startCountdown();
            sendResponse({ status: "started" });
            return true;
        }

        if (request.action === "skipQuestion") {
            debugLog("Received skipQuestion request");
            const skipped = clickSkipButton();
            sendResponse({ status: skipped ? "skipped" : "error" });
            return true;
        }

        if (request.action === "updateTimerDuration") {
            debugLog("Received updateTimerDuration request", { duration: request.duration });
            CONFIG.TIMER_DURATION = request.duration;
            // If timer is not running, update timeLeft as well
            if (!isTimerRunning) {
                timeLeft = request.duration;
                updateTimerDisplay();
            }
            sendResponse({ status: "updated" });
            return true;
        }

        sendResponse({ status: "unknown_action" });
        return true;
    } catch (error) {
        debugLog("Error handling message:", { error: error.message });
        sendResponse({ status: "error", error: error.message });
        return true;
    }
});
