package com.example.remotedevicemonitor.ui.status

import android.content.Context
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.remotedevicemonitor.data.local.KeystoreManager
import com.example.remotedevicemonitor.data.model.Result
import com.example.remotedevicemonitor.data.repository.DeviceRepository
import com.example.remotedevicemonitor.service.DeviceMonitorService
import com.example.remotedevicemonitor.util.DeviceInfoUtil
import kotlinx.coroutines.launch

data class DeviceUiState(
    val deviceName: String = "",
    val manufacturer: String = "",
    val model: String = "",
    val androidVersion: String = "",
    val appVersion: String = "",
    val deviceIdentifier: String = "",
    val batteryPercentage: Int = 0,
    val isCharging: Boolean = false,
    val batteryTemp: Float = 0f,
    val batteryVoltage: Int = 0,
    val storageTotalFormatted: String = "",
    val storageUsedFormatted: String = "",
    val storageFreeFormatted: String = "",
    val storagePercentUsed: Int = 0,
    val isRegistered: Boolean = false,
    val userEmail: String = ""
)

class DeviceStatusViewModel(
    private val appContext: Context,
    private val deviceRepository: DeviceRepository,
    private val keystoreManager: KeystoreManager
) : ViewModel() {

    private val _uiState = MutableLiveData<DeviceUiState>()
    val uiState: LiveData<DeviceUiState> = _uiState

    private val _message = MutableLiveData<String?>()
    val message: LiveData<String?> = _message

    init {
        loadDeviceStatus()
        autoRegisterDeviceIfNeeded()
    }

    fun loadDeviceStatus() {
        val battery = DeviceInfoUtil.getBatteryInfo(appContext)
        val storage = DeviceInfoUtil.getStorageInfo()
        val storagePercent = if (storage.totalBytes > 0) {
            ((storage.usedBytes.toDouble() / storage.totalBytes.toDouble()) * 100).toInt()
        } else 0

        val isRegistered = keystoreManager.getDeviceId() != null

        _uiState.value = DeviceUiState(
            deviceName = DeviceInfoUtil.getDeviceName(),
            manufacturer = DeviceInfoUtil.getManufacturer(),
            model = DeviceInfoUtil.getModel(),
            androidVersion = DeviceInfoUtil.getAndroidVersion(),
            appVersion = DeviceInfoUtil.getAppVersion(),
            deviceIdentifier = DeviceInfoUtil.getDeviceIdentifier(),
            batteryPercentage = battery.percentage,
            isCharging = battery.isCharging,
            batteryTemp = battery.temperatureCelsius,
            batteryVoltage = battery.voltageMillivolts,
            storageTotalFormatted = DeviceInfoUtil.formatBytes(storage.totalBytes),
            storageUsedFormatted = DeviceInfoUtil.formatBytes(storage.usedBytes),
            storageFreeFormatted = DeviceInfoUtil.formatBytes(storage.availableBytes),
            storagePercentUsed = storagePercent,
            isRegistered = isRegistered,
            userEmail = keystoreManager.getUserEmail().orEmpty()
        )
    }

    private fun autoRegisterDeviceIfNeeded() {
        if (keystoreManager.getDeviceId() != null) return

        viewModelScope.launch {
            val result = deviceRepository.registerDevice(
                deviceName = DeviceInfoUtil.getDeviceName(),
                deviceIdentifier = DeviceInfoUtil.getDeviceIdentifier(),
                manufacturer = DeviceInfoUtil.getManufacturer(),
                model = DeviceInfoUtil.getModel(),
                androidVersion = DeviceInfoUtil.getAndroidVersion(),
                appVersion = DeviceInfoUtil.getAppVersion()
            )
            when (result) {
                is Result.Success -> {
                    _message.value = "Device registered with DevicePulse"
                    loadDeviceStatus()
                }
                is Result.Error -> {
                    _message.value = "Device registration: ${result.message}"
                }
                is Result.Loading -> {}
            }
        }
    }

    fun logout() {
        // Stop the persistent monitoring service explicitly
        appContext.startService(DeviceMonitorService.stopIntent(appContext))

        viewModelScope.launch {
            // Notify backend device is disconnecting, then clear all local credentials
            deviceRepository.disconnectDevice()
        }
    }


    fun clearMessage() {
        _message.value = null
    }
}
