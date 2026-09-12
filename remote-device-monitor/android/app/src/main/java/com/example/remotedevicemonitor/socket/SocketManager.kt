package com.example.remotedevicemonitor.socket

import android.os.Build
import android.util.Log
import com.example.remotedevicemonitor.data.local.KeystoreManager
import com.example.remotedevicemonitor.service.RemoteControlService
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URISyntaxException

/**
 * SocketManager — manages secure real-time Socket.IO communication with the backend.
 * Features:
 * - Exponential backoff reconnection strategy
 * - Device authentication (device:authenticate)
 * - Heartbeat emitter (device:heartbeat)
 * - Battery telemetry emitter (device:battery)
 * - Storage telemetry emitter (device:storage)
 * - Graceful disconnect signaling (device:disconnect)
 */
class SocketManager(private val keystoreManager: KeystoreManager) {

    private var socket: Socket? = null

    private var kickedCallback: (() -> Unit)? = null
    private val screenStartCallbacks = java.util.concurrent.CopyOnWriteArrayList<() -> Unit>()
    private val screenStopCallbacks  = java.util.concurrent.CopyOnWriteArrayList<() -> Unit>()

    private var filesListCallback: ((path: String?, filter: String?) -> Unit)? = null
    private var filesGetCallback: ((path: String, thumbnailOnly: Boolean) -> Unit)? = null
    private var appsListCallback: (() -> Unit)? = null
    private var appsLaunchCallback: ((packageName: String) -> Unit)? = null
    private var remoteInputCallback: ((type: String, data: JSONObject) -> Unit)? = null

    fun setKickedCallback(callback: () -> Unit) {
        kickedCallback = callback
    }

    fun setScreenStartCallback(callback: () -> Unit) {
        if (!screenStartCallbacks.contains(callback)) {
            screenStartCallbacks.add(callback)
        }
    }

    fun setScreenStopCallback(callback: () -> Unit) {
        if (!screenStopCallbacks.contains(callback)) {
            screenStopCallbacks.add(callback)
        }
    }

    fun setFilesListCallback(callback: (path: String?, filter: String?) -> Unit) {
        filesListCallback = callback
    }

    fun setFilesGetCallback(callback: (path: String, thumbnailOnly: Boolean) -> Unit) {
        filesGetCallback = callback
    }

    fun setAppsListCallback(callback: () -> Unit) {
        appsListCallback = callback
    }

    fun setAppsLaunchCallback(callback: (packageName: String) -> Unit) {
        appsLaunchCallback = callback
    }

    fun setRemoteInputCallback(callback: (type: String, data: JSONObject) -> Unit) {
        remoteInputCallback = callback
    }

    fun connect() {
        if (socket?.connected() == true) return

        val candidates = keystoreManager.getCandidateUrls().ifEmpty { listOf(SOCKET_URL_FALLBACK) }
        connectWithUrl(candidates, 0)
    }

