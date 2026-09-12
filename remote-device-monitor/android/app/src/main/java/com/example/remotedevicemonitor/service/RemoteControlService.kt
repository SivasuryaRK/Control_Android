package com.example.remotedevicemonitor.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.annotation.RequiresApi

/**
 * RemoteControlService — AccessibilityService that allows the web dashboard to:
 *  - Inject touch taps and swipe gestures (Android 7.0+ / API 24+)
 *  - Perform global actions (Home, Back, Recents, Lock, Notifications, Volume)
 *  - Type text into the focused input field
 *
 * Enabled by user via Settings > Accessibility. Permission persists across reboots.
 */
class RemoteControlService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "RemoteControlService connected — remote control ready")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Not needed for remote control gestures
    }

    override fun onInterrupt() {
        Log.w(TAG, "RemoteControlService interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance === this) instance = null
        Log.i(TAG, "RemoteControlService destroyed")
    }

    // ── Tap / Click ──────────────────────────────────────────────────────────

    @RequiresApi(Build.VERSION_CODES.N)
    fun dispatchClick(x: Float, y: Float) {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 80L)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "Click dispatched at ($x, $y)")
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.w(TAG, "Click cancelled at ($x, $y)")
            }
        }, null)
    }

    // ── Long Press ───────────────────────────────────────────────────────────

    @RequiresApi(Build.VERSION_CODES.N)
    fun dispatchLongPress(x: Float, y: Float) {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 800L)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "LongPress dispatched at ($x, $y)")
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.w(TAG, "LongPress cancelled at ($x, $y)")
            }
        }, null)
    }

    // ── Swipe / Drag ─────────────────────────────────────────────────────────

    @RequiresApi(Build.VERSION_CODES.N)
    fun dispatchSwipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long) {
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val duration = durationMs.coerceIn(50L, 3000L)
        val stroke = GestureDescription.StrokeDescription(path, 0L, duration)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "Swipe dispatched ($x1,$y1)->($x2,$y2) duration=${duration}ms")
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.w(TAG, "Swipe cancelled")
            }
        }, null)
    }

    // ── Global Actions ────────────────────────────────────────────────────────

    fun performKey(action: String) {
        val globalAction = when (action.lowercase()) {
            "back"          -> GLOBAL_ACTION_BACK
            "home"          -> GLOBAL_ACTION_HOME
            "recents"       -> GLOBAL_ACTION_RECENTS
            "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
            "lock"          -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) GLOBAL_ACTION_LOCK_SCREEN else -1
            "power_dialog"  -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) GLOBAL_ACTION_POWER_DIALOG else -1
            "take_screenshot" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) GLOBAL_ACTION_TAKE_SCREENSHOT else -1
            else -> -1
        }
        if (globalAction >= 0) {
            performGlobalAction(globalAction)
            Log.d(TAG, "Global action performed: $action")
        } else {
            Log.w(TAG, "Unknown or unsupported key action: $action")
        }
    }

    // ── Text Injection ────────────────────────────────────────────────────────

    fun inputText(text: String) {
        val focusedNode = findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focusedNode != null) {
            val args = android.os.Bundle()
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            Log.d(TAG, "Text injected: '$text'")
        } else {
            Log.w(TAG, "No focused input found for text injection")
        }
    }

    companion object {
        private const val TAG = "RemoteControlService"

        @Volatile
        var instance: RemoteControlService? = null
            private set

        fun isEnabled(): Boolean = instance != null

        /** Returns true if the accessibility service is enabled in system settings */
        fun isAccessibilityServiceEnabled(context: android.content.Context): Boolean {
            val expectedId = "${context.packageName}/.service.RemoteControlService"
            val enabledServices = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: return false
            return enabledServices.split(":").any { it.equals(expectedId, ignoreCase = true) }
        }
    }
}
