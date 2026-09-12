package com.example.remotedevicemonitor.service

import android.app.Activity
import android.app.Notification
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import com.example.remotedevicemonitor.DeviceMonitorApp
import com.example.remotedevicemonitor.MainActivity
import com.example.remotedevicemonitor.R
import com.example.remotedevicemonitor.data.local.KeystoreManager
import com.example.remotedevicemonitor.socket.SocketManager
import java.io.ByteArrayOutputStream

/**
 * ScreenCaptureService — real-time foreground screen capture service.
 * Captures screen frames via MediaProjection -> VirtualDisplay -> ImageReader,
 * compresses to low-latency JPEG, and streams to the web dashboard over Socket.IO.
 *
 * Survives screen off/on and keeps the projection session ready in memory.
 */
class ScreenCaptureService : LifecycleService() {

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var handlerThread: HandlerThread? = null
    private var backgroundHandler: Handler? = null

    private lateinit var keystoreManager: KeystoreManager
    private lateinit var socketManager: SocketManager

    private var isCapturingActive = false
    private var isStreamingToDashboard = true
    private var lastFrameTime = 0L
    private val frameIntervalMs = 66L // ~15 FPS target for smooth, low-latency streaming

    private var screenStateReceiver: BroadcastReceiver? = null

    override fun onCreate() {
        super.onCreate()
        keystoreManager = KeystoreManager(this)
        socketManager = SocketManager.getInstance(keystoreManager)

        socketManager.setScreenStartCallback {
            Log.d(TAG, "Screen start command received from dashboard - activating live stream")
            isStreamingToDashboard = true
            if (!isCapturingActive || mediaProjection == null) {
                val code = savedResultCode
                val data = savedDataIntent
                if (code != null && data != null) {
                    startCapture(code, data)
                }
            }
        }

        socketManager.setScreenStopCallback {
            Log.d(TAG, "Screen stop command received from dashboard - pausing live stream (holding MediaProjection session)")
            isStreamingToDashboard = false
        }

        registerScreenStateReceiver()
    }

