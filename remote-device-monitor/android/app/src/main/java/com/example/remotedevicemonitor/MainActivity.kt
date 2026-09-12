package com.example.remotedevicemonitor

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.edit
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.navigation.fragment.NavHostFragment
import com.example.remotedevicemonitor.data.local.KeystoreManager
import com.example.remotedevicemonitor.databinding.ActivityMainBinding
import com.example.remotedevicemonitor.service.DeviceMonitorService
import com.example.remotedevicemonitor.service.RemoteControlService
import com.example.remotedevicemonitor.service.ScreenCaptureService

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var navController: androidx.navigation.NavController

    /** Tracks whether this is the very first run (first launch after install) */
    private var isFirstLaunch = false

    // ── Activity Result Launchers ─────────────────────────────────────────────

    /** Screen capture MediaProjection launcher */
    private val mediaProjectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == RESULT_OK && result.data != null) {
            ScreenCaptureService.setSavedMediaProjection(result.resultCode, result.data!!)
            val intent = ScreenCaptureService.startIntent(this, result.resultCode, result.data!!)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        }
        applyStartDestination()
    }

    /** Runtime permission launcher (camera, notifications, etc.) */
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        val denied = granted.filter { !it.value }.keys
        if (denied.isNotEmpty()) {
            Log.w(TAG, "Permissions denied: $denied")
        }
        // Continue through permission chain regardless — user can fix later
        step2BatteryOptimization()
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val navHost = supportFragmentManager
            .findFragmentById(R.id.nav_host_fragment) as NavHostFragment
        navController = navHost.navController

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        isFirstLaunch = !prefs.getBoolean(KEY_PERMISSIONS_REQUESTED, false)

        if (isFirstLaunch) {
            // Mark as done so we don't prompt every launch
            prefs.edit { putBoolean(KEY_PERMISSIONS_REQUESTED, true) }
            // Show a friendly intro dialog before starting the permission chain
            showPermissionIntroDialog()
        } else {
            // Not first launch — just refresh the screen share if needed
            refreshScreenShareIfNeeded()
        }
    }

    override fun onResume() {
        super.onResume()
        // When returning from Settings (overlay, battery, accessibility), continue the chain
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val step = prefs.getString(KEY_PERMISSION_STEP, null)
        if (step != null) {
            prefs.edit { remove(KEY_PERMISSION_STEP) }
            when (step) {
                STEP_OVERLAY       -> step4Accessibility()
                STEP_BATTERY       -> step3Overlay()
                STEP_ACCESSIBILITY -> step5ScreenShare()
                STEP_FILES         -> step3Overlay()
            }
        }
    }

    // ── Permission Chain ──────────────────────────────────────────────────────

    /**
     * Step 0 — Show a friendly intro dialog explaining what permissions are needed
     * and why before beginning the permission request sequence.
     */
    private fun showPermissionIntroDialog() {
        AlertDialog.Builder(this, R.style.AlertDialogTheme)
            .setTitle("📱 Setup Permissions")
            .setMessage(
                "DevicePulse needs a few permissions to work properly:\n\n" +
                "• 📷 Camera — for QR code pairing\n" +
                "• 🔔 Notifications — to show ongoing monitoring status\n" +
                "• 🔋 Battery Optimization — to keep monitoring alive in background\n" +
                "• 🗂️ Storage — to browse files remotely\n" +
                "• 🖼️ Screen Share — for live screen mirroring\n" +
                "• ♿ Accessibility — for remote touch control\n\n" +
                "You'll be guided through each step. Some will open Android Settings — " +
                "just enable the option and press Back to continue."
            )
            .setPositiveButton("Get Started") { _, _ ->
                step1RuntimePermissions()
            }
            .setCancelable(false)
            .show()
    }

    /**
     * Step 1 — Request standard runtime permissions (Camera, Notifications, etc.)
     */
    private fun step1RuntimePermissions() {
        val needed = mutableListOf<String>()

        // Camera (QR code pairing)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.CAMERA)
        }
        // Notifications (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        // Read media (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_IMAGES)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_VIDEO)
            }
        }
        // Legacy storage (Android <= 9)
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }

        if (needed.isEmpty()) {
            step2BatteryOptimization()
        } else {
            permissionLauncher.launch(needed.toTypedArray())
        }
    }

    /**
     * Step 2 — Request battery optimization exemption so the foreground service
     * stays alive when the screen turns off.
     */
    private fun step2BatteryOptimization() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            // Save current step so onResume() can continue after user returns from Settings
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit { putString(KEY_PERMISSION_STEP, STEP_BATTERY) }
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
                return
            } catch (e: Exception) {
                Log.w(TAG, "Battery optimization exemption intent failed: ${e.message}")
            }
        }
        step3Overlay()
    }

    /**
     * Step 3 — Request "Draw Over Other Apps" (overlay) permission. Required for
     * launching apps from the background and floating remote control indicator.
     */
    private fun step3Overlay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(this)) {
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit { putString(KEY_PERMISSION_STEP, STEP_OVERLAY) }
                AlertDialog.Builder(this, R.style.AlertDialogTheme)
                    .setTitle("🖼️ Draw Over Apps Permission")
                    .setMessage(
                        "DevicePulse needs the 'Draw Over Other Apps' permission to launch apps " +
                        "remotely and show the remote control overlay.\n\n" +
                        "On the next screen, find 'DevicePulse' and toggle it ON, then press Back."
                    )
                    .setPositiveButton("Open Settings") { _, _ ->
                        try {
                            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                                data = Uri.parse("package:$packageName")
                            })
                        } catch (e: Exception) {
                            Log.w(TAG, "Overlay settings failed: ${e.message}")
                            step4Accessibility()
                        }
                    }
                    .setCancelable(false)
                    .show()
                return
            }
        }
        step4Accessibility()
    }

    /**
     * Step 4 — Prompt the user to enable the Accessibility Service for remote touch control.
     * This is the most critical permission for the remote control feature.
     */
    private fun step4Accessibility() {
        if (!RemoteControlService.isAccessibilityServiceEnabled(this)) {
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit { putString(KEY_PERMISSION_STEP, STEP_ACCESSIBILITY) }
            AlertDialog.Builder(this, R.style.AlertDialogTheme)
                .setTitle("♿ Enable Remote Control")
                .setMessage(
                    "To let the web dashboard control this phone remotely (tap, swipe, " +
                    "hardware keys), DevicePulse needs the Accessibility Service enabled.\n\n" +
                    "On the next screen:\n" +
                    "1. Tap 'DevicePulse'\n" +
                    "2. Toggle the switch ON\n" +
                    "3. Tap 'Allow'\n" +
                    "4. Press Back to return here.\n\n" +
                    "You can skip this step — remote control just won't work without it."
                )
                .setPositiveButton("Open Accessibility Settings") { _, _ ->
                    try {
                        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                    } catch (e: Exception) {
                        Log.w(TAG, "Accessibility settings failed: ${e.message}")
                        step5ScreenShare()
                    }
                }
                .setNegativeButton("Skip") { _, _ ->
                    step5ScreenShare()
                }
                .setCancelable(false)
                .show()
            return
        }
        step5ScreenShare()
    }

    /**
     * Step 5 — Request MediaProjection (screen share) permission.
     * This is shown ONCE at first launch. The token is persisted so subsequent
     * reboots don't re-prompt.
     */
    private fun step5ScreenShare() {
        // Already has an active projection session — skip
        if (ScreenCaptureService.hasActiveProjectionSession()) {
            applyStartDestination()
            return
        }

        val projMgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
        if (projMgr != null) {
            AlertDialog.Builder(this, R.style.AlertDialogTheme)
                .setTitle("📺 Screen Share Permission")
                .setMessage(
                    "DevicePulse needs permission to capture your screen for live mirroring.\n\n" +
                    "Tap 'Allow' on the next system dialog to enable screen sharing. " +
                    "This is required to mirror your screen on the web dashboard."
                )
                .setPositiveButton("Grant Screen Share") { _, _ ->
                    try {
                        mediaProjectionLauncher.launch(projMgr.createScreenCaptureIntent())
                    } catch (e: Exception) {
                        Log.w(TAG, "Screen capture intent failed: ${e.message}")
                        applyStartDestination()
                    }
                }
                .setNegativeButton("Skip") { _, _ ->
                    applyStartDestination()
                }
                .setCancelable(false)
                .show()
            return
        }
        applyStartDestination()
    }

    // ── Non-first-launch screen share refresh ─────────────────────────────────

    /**
     * On subsequent launches, silently check if screen share needs to be re-granted
     * (e.g. after a reboot clears the MediaProjection token).
     */
    private fun refreshScreenShareIfNeeded() {
        if (!ScreenCaptureService.hasActiveProjectionSession()) {
            val projMgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
            if (projMgr != null) {
                try {
                    mediaProjectionLauncher.launch(projMgr.createScreenCaptureIntent())
                    return
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to launch screen capture intent: ${e.message}")
                }
            }
        }
        applyStartDestination()
    }

    // ── Start Destination ─────────────────────────────────────────────────────

    private fun applyStartDestination() {
        val keystoreManager = KeystoreManager(this)
        val graph = navController.navInflater.inflate(R.navigation.nav_graph)

        if (keystoreManager.isPaired()) {
            // Already paired → Auto-start DeviceMonitorService to connect to dashboard immediately
            val serviceIntent = Intent(this, DeviceMonitorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
            graph.setStartDestination(R.id.deviceStatusFragment)
        } else {
            // Not paired → start at welcome flow
            graph.setStartDestination(R.id.welcomeFragment)
        }

        navController.graph = graph
    }

    companion object {
        private const val TAG = "MainActivity"
        private const val PREFS_NAME = "devicepulse_setup"
        private const val KEY_PERMISSIONS_REQUESTED = "permissions_requested"
        private const val KEY_PERMISSION_STEP = "pending_permission_step"

        // Permission step identifiers
        private const val STEP_BATTERY       = "battery"
        private const val STEP_OVERLAY       = "overlay"
        private const val STEP_ACCESSIBILITY = "accessibility"
        private const val STEP_FILES         = "files"
    }
}
