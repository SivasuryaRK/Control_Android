package com.example.remotedevicemonitor

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class DeviceMonitorApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            // Device monitoring channel
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_MONITOR,
                    "Device Monitoring",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Persistent notification while device is being monitored"
                    setShowBadge(false)
                }
            )

            // Screen share channel
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_SCREEN_SHARE,
                    "Screen Sharing",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Shown while screen sharing is active"
                }
            )
        }
    }

    companion object {
        const val CHANNEL_MONITOR      = "device_monitor"
        const val CHANNEL_SCREEN_SHARE = "screen_share"
    }
}