    private fun connectWithUrl(candidates: List<String>, index: Int) {
        val url = candidates[index]
        try {
            val token = keystoreManager.getDeviceToken() ?: keystoreManager.getAccessToken()
            val opts = IO.Options().apply {
                transports = arrayOf("websocket", "polling")
                reconnection = false  // We handle failover manually across IPs
                if (token != null) {
                    auth = mapOf("token" to token)
                }
            }

            Log.d(TAG, "Attempting connection to: $url (candidate ${index + 1}/${candidates.size})")

            socket?.off()
            socket?.disconnect()

            socket = IO.socket(url, opts).apply {
                on(Socket.EVENT_CONNECT) {
                    Log.d(TAG, "Socket connected to $url id=${id()}")
                    keystoreManager.saveServerUrl(url)

                    // Enable built-in reconnection now that we found a working server
                    // Authenticate immediately
                    val activeToken = keystoreManager.getDeviceToken() ?: keystoreManager.getAccessToken()
                    val deviceId = keystoreManager.getDeviceId()
                    if (activeToken != null) {
                        emitAuthenticate(activeToken, deviceId)
                    }
                }

                on(Socket.EVENT_DISCONNECT) { args ->
                    Log.d(TAG, "Socket disconnected: ${args.firstOrNull()}")
                }

                on(Socket.EVENT_CONNECT_ERROR) { args ->
                    Log.w(TAG, "Connection error on $url: ${args.firstOrNull()}")

                    // Failover: try the next candidate IP
                    if (index < candidates.size - 1) {
                        Log.d(TAG, "Failing over to next candidate...")
                        connectWithUrl(candidates, index + 1)
                    } else {
                        Log.e(TAG, "All candidate server URLs exhausted.")
                    }
                }

                on("device:error") { args ->
                    Log.e(TAG, "Received device:error from server: ${args.firstOrNull()}")
                }

                on("device:heartbeat:ack") { args ->
                    Log.d(TAG, "Received heartbeat ack: ${args.firstOrNull()}")
                }

                on("device:kicked") { args ->
                    Log.w(TAG, "Device was force-disconnected by dashboard: ${args.firstOrNull()}")
                    kickedCallback?.invoke()
                }

                on("screen:start") { _ ->
                    Log.d(TAG, "Received screen:start from server (listeners=${screenStartCallbacks.size})")
                    for (cb in screenStartCallbacks) {
                        try { cb.invoke() } catch (e: Exception) { Log.w(TAG, "screenStartCallback error: ${e.message}") }
                    }
                }

                on("screen:stop") { _ ->
                    Log.d(TAG, "Received screen:stop from server (listeners=${screenStopCallbacks.size})")
                    for (cb in screenStopCallbacks) {
                        try { cb.invoke() } catch (e: Exception) { Log.w(TAG, "screenStopCallback error: ${e.message}") }
                    }
                }

                on("files:list") { args ->
                    val obj = args.firstOrNull() as? JSONObject
                    val path = obj?.optString("path", "")
                    val filter = obj?.optString("filter", "all")
                    Log.d(TAG, "Received files:list path=$path filter=$filter")
                    filesListCallback?.invoke(path, filter)
                }

                on("files:get") { args ->
                    val obj = args.firstOrNull() as? JSONObject
                    val path = obj?.optString("path", "").orEmpty()
                    val thumbOnly = obj?.optBoolean("thumbnailOnly", false) ?: false
                    Log.d(TAG, "Received files:get path=$path thumbOnly=$thumbOnly")
                    filesGetCallback?.invoke(path, thumbOnly)
                }

                on("apps:list") { _ ->
                    Log.d(TAG, "Received apps:list from server")
                    appsListCallback?.invoke()
                }

                on("apps:launch") { args ->
                    val obj = args.firstOrNull() as? JSONObject
                    val pkg = obj?.optString("packageName", "").orEmpty()
                    Log.d(TAG, "Received apps:launch packageName=$pkg")
                    appsLaunchCallback?.invoke(pkg)
                }

                on("remote:input") { args ->
                    val obj = args.firstOrNull() as? JSONObject ?: return@on
                    val type = obj.optString("type", "")
                    Log.d(TAG, "Received remote:input type=$type")
                    // Dispatch directly to RemoteControlService if available
                    dispatchRemoteInput(type, obj)
                    // Also notify any registered callback
                    remoteInputCallback?.invoke(type, obj)
                }

                connect()
            }
        } catch (e: URISyntaxException) {
            Log.e(TAG, "Invalid socket URL: $url", e)
            // Try next candidate
            if (index < candidates.size - 1) {
                connectWithUrl(candidates, index + 1)
            }
        }
    }

    /**
     * Emit device:authenticate to backend with token
     */
    fun emitAuthenticate(token: String, deviceId: String? = null) {
        if (socket?.connected() != true) return
        val payload = JSONObject().apply {
            put("token", token)
            if (deviceId != null) {
                put("deviceId", deviceId)
            }
        }
        socket?.emit("device:authenticate", payload)
        Log.d(TAG, "Emitted device:authenticate")
    }

    /**
     * Emit device:heartbeat to notify backend that device is active & online
     */
    fun emitHeartbeat(deviceId: String? = null) {
        if (socket?.connected() != true) return
        val payload = JSONObject().apply {
            if (deviceId != null) put("deviceId", deviceId)
            put("timestamp", System.currentTimeMillis().toString())
        }
        socket?.emit("device:heartbeat", payload)
        Log.d(TAG, "Emitted device:heartbeat")
    }

