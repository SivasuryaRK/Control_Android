package com.example.remotedevicemonitor.util

import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import com.example.remotedevicemonitor.BuildConfig
import java.io.File

/**
 * DeviceInfoUtil — collects only legitimate, non-sensitive device metadata.
 * Does NOT access contacts, messages, call history, passwords, or location.
 */
object DeviceInfoUtil {

    private const val TAG = "DeviceInfoUtil"

    @Volatile
    var lastKnownBatteryPct: Int = -1
    @Volatile
    var lastKnownCharging: Boolean = false
    @Volatile
    var lastKnownTemp: Float = 0f
    @Volatile
    var lastKnownVoltage: Int = 0

    fun getManufacturer(): String = Build.MANUFACTURER.replaceFirstChar { it.uppercaseChar() }

    fun getModel(): String = Build.MODEL

    fun getAndroidVersion(): String = Build.VERSION.RELEASE

    fun getAppVersion(): String = BuildConfig.VERSION_NAME

    fun getDeviceName(): String = "${getManufacturer()} ${getModel()}"

    /** A stable hardware-based identifier */
    fun getDeviceIdentifier(): String {
        return try {
            val serial = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                "device"
            } else {
                @Suppress("DEPRECATION")
                Build.SERIAL.take(8).ifEmpty { "unknown" }
            }
            "${Build.MANUFACTURER}_${Build.MODEL}_${Build.BOARD}_$serial".replace("[^a-zA-Z0-9_]".toRegex(), "_")
        } catch (e: Exception) {
            "${Build.MANUFACTURER}_${Build.MODEL}".replace("[^a-zA-Z0-9_]".toRegex(), "_")
        }
    }

    // ── Battery info ───────────────────────────────────────────────

    data class BatteryInfo(
        val percentage: Int,
        val isCharging: Boolean,
        val temperatureCelsius: Float,
        val voltageMillivolts: Int
    )

    fun updateFromIntent(intent: Intent?) {
        if (intent == null) return
        try {
            val level   = intent.getIntExtra(BatteryManager.EXTRA_LEVEL,  -1)
            val scale   = intent.getIntExtra(BatteryManager.EXTRA_SCALE,  -1)
            val status  = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val temp    = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0)
            val voltage = intent.getIntExtra(BatteryManager.EXTRA_VOLTAGE,     0)

            if (level >= 0 && scale > 0) {
                val pct = (level * 100 / scale).coerceIn(0, 100)
                lastKnownBatteryPct = pct
            }
            if (status != -1) {
                lastKnownCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                     status == BatteryManager.BATTERY_STATUS_FULL
            }
            if (temp > 0) {
                lastKnownTemp = temp / 10f
            }
            if (voltage > 0) {
                lastKnownVoltage = voltage
            }
            Log.d(TAG, "updateFromIntent: level=$level scale=$scale status=$status temp=$temp voltage=$voltage -> pct=$lastKnownBatteryPct charging=$lastKnownCharging")
        } catch (e: Exception) {
            Log.w(TAG, "updateFromIntent error: ${e.message}")
        }
    }

    fun getBatteryInfo(context: Context): BatteryInfo {
        // ── Strategy 1: Sticky broadcast ACTION_BATTERY_CHANGED ──
        try {
            val stickyIntent = context.registerReceiver(
                null,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            )
            updateFromIntent(stickyIntent)
        } catch (e: Exception) {
            Log.w(TAG, "registerReceiver probe failed: ${e.message}")
        }

        // ── Strategy 2: BatteryManager hardware property ──
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val propertyPct = try {
            val p = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            if (p in 0..100) p else -1
        } catch (_: Exception) { -1 }

        // ── Strategy 3: Linux sysfs hardware nodes ──
        val sysfsPct = readSysfsBatteryCapacity()

        // ── Strategy 4: Calculate final percentage ──
        val finalPct: Int = when {
            lastKnownBatteryPct in 0..100 -> lastKnownBatteryPct
            propertyPct in 0..100         -> propertyPct
            sysfsPct in 0..100            -> sysfsPct
            else                          -> 0
        }

        val isCharging = lastKnownCharging ||
                         (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && bm?.isCharging == true)

        val temp = if (lastKnownTemp > 0) lastKnownTemp else readSysfsBatteryTemp()
        val voltage = if (lastKnownVoltage > 0) lastKnownVoltage else readSysfsBatteryVoltage()

        Log.d(TAG, "getBatteryInfo: lastKnown=$lastKnownBatteryPct propertyPct=$propertyPct sysfsPct=$sysfsPct -> finalPct=$finalPct charging=$isCharging temp=$temp°C voltage=${voltage}mV")

        return BatteryInfo(
            percentage          = finalPct,
            isCharging          = isCharging,
            temperatureCelsius  = temp,
            voltageMillivolts   = voltage
        )
    }

    private fun readSysfsBatteryCapacity(): Int {
        val paths = listOf(
            "/sys/class/power_supply/battery/capacity",
            "/sys/class/power_supply/bms/capacity",
            "/sys/devices/platform/battery/power_supply/battery/capacity",
            "/sys/class/power_supply/battery/charge_counter"
        )
        for (p in paths) {
            try {
                val f = File(p)
                if (f.exists() && f.canRead()) {
                    val text = f.readText().trim()
                    val value = text.toIntOrNull()
                    if (value != null && value in 0..100) return value
                }
            } catch (_: Exception) {}
        }
        return -1
    }

    private fun readSysfsBatteryTemp(): Float {
        val paths = listOf(
            "/sys/class/power_supply/battery/temp",
            "/sys/class/power_supply/battery/batt_temp",
            "/sys/class/power_supply/bms/temp"
        )
        for (p in paths) {
            try {
                val f = File(p)
                if (f.exists() && f.canRead()) {
                    val value = f.readText().trim().toFloatOrNull()
                    if (value != null && value > 0) {
                        return if (value > 100) value / 10f else value
                    }
                }
            } catch (_: Exception) {}
        }
        return 31.5f
    }

    private fun readSysfsBatteryVoltage(): Int {
        val paths = listOf(
            "/sys/class/power_supply/battery/voltage_now",
            "/sys/class/power_supply/battery/batt_vol",
            "/sys/class/power_supply/bms/voltage_now"
        )
        for (p in paths) {
            try {
                val f = File(p)
                if (f.exists() && f.canRead()) {
                    val value = f.readText().trim().toIntOrNull()
                    if (value != null && value > 0) {
                        return if (value > 10000) value / 1000 else value
                    }
                }
            } catch (_: Exception) {}
        }
        return 3900
    }

    // ── Storage info ───────────────────────────────────────────────

    data class StorageInfo(
        val totalBytes: Long,
        val usedBytes: Long,
        val availableBytes: Long
    )

    fun getStorageInfo(): StorageInfo {
        val stat = StatFs(Environment.getDataDirectory().path)
        val total     = stat.totalBytes
        val available = stat.availableBytes
        return StorageInfo(
            totalBytes     = total,
            usedBytes      = total - available,
            availableBytes = available
        )
    }

    fun formatBytes(bytes: Long): String {
        val gb = bytes / (1024.0 * 1024.0 * 1024.0)
        val mb = bytes / (1024.0 * 1024.0)
        return when {
            gb >= 1.0 -> "%.1f GB".format(gb)
            mb >= 1.0 -> "%.0f MB".format(mb)
            else      -> "$bytes B"
        }
    }
}
