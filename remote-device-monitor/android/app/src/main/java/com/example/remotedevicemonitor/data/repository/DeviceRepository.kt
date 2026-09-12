package com.example.remotedevicemonitor.data.repository

import com.example.remotedevicemonitor.data.api.ApiService
import com.example.remotedevicemonitor.data.local.KeystoreManager
import com.example.remotedevicemonitor.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class DeviceRepository(
    private val api: ApiService,
    private val keystore: KeystoreManager
) {
    suspend fun registerDevice(
        deviceName: String,
        deviceIdentifier: String,
        manufacturer: String,
        model: String,
        androidVersion: String,
        appVersion: String
    ): Result<DeviceRegisterResponse> = withContext(Dispatchers.IO) {
        runCatching {
            val response = api.registerDevice(
                DeviceRegisterRequest(
                    deviceName       = deviceName,
                    deviceIdentifier = deviceIdentifier,
                    manufacturer     = manufacturer,
                    model            = model,
                    androidVersion   = androidVersion,
                    appVersion       = appVersion
                )
            )
            if (response.isSuccessful) {
                val body = response.body()!!
                keystore.saveDeviceId(body.deviceId)
                Result.Success(body)
            } else {
                Result.Error("Failed to register device: ${response.code()}", response.code())
            }
        }.getOrElse { e -> Result.Error(e.message ?: "Network error") }
    }

    suspend fun pairWithCode(
        pairingCode: String,
        deviceName: String,
        deviceIdentifier: String,
        manufacturer: String,
        model: String,
        androidVersion: String,
        appVersion: String
    ): Result<PairDeviceResponse> = withContext(Dispatchers.IO) {
        runCatching {
            val response = api.pairDevice(
                PairDeviceRequest(
                    pairingCode      = pairingCode.trim().uppercase(),
                    deviceName       = deviceName,
                    deviceIdentifier = deviceIdentifier,
                    manufacturer     = manufacturer,
                    model            = model,
                    androidVersion   = androidVersion,
                    appVersion       = appVersion
                )
            )
            if (response.isSuccessful) {
                val body = response.body()!!
                keystore.saveDeviceId(body.deviceId)
                keystore.saveDeviceToken(body.deviceToken)
                keystore.saveUserId(body.userId)
                Result.Success(body)
            } else {
                val errBody = response.errorBody()?.string()
                Result.Error(errBody ?: "Pairing failed (${response.code()})", response.code())
            }
        }.getOrElse { e -> Result.Error(e.message ?: "Network error") }
    }

    suspend fun disconnectDevice(): Result<Unit> = withContext(Dispatchers.IO) {
        val deviceId = keystore.getDeviceId()
        if (deviceId != null) {
            runCatching {
                api.disconnectDevice(deviceId)
            }
        }
        keystore.clearAll()
        Result.Success(Unit)
    }

    fun getSavedDeviceId() = keystore.getDeviceId()
    fun isPaired() = keystore.getDeviceId() != null && (keystore.getAccessToken() != null || keystore.getDeviceToken() != null)
}
