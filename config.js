// config.js
const CONFIG = {
    // Time in seconds for the countdown timer
    TIMER_DURATION: 4
};

// Make CONFIG available to other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}
