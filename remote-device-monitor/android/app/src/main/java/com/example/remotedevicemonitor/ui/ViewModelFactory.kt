package com.example.remotedevicemonitor.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.example.remotedevicemonitor.data.api.RetrofitClient
import com.example.remotedevicemonitor.data.local.KeystoreManager
import com.example.remotedevicemonitor.data.repository.AuthRepository
import com.example.remotedevicemonitor.data.repository.DeviceRepository
import com.example.remotedevicemonitor.ui.auth.AuthViewModel
import com.example.remotedevicemonitor.ui.permissions.PermissionsViewModel
import com.example.remotedevicemonitor.ui.screenshare.ScreenShareViewModel
import com.example.remotedevicemonitor.ui.status.DeviceStatusViewModel
import com.example.remotedevicemonitor.ui.welcome.WelcomeViewModel

@Suppress("UNCHECKED_CAST")
class ViewModelFactory(private val context: Context) : ViewModelProvider.Factory {

    private val keystoreManager by lazy { KeystoreManager(context.applicationContext) }
    private val apiService by lazy { RetrofitClient.create(keystoreManager) }
    private val authRepository by lazy { AuthRepository(apiService, keystoreManager) }
    private val deviceRepository by lazy { DeviceRepository(apiService, keystoreManager) }

    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return when {
            modelClass.isAssignableFrom(WelcomeViewModel::class.java) -> {
                WelcomeViewModel(keystoreManager) as T
            }
            modelClass.isAssignableFrom(AuthViewModel::class.java) -> {
                AuthViewModel(authRepository, deviceRepository) as T
            }
            modelClass.isAssignableFrom(DeviceStatusViewModel::class.java) -> {
                DeviceStatusViewModel(context.applicationContext, deviceRepository, keystoreManager) as T
            }
            modelClass.isAssignableFrom(PermissionsViewModel::class.java) -> {
                PermissionsViewModel(context.applicationContext) as T
            }
            modelClass.isAssignableFrom(ScreenShareViewModel::class.java) -> {
                ScreenShareViewModel(context.applicationContext, keystoreManager) as T
            }
            else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