    /**
     * Emit device:battery with detailed battery statistics
     */
    fun emitBattery(
        percentage: Int,
        isCharging: Boolean,
        temperatureCelsius: Float = 0f,
        voltageMillivolts: Int = 0,
        deviceId: String? = null
    ) {
        if (socket?.connected() != true) return
        val payload = JSONObject().apply {
            if (deviceId != null) put("deviceId", deviceId)
            put("percentage", percentage)
            put("charging", isCharging)
            put("temperature", temperatureCelsius.toDouble())
            put("voltage", voltageMillivolts)
            put("timestamp", System.currentTimeMillis().toString())
        }
        socket?.emit("device:battery", payload)
        Log.d(TAG, "Emitted device:battery pct=$percentage charging=$isCharging temp=$temperatureCelsius")
    }

    /**
     * Emit device:storage with detailed disk usage
     */
    fun emitStorage(
        totalBytes: Long,
        usedBytes: Long,
        availableBytes: Long,
        deviceId: String? = null
    ) {
        if (socket?.connected() != true) return
        val usedGb = usedBytes.toDouble() / (1024.0 * 1024.0 * 1024.0)
        val totalGb = totalBytes.toDouble() / (1024.0 * 1024.0 * 1024.0)
        val payload = JSONObject().apply {
            if (deviceId != null) put("deviceId", deviceId)
            put("totalBytes", totalBytes)
            put("usedBytes", usedBytes)
            put("availableBytes", availableBytes)
            put("storageUsedGb", usedGb)
            put("storageTotalGb", totalGb)
            put("timestamp", System.currentTimeMillis().toString())
        }
        socket?.emit("device:storage", payload)
        Log.d(TAG, "Emitted device:storage usedGb=$usedGb totalGb=$totalGb")
    }

    /**
     * Whether the socket is currently connected to the server.
     */
    fun isConnected(): Boolean = socket?.connected() == true

    /**
     * Emit device:disconnect and gracefully close connection.
     * Use this when the user explicitly unpairs/logs out.
     */
    fun disconnect(reason: String = "SERVICE_STOPPED", deviceId: String? = null) {
        socket?.apply {
            if (connected()) {
                val payload = JSONObject().apply {
                    if (deviceId != null) put("deviceId", deviceId)
                    put("reason", reason)
                }
                emit("device:disconnect", payload)
                Log.d(TAG, "Emitted device:disconnect reason=$reason")
            }
            off()
            disconnect()
        }
        socket = null
    }

    /**
     * Silently drop the socket connection without emitting device:disconnect.
     * Use this when the service is temporarily killed by the OS and will be
     * restarted — the backend will detect the drop via heartbeat timeout.
     */
    fun disconnectSilently() {
        socket?.apply {
            off()
            disconnect()
        }
        socket = null
        Log.d(TAG, "Socket silently disconnected (OS restart pending)")
    }

    /**
     * Emit legacy unified telemetry for backward compatibility
     */
    fun emitTelemetry(
        batteryPct: Int,
        isCharging: Boolean,
        storageUsedGb: Double,
        storageTotalGb: Double
    ) {
        if (socket?.connected() != true) return
        val deviceId = keystoreManager.getDeviceId()
        val payload = JSONObject().apply {
            if (deviceId != null) put("deviceId", deviceId)
            put("battery", batteryPct)
            put("charging", isCharging)
            put("storageUsedGb", storageUsedGb)
            put("storageTotalGb", storageTotalGb)
            put("timestamp", System.currentTimeMillis().toString())
        }
        socket?.emit("device:telemetry", payload)
        Log.d(TAG, "Emitted device:telemetry battery=$batteryPct% charging=$isCharging")
    }

    /**
     * Emit directory listing / photos response
     */
    fun emitFilesListResponse(path: String, files: org.json.JSONArray, error: String? = null) {
        if (socket?.connected() != true) return
        val payload = JSONObject().apply {
            val deviceId = keystoreManager.getDeviceId()
            if (deviceId != null) put("deviceId", deviceId)
            put("path", path)
            put("files", files)
            if (error != null) put("error", error)
        }
        socket?.emit("files:list:response", payload)
    }

    /**
     * Emit file content / photo dataUrl response
     */
    fun emitFilesGetResponse(
        path: String,
        name: String,
        size: Long,
        mimeType: String,
        dataUrl: String?,
        error: String? = null
    ) {
        if (socket?.connected() != true) return
        val payload = JSONObject().apply {
            val deviceId = keystoreManager.getDeviceId()
            if (deviceId != null) put("deviceId", deviceId)
            put("path", path)
            put("name", name)
            put("size", size)
            put("mimeType", mimeType)
            if (dataUrl != null) put("dataUrl", dataUrl)
            if (error != null) put("error", error)
        }
        socket?.emit("files:get:response", payload)
    }

