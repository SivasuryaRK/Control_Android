package com.example.remotedevicemonitor.service

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.example.remotedevicemonitor.DeviceMonitorApp
import com.example.remotedevicemonitor.MainActivity
import com.example.remotedevicemonitor.R
import com.example.remotedevicemonitor.data.local.KeystoreManager
import com.example.remotedevicemonitor.socket.SocketManager
import com.example.remotedevicemonitor.util.DeviceInfoUtil
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * DeviceMonitorService — persistent foreground service that:
 * 1. Connects Socket.IO to the backend using device token credentials
 * 2. Emits periodic device:heartbeat, device:battery, device:storage telemetry every 2s
 * 3. Automatically reconnects if the socket drops (exponential backoff)
 * 4. Stays alive even when the app UI is closed (START_STICKY + foreground notification)
 * 5. Only stops when the user explicitly unpairs or logs out
 * 6. Auto-restarts after phone reboot via BootReceiver
 */
class DeviceMonitorService : LifecycleService() {

    private lateinit var socketManager: SocketManager
    private lateinit var keystoreManager: KeystoreManager

    private var telemetryJob: Job? = null
    private var reconnectJob: Job? = null
    private var isMonitoring = false
    private var wakeLock: android.os.PowerManager.WakeLock? = null
    private var batteryReceiver: android.content.BroadcastReceiver? = null

    override fun onCreate() {
        super.onCreate()
        keystoreManager = KeystoreManager(this)
        socketManager   = SocketManager.getInstance(keystoreManager)
        registerBatteryReceiver()
    }

