package com.example.remotedevicemonitor.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.example.remotedevicemonitor.data.local.KeystoreManager

/**
 * BootReceiver — starts DeviceMonitorService after the device reboots,
 * so monitoring continues even if the user never re-opens the app.
 *
 * Only starts the service if the device is already paired (has valid credentials).
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != "android.intent.action.QUICKBOOT_POWERON" &&
            intent.action != "com.htc.intent.action.QUICKBOOT_POWERON") {
            return
        }

        val keystore = KeystoreManager(context)
        if (!keystore.isPaired()) {
            Log.d(TAG, "Boot received but device not paired — skipping service start")
            return
        }

        Log.d(TAG, "Boot completed — starting DeviceMonitorService")
        val serviceIntent = DeviceMonitorService.startIntent(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }

    companion object {
        private const val TAG = "BootReceiver"
    }
}