    /**
     * Emit installed apps list response
     */
    fun emitAppsListResponse(apps: org.json.JSONArray, error: String? = null) {
        if (socket?.connected() != true) return
        val payload = JSONObject().apply {
            val deviceId = keystoreManager.getDeviceId()
            if (deviceId != null) put("deviceId", deviceId)
            put("apps", apps)
            if (error != null) put("error", error)
        }
        socket?.emit("apps:list:response", payload)
    }

    /**
     * Emit app launch result response
     */
    fun emitAppsLaunchResponse(packageName: String, success: Boolean, error: String? = null) {
        if (socket?.connected() != true) return
        val payload = JSONObject().apply {
            val deviceId = keystoreManager.getDeviceId()
            if (deviceId != null) put("deviceId", deviceId)
            put("packageName", packageName)
            put("success", success)
            if (error != null) put("error", error)
        }
        socket?.emit("apps:launch:response", payload)
    }

    /**
     * Emit screen:frame with JPEG dataUrl to the dashboard
     */
    fun emitScreenFrame(dataUrl: String, width: Int, height: Int) {
        if (socket?.connected() != true) return
        val deviceId = keystoreManager.getDeviceId()
        val payload = JSONObject().apply {
            if (deviceId != null) put("deviceId", deviceId)
            // Field must be "image" — this is what the backend relay and frontend both expect
            put("image", dataUrl)
            put("width", width)
            put("height", height)
            put("timestamp", System.currentTimeMillis())
        }
        socket?.emit("screen:frame", payload)
    }

    /**
     * Convert normalized coordinates (0.0–1.0) and dispatch to RemoteControlService.
     * Coordinates from the dashboard are normalized against the phone's display dimensions.
     */
    @Suppress("DEPRECATION")
    private fun dispatchRemoteInput(type: String, data: JSONObject) {
        val svc = RemoteControlService.instance ?: run {
            Log.w(TAG, "remote:input received but RemoteControlService is not running")
            return
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            Log.w(TAG, "remote:input requires Android 7.0+ (API 24)")
            return
        }

        // Get actual screen dimensions for coordinate mapping
        val wm = svc.getSystemService(android.content.Context.WINDOW_SERVICE) as android.view.WindowManager
        val (screenW, screenH) = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            Pair(bounds.width().toFloat(), bounds.height().toFloat())
        } else {
            val dm = android.util.DisplayMetrics()
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(dm)
            Pair(dm.widthPixels.toFloat(), dm.heightPixels.toFloat())
        }

        when (type) {
            "click" -> {
                val nx = data.optDouble("x", 0.5)
                val ny = data.optDouble("y", 0.5)
                val px = (nx * screenW).toFloat()
                val py = (ny * screenH).toFloat()
                svc.dispatchClick(px, py)
            }
            "longpress" -> {
                val nx = data.optDouble("x", 0.5)
                val ny = data.optDouble("y", 0.5)
                val px = (nx * screenW).toFloat()
                val py = (ny * screenH).toFloat()
                svc.dispatchLongPress(px, py)
            }
            "swipe" -> {
                val nx1 = data.optDouble("x1", 0.5)
                val ny1 = data.optDouble("y1", 0.5)
                val nx2 = data.optDouble("x2", 0.5)
                val ny2 = data.optDouble("y2", 0.5)
                val duration = data.optLong("durationMs", 300L)
                svc.dispatchSwipe(
                    (nx1 * screenW).toFloat(),
                    (ny1 * screenH).toFloat(),
                    (nx2 * screenW).toFloat(),
                    (ny2 * screenH).toFloat(),
                    duration
                )
            }
            "key" -> {
                val action = data.optString("key", "")
                svc.performKey(action)
            }
            "text" -> {
                val text = data.optString("text", "")
                svc.inputText(text)
            }
            else -> Log.w(TAG, "Unknown remote:input type: $type")
        }
    }

    companion object {

        private const val TAG = "SocketManager"
        /** Ultimate fallback if KeystoreManager returns no candidates */
        private const val SOCKET_URL_FALLBACK = "http://192.168.1.4:3000"

        @Volatile
        private var instance: SocketManager? = null

        fun getInstance(keystoreManager: KeystoreManager): SocketManager {
            return instance ?: synchronized(this) {
                instance ?: SocketManager(keystoreManager).also { instance = it }
            }
        }
    }
}