    private fun registerBatteryReceiver() {
        try {
            batteryReceiver = object : android.content.BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    DeviceInfoUtil.updateFromIntent(intent)
                }
            }
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            registerReceiver(batteryReceiver, filter)
        } catch (e: Exception) {
            Log.w(TAG, "registerBatteryReceiver failed: ${e.message}")
        }
    }

    /**
     * Called by the system when service is started.
     * Also called with intent=null when system restarts us after being killed (START_STICKY).
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_STOP -> {
                stopMonitoring()
                return START_NOT_STICKY  // Don't restart after explicit stop
            }
            else -> {
                // ACTION_START or intent==null (system restart via START_STICKY)
                if (!isMonitoring) {
                    if (keystoreManager.isPaired()) {
                        startMonitoring()
                    } else {
                        // Not paired yet — nothing to do, stop self
                        stopSelf()
                    }
                }
            }
        }
        return START_STICKY  // System restarts us if killed
    }

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    override fun onDestroy() {
        Log.d(TAG, "Service destroyed — will be restarted by system (START_STICKY)")
        telemetryJob?.cancel()
        reconnectJob?.cancel()
        try {
            batteryReceiver?.let { unregisterReceiver(it) }
        } catch (_: Exception) {}
        batteryReceiver = null
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (_: Exception) {}
        wakeLock = null
        // Don't send device:disconnect here — the system will restart us.
        // Socket will timeout on backend which triggers device:offline after heartbeat gap.
        socketManager.disconnectSilently()
        isMonitoring = false
        super.onDestroy()
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private fun startMonitoring() {
        if (isMonitoring) return
        isMonitoring = true

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
        Log.d(TAG, "Monitoring started. Connecting socket...")

        try {
            val pm = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            wakeLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "DevicePulse:MonitorWakeLock").apply {
                setReferenceCounted(false)
                acquire(12 * 60 * 60 * 1000L) // 12 hours max
            }
        } catch (e: Exception) {
            Log.w(TAG, "WakeLock acquire error: ${e.message}")
        }

        // When the dashboard force-disconnects this device: stop service and clear credentials
        socketManager.setKickedCallback {
            Log.w(TAG, "Kicked by dashboard — clearing credentials and stopping service")
            keystoreManager.clearAll()
            telemetryJob?.cancel()
            reconnectJob?.cancel()
            isMonitoring = false
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }

        socketManager.connect()
        setupRemoteAccessHandlers()
        startTelemetryLoop()
        startReconnectWatcher()
    }

    /**
     * Telemetry loop: emits heartbeat + battery + storage every 2 seconds.
     * The loop continues regardless of socket state — SocketManager guards
     * against emitting when not connected.
     */
    private fun startTelemetryLoop() {
        telemetryJob?.cancel()
        telemetryJob = lifecycleScope.launch {
            while (isActive) {
                try {
                    val deviceId = keystoreManager.getDeviceId()

                    socketManager.emitHeartbeat(deviceId = deviceId)

                    val battery = DeviceInfoUtil.getBatteryInfo(applicationContext)
                    socketManager.emitBattery(
                        percentage         = battery.percentage,
                        isCharging         = battery.isCharging,
                        temperatureCelsius = battery.temperatureCelsius,
                        voltageMillivolts  = battery.voltageMillivolts,
                        deviceId           = deviceId
                    )

                    val storage = DeviceInfoUtil.getStorageInfo()
                    socketManager.emitStorage(
                        totalBytes     = storage.totalBytes,
                        usedBytes      = storage.usedBytes,
                        availableBytes = storage.availableBytes,
                        deviceId       = deviceId
                    )

                    val usedGb  = storage.usedBytes.toDouble()  / 1_073_741_824.0
                    val totalGb = storage.totalBytes.toDouble() / 1_073_741_824.0
                    socketManager.emitTelemetry(
                        batteryPct     = battery.percentage,
                        isCharging     = battery.isCharging,
                        storageUsedGb  = usedGb,
                        storageTotalGb = totalGb
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Telemetry loop error: ${e.message}")
                }
                delay(TELEMETRY_INTERVAL_MS)
            }
        }
    }

    /**
     * Reconnect watcher: checks every 5s if the socket is disconnected and
     * tries to reconnect with exponential backoff (5s → 10s → 20s → max 60s).
     */
    private fun startReconnectWatcher() {
        reconnectJob?.cancel()
        reconnectJob = lifecycleScope.launch {
            var backoffMs = RECONNECT_INITIAL_MS
            while (isActive) {
                delay(backoffMs)
                if (!socketManager.isConnected()) {
                    Log.d(TAG, "Socket disconnected — reconnecting (backoff=${backoffMs}ms)")
                    socketManager.connect()
                    backoffMs = minOf(backoffMs * 2, RECONNECT_MAX_MS)
                } else {
                    backoffMs = RECONNECT_INITIAL_MS  // Reset backoff on healthy connection
                }
            }
        }
    }

    private fun setupRemoteAccessHandlers() {
        // ── 1. Remote Files & Photos Explorer ──
        socketManager.setFilesListCallback { requestedPath, filter ->
            lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                try {
                    val rootDir = when {
                        !requestedPath.isNullOrBlank() -> java.io.File(requestedPath)
                        filter == "photos" -> android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DCIM)
                        filter == "downloads" -> android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
                        filter == "documents" -> android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOCUMENTS)
                        else -> android.os.Environment.getExternalStorageDirectory()
                    }

                    val jsonArray = org.json.JSONArray()
                    val filesList = mutableListOf<java.io.File>()

                    if (rootDir.exists() && rootDir.canRead()) {
                        val listed = rootDir.listFiles()
                        if (listed != null && listed.isNotEmpty()) {
                            filesList.addAll(listed)
                        }
                    }

                    // Fallback: If root storage listing returned no files, add standard public directories
                    if (filesList.isEmpty() && (requestedPath.isNullOrBlank() || requestedPath == "/storage/emulated/0" || requestedPath == "/")) {
                        val defaultFolders = listOf(
                            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DCIM),
                            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
                            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_PICTURES),
                            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOCUMENTS),
                            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_MOVIES),
                            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_MUSIC)
                        )
                        for (folder in defaultFolders) {
                            if (folder.exists()) {
                                filesList.add(folder)
                            }
                        }
                    }

                    // Sort: directories first, then alphabetical
                    val sorted = filesList.sortedWith(compareBy({ !it.isDirectory }, { it.name.lowercase() }))
                    for (f in sorted.take(300)) {
                        val item = org.json.JSONObject().apply {
                            put("name", f.name)
                            put("path", f.absolutePath)
                            put("size", if (f.isDirectory) 0L else f.length())
                            put("isDirectory", f.isDirectory)
                            put("lastModified", f.lastModified())
                            val mime = when (f.extension.lowercase()) {
                                "jpg", "jpeg" -> "image/jpeg"
                                "png" -> "image/png"
                                "gif" -> "image/gif"
                                "webp" -> "image/webp"
                                "mp4" -> "video/mp4"
                                "pdf" -> "application/pdf"
                                "txt" -> "text/plain"
                                else -> "application/octet-stream"
                            }
                            put("mimeType", mime)
                        }
                        jsonArray.put(item)
                    }

                    val activePath = if (rootDir.exists()) rootDir.absolutePath else (requestedPath ?: "/storage/emulated/0")
                    socketManager.emitFilesListResponse(activePath, jsonArray)
                } catch (e: Exception) {
                    Log.w(TAG, "Files list error: ${e.message}")
                    socketManager.emitFilesListResponse(requestedPath ?: "/", org.json.JSONArray(), e.message)
                }
            }
        }

        // ── 2. Remote File & Photo Download / Thumbnail ──
        socketManager.setFilesGetCallback { filePath, thumbnailOnly ->
            lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                try {
                    val file = java.io.File(filePath)
                    if (!file.exists() || !file.canRead() || file.isDirectory) {
                        socketManager.emitFilesGetResponse(filePath, file.name, 0L, "unknown", null, "File not found or unreadable")
                        return@launch
                    }

                    val ext = file.extension.lowercase()
                    val isImage = ext in listOf("jpg", "jpeg", "png", "webp", "gif")
                    val mime = when (ext) {
                        "jpg", "jpeg" -> "image/jpeg"
                        "png" -> "image/png"
                        "webp" -> "image/webp"
                        "gif" -> "image/gif"
                        "mp4" -> "video/mp4"
                        "pdf" -> "application/pdf"
                        "txt" -> "text/plain"
                        else -> "application/octet-stream"
                    }

                    if (thumbnailOnly && isImage) {
                        // Generate downscaled thumbnail for instant gallery preview
                        val bitmap = android.graphics.BitmapFactory.decodeFile(file.absolutePath)
                        if (bitmap != null) {
                            val scaled = android.graphics.Bitmap.createScaledBitmap(bitmap, 300, (300f * bitmap.height / bitmap.width).toInt(), true)
                            val out = java.io.ByteArrayOutputStream()
                            scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, out)
                            val b64 = android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
                            val dataUrl = "data:image/jpeg;base64,$b64"
                            bitmap.recycle()
                            scaled.recycle()
                            socketManager.emitFilesGetResponse(file.absolutePath, file.name, file.length(), mime, dataUrl)
                        } else {
                            socketManager.emitFilesGetResponse(filePath, file.name, file.length(), mime, null, "Could not decode thumbnail")
                        }
                    } else if (file.length() <= 35 * 1024 * 1024) { // Max 35MB via WebSocket stream
                        val bytes = file.readBytes()
                        val b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                        val dataUrl = "data:$mime;base64,$b64"
                        socketManager.emitFilesGetResponse(file.absolutePath, file.name, file.length(), mime, dataUrl)
                    } else {
                        socketManager.emitFilesGetResponse(filePath, file.name, file.length(), mime, null, "File exceeds 35MB direct streaming limit")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "File get error: ${e.message}")
                    socketManager.emitFilesGetResponse(filePath, "", 0L, "unknown", null, e.message)
                }
            }
        }

        // ── 3. Remote Apps List ──
        socketManager.setAppsListCallback {
            lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                try {
                    val pm = applicationContext.packageManager
                    val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                        addCategory(Intent.CATEGORY_LAUNCHER)
                    }
                    val resolveInfos = pm.queryIntentActivities(mainIntent, 0)
                    val appsArray = org.json.JSONArray()

                    for (info in resolveInfos) {
                        val appObj = org.json.JSONObject().apply {
                            put("name", info.loadLabel(pm).toString())
                            put("packageName", info.activityInfo.packageName)
                            try {
                                val pkgInfo = pm.getPackageInfo(info.activityInfo.packageName, 0)
                                put("versionName", pkgInfo.versionName ?: "1.0")
                                put("isSystemApp", (info.activityInfo.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0)
                            } catch (_: Exception) {}
                        }
                        appsArray.put(appObj)
                    }
                    socketManager.emitAppsListResponse(appsArray)
                } catch (e: Exception) {
                    Log.w(TAG, "Apps list error: ${e.message}")
                    socketManager.emitAppsListResponse(org.json.JSONArray(), e.message)
                }
            }
        }

        // ── 4. Remote App Launch ──
        socketManager.setAppsLaunchCallback { packageName ->
            lifecycleScope.launch(kotlinx.coroutines.Dispatchers.Main) {
                try {
                    val pm = applicationContext.packageManager
                    val launchIntent = pm.getLaunchIntentForPackage(packageName)
                    if (launchIntent != null) {
                        launchIntent.addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED or
                            Intent.FLAG_ACTIVITY_CLEAR_TOP or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP
                        )
                        applicationContext.startActivity(launchIntent)
                        socketManager.emitAppsLaunchResponse(packageName, true)
                    } else {
                        socketManager.emitAppsLaunchResponse(packageName, false, "Launch intent not found for $packageName")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "App launch error: ${e.message}")
                    socketManager.emitAppsLaunchResponse(packageName, false, e.message)
                }
            }
        }
    }

    private fun stopMonitoring() {
        Log.d(TAG, "Explicit stop requested")
        telemetryJob?.cancel()
        reconnectJob?.cancel()
        socketManager.disconnect(reason = "USER_UNPAIRED")
        isMonitoring = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun buildNotification(): Notification {
        val tapIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, DeviceMonitorApp.CHANNEL_MONITOR)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle("DevicePulse — Monitoring Active")
            .setContentText("Live telemetry streaming to your dashboard")
            .setContentIntent(tapIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        private const val TAG = "DeviceMonitorService"
        const val ACTION_START = "com.example.remotedevicemonitor.START_MONITOR"
        const val ACTION_STOP  = "com.example.remotedevicemonitor.STOP_MONITOR"
        private const val NOTIFICATION_ID        = 1001
        private const val TELEMETRY_INTERVAL_MS  = 2_000L    // 2s live updates
        private const val RECONNECT_INITIAL_MS   = 5_000L    // 5s initial reconnect wait
        private const val RECONNECT_MAX_MS       = 60_000L   // 60s max backoff

        fun startIntent(context: Context) =
            Intent(context, DeviceMonitorService::class.java).apply { action = ACTION_START }

        fun stopIntent(context: Context) =
            Intent(context, DeviceMonitorService::class.java).apply { action = ACTION_STOP }
    }
}
