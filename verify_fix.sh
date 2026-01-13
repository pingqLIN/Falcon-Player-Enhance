#!/bin/bash
# Manual Verification Script for Popup Player Fix
# This script helps verify that all changes are working correctly

echo "🎬 Shield Pro - Popup Player Fix Verification"
echo "=============================================="
echo ""

# Check if files exist
echo "1. Checking modified files..."
files=(
    "content/inject-blocker.js"
    "content/anti-popup.js"
    "content/player-enhancer.js"
    "background.js"
    "popup-player/popup-player.js"
    "tests/test-popup-player.html"
)

all_exist=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file exists"
    else
        echo "   ❌ $file missing"
        all_exist=false
    fi
done

echo ""
echo "2. Checking for key code patterns..."

# Check for isInternalElement function
if grep -q "function isInternalElement" content/inject-blocker.js; then
    echo "   ✅ isInternalElement() function found in inject-blocker.js"
else
    echo "   ❌ isInternalElement() function NOT found"
fi

# Check for chrome-extension:// whitelist
if grep -q "chrome-extension://" content/inject-blocker.js; then
    echo "   ✅ chrome-extension:// whitelist found"
else
    echo "   ❌ chrome-extension:// whitelist NOT found"
fi

# Check for data-shield-internal attribute
if grep -q "data-shield-internal" content/player-enhancer.js; then
    echo "   ✅ data-shield-internal attribute added to button"
else
    echo "   ❌ data-shield-internal attribute NOT found"
fi

# Check for openPopupPlayer handler in background
if grep -q "openPopupPlayer" background.js; then
    echo "   ✅ openPopupPlayer message handler found in background.js"
else
    echo "   ❌ openPopupPlayer handler NOT found"
fi

# Check for chrome.windows.create
if grep -q "chrome.windows.create" background.js; then
    echo "   ✅ chrome.windows.create() usage found"
else
    echo "   ❌ chrome.windows.create() NOT found"
fi

# Check for unique window ID generation
if grep -q "popup-player-.*Date.now()" content/player-enhancer.js; then
    echo "   ✅ Unique window ID generation found"
else
    echo "   ❌ Unique window ID generation NOT found"
fi

# Check for depth limit in parent traversal
if grep -q "maxDepth" content/inject-blocker.js; then
    echo "   ✅ Depth limit added to parent traversal"
else
    echo "   ❌ Depth limit NOT found"
fi

echo ""
echo "3. Security checks..."

# Check that we're not disabling all defenses
if grep -q "lockWindowOpen()" content/inject-blocker.js; then
    echo "   ✅ window.open blocking still active"
else
    echo "   ⚠️  lockWindowOpen may be disabled"
fi

if grep -q "isClickjackingLayer" content/inject-blocker.js; then
    echo "   ✅ Clickjacking detection still active"
else
    echo "   ⚠️  Clickjacking detection may be disabled"
fi

echo ""
echo "=============================================="
echo "Verification complete!"
echo ""
echo "📋 Manual Testing Steps:"
echo "   1. Load extension in Chrome (chrome://extensions/)"
echo "   2. Open tests/test-popup-player.html"
echo "   3. Wait for players to be detected (3-5 sec)"
echo "   4. Hover over video → 🎬 button should appear"
echo "   5. Click 🎬 → popup window should open"
echo "   6. Try multiple popups simultaneously"
echo "   7. Click 'Test Malicious Popup' → should be blocked"
echo "   8. Check console for logs"
echo ""
echo "📊 Expected Console Messages:"
echo "   - '🎬 Popup Player Instance ID: popup-player-...'"
echo "   - '✅ 彈窗視窗已開啟 (Window ID: ...)'"
echo "   - '🛡️ 允許內部擴充功能彈窗: chrome-extension://...'"
echo "   - '🛡️ 已阻擋 window.open: https://example.com' (for test)"
echo ""