    private fun registerScreenStateReceiver() {
        screenStateReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    Intent.ACTION_SCREEN_ON -> {
                        Log.d(TAG, "Screen turned ON - ensuring virtual display is active")
                        if (isCapturingActive && isStreamingToDashboard) {
                            refreshVirtualDisplay()
                        }
                    }
                    Intent.ACTION_SCREEN_OFF -> {
                        Log.d(TAG, "Screen turned OFF - holding session ready")
                    }
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        }
        registerReceiver(screenStateReceiver, filter)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_START -> {
                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
                val data = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra<Intent>(EXTRA_DATA)
                }
                if (resultCode == Activity.RESULT_OK && data != null) {
                    savedResultCode = resultCode
                    savedDataIntent = data
                    startCapture(resultCode, data)
                } else if (savedResultCode != null && savedDataIntent != null) {
                    startCapture(savedResultCode!!, savedDataIntent!!)
                } else {
                    stopSelf()
                }
            }
            ACTION_STOP -> {
                isStreamingToDashboard = false
            }
            ACTION_DESTROY -> {
                stopCapture()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    override fun onDestroy() {
        try {
            screenStateReceiver?.let { unregisterReceiver(it) }
        } catch (_: Exception) {}
        stopCapture()
        super.onDestroy()
    }

    private fun startCapture(resultCode: Int, data: Intent) {
        if (isCapturingActive && mediaProjection != null) {
            isStreamingToDashboard = true
            return
        }
        isCapturingActive = true
        isStreamingToDashboard = true
        _isSharingRunning.value = true

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }

        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)

        // Scale resolution down for fast encoding and low bandwidth consumption (e.g. 540x960)
        val density = metrics.densityDpi
        val scale = 0.5f
        val width = ((metrics.widthPixels * scale).toInt() / 2) * 2
        val height = ((metrics.heightPixels * scale).toInt() / 2) * 2

        Log.d(TAG, "Starting screen capture: ${width}x${height} @ ${density}dpi")

        if (handlerThread == null) {
            handlerThread = HandlerThread("ScreenCaptureThread").apply { start() }
            backgroundHandler = Handler(handlerThread!!.looper)
        }

        imageReader?.close()
        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)

        val projMgr = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        try {
            mediaProjection = projMgr.getMediaProjection(resultCode, data)
        } catch (e: Exception) {
            Log.e(TAG, "Could not obtain MediaProjection: ${e.message}")
            stopCapture()
            return
        }

        mediaProjection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                Log.d(TAG, "MediaProjection stopped by OS")
                virtualDisplay?.release()
                virtualDisplay = null
                mediaProjection = null
                // Attempt restart using in-memory token if dashboard is still streaming
                if (isStreamingToDashboard && savedResultCode != null && savedDataIntent != null) {
                    try {
                        startCapture(savedResultCode!!, savedDataIntent!!)
                        return
                    } catch (e: Exception) {
                        Log.w(TAG, "Auto-restart after OS stop failed: ${e.message}")
                    }
                }
                stopCapture()
            }
        }, backgroundHandler)

        setupVirtualDisplay(width, height, density)
        setupImageReaderListener(width, height)
    }

    private fun setupVirtualDisplay(width: Int, height: Int, density: Int) {
        try {
            virtualDisplay?.release()
            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "DevicePulseMirror",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader?.surface,
                null,
                backgroundHandler
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error setting up VirtualDisplay: ${e.message}")
        }
    }

    private fun refreshVirtualDisplay() {
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)

        val density = metrics.densityDpi
        val scale = 0.5f
        val width = ((metrics.widthPixels * scale).toInt() / 2) * 2
        val height = ((metrics.heightPixels * scale).toInt() / 2) * 2

        setupVirtualDisplay(width, height, density)
    }

    private fun setupImageReaderListener(width: Int, height: Int) {
        imageReader?.setOnImageAvailableListener({ reader ->
            if (!isCapturingActive) return@setOnImageAvailableListener
            val now = System.currentTimeMillis()

            if (!isStreamingToDashboard) {
                // Drain latest image to keep buffer clear when dashboard is not watching
                reader.acquireLatestImage()?.close()
                return@setOnImageAvailableListener
            }

            if (now - lastFrameTime < frameIntervalMs) {
                // Throttle to target FPS
                reader.acquireLatestImage()?.close()
                return@setOnImageAvailableListener
            }
            lastFrameTime = now

            var image: Image? = null
            try {
                image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
                processAndEmitFrame(image, width, height)
            } catch (e: Exception) {
                Log.w(TAG, "Frame capture error: ${e.message}")
            } finally {
                image?.close()
            }
        }, backgroundHandler)
    }

    private fun processAndEmitFrame(image: Image, width: Int, height: Int) {
        val plane = image.planes[0]
        val buffer = plane.buffer
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = rowStride - pixelStride * width

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        if (rowPadding == 0) {
            bitmap.copyPixelsFromBuffer(buffer)
        } else {
            // Buffer has padding per row — extract only valid image pixels row-by-row
            val cleanBuffer = java.nio.ByteBuffer.allocate(width * height * 4)
            val rowBytes = width * pixelStride
            val rowData = ByteArray(rowBytes)
            for (i in 0 until height) {
                buffer.position(i * rowStride)
                val toRead = minOf(rowBytes, buffer.remaining())
                buffer.get(rowData, 0, toRead)
                cleanBuffer.put(rowData, 0, toRead)
            }
            cleanBuffer.rewind()
            bitmap.copyPixelsFromBuffer(cleanBuffer)
        }

        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 65, out)
        bitmap.recycle()

        val jpegBytes = out.toByteArray()
        val base64 = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
        val dataUrl = "data:image/jpeg;base64,$base64"

        socketManager.emitScreenFrame(dataUrl, width, height)
    }

    private fun stopCapture() {
        if (!isCapturingActive) return
        isCapturingActive = false
        _isSharingRunning.value = false

        Log.d(TAG, "Stopping screen capture...")
        try {
            virtualDisplay?.release()
            virtualDisplay = null
            imageReader?.close()
            imageReader = null
            mediaProjection?.stop()
            mediaProjection = null
            handlerThread?.quitSafely()
            handlerThread = null
            backgroundHandler = null
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping capture: ${e.message}")
        }

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun buildNotification(): Notification {
        val tapIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, DeviceMonitorApp.CHANNEL_SCREEN_SHARE)
            .setSmallIcon(R.drawable.ic_screen_share)
            .setContentTitle("Screen Sharing Active")
            .setContentText("Streaming phone screen live to your dashboard")
            .setContentIntent(tapIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        private const val TAG = "ScreenCaptureService"
        const val ACTION_START   = "com.example.remotedevicemonitor.START_CAPTURE"
        const val ACTION_STOP    = "com.example.remotedevicemonitor.STOP_CAPTURE"
        const val ACTION_DESTROY = "com.example.remotedevicemonitor.DESTROY_CAPTURE"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_DATA        = "data"
        private const val NOTIFICATION_ID = 1002

        @Volatile
        private var savedResultCode: Int? = null
        @Volatile
        private var savedDataIntent: Intent? = null

        private val _isSharingRunning = kotlinx.coroutines.flow.MutableStateFlow(false)
        val isSharingRunning: kotlinx.coroutines.flow.StateFlow<Boolean> = _isSharingRunning

        fun setSavedMediaProjection(resultCode: Int, data: Intent) {
            savedResultCode = resultCode
            savedDataIntent = data
        }

        fun hasActiveProjectionSession(): Boolean {
            return isSharingRunning.value && savedDataIntent != null
        }

        fun startIntent(context: Context, resultCode: Int, data: Intent) =
            Intent(context, ScreenCaptureService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_DATA, data)
            }

        fun stopIntent(context: Context) =
            Intent(context, ScreenCaptureService::class.java).apply { action = ACTION_STOP }
    }
}
