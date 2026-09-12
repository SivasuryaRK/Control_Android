package com.example.remotedevicemonitor.ui.permissions

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel

data class PermissionsState(
    val notificationGranted: Boolean = false,
    val isAndroid13OrHigher: Boolean = false
)

class PermissionsViewModel(private val appContext: Context) : ViewModel() {

    private val _permissionsState = MutableLiveData<PermissionsState>()
    val permissionsState: LiveData<PermissionsState> = _permissionsState

    init {
        checkPermissions()
    }

    fun checkPermissions() {
        val isAndroid13 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        val notifGranted = if (isAndroid13) {
            ContextCompat.checkSelfPermission(
                appContext,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        _permissionsState.value = PermissionsState(
            notificationGranted = notifGranted,
            isAndroid13OrHigher = isAndroid13
        )
    }
}
