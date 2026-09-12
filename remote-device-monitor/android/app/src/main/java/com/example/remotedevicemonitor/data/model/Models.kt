package com.example.remotedevicemonitor.data.model

import com.google.gson.annotations.SerializedName

// ── Auth ────────────────────────────────────────────────────────────

data class RegisterRequest(
    @SerializedName("name")     val name: String,
    @SerializedName("email")    val email: String,
    @SerializedName("password") val password: String,
    @SerializedName("confirmPassword") val confirmPassword: String
)

data class LoginRequest(
    @SerializedName("email")    val email: String,
    @SerializedName("password") val password: String
)

data class AuthResponse(
    @SerializedName("message")      val message: String,
    @SerializedName("user")         val user: UserDto,
    @SerializedName("accessToken")  val accessToken: String,
    @SerializedName("refreshToken") val refreshToken: String
)

data class UserDto(
    @SerializedName("id")        val id: String,
    @SerializedName("email")     val email: String,
    @SerializedName("name")      val name: String,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String
)

data class RefreshRequest(
    @SerializedName("refreshToken") val refreshToken: String
)

data class RefreshResponse(
    @SerializedName("accessToken")  val accessToken: String,
    @SerializedName("refreshToken") val refreshToken: String
)

data class MeResponse(
    @SerializedName("user") val user: UserDto
)

// ── Device registration ─────────────────────────────────────────────

data class DeviceRegisterRequest(
    @SerializedName("deviceName")       val deviceName: String,
    @SerializedName("deviceIdentifier") val deviceIdentifier: String,
    @SerializedName("manufacturer")     val manufacturer: String,
    @SerializedName("model")            val model: String,
    @SerializedName("androidVersion")   val androidVersion: String,
    @SerializedName("appVersion")       val appVersion: String
)

data class DeviceRegisterResponse(
    @SerializedName("message")  val message: String,
    @SerializedName("deviceId") val deviceId: String
)

// ── Device Pairing (Phase 6) ─────────────────────────────────────────

data class PairDeviceRequest(
    @SerializedName("pairingCode")       val pairingCode: String,
    @SerializedName("deviceName")       val deviceName: String,
    @SerializedName("deviceIdentifier") val deviceIdentifier: String,
    @SerializedName("manufacturer")     val manufacturer: String,
    @SerializedName("model")            val model: String,
    @SerializedName("androidVersion")   val androidVersion: String,
    @SerializedName("appVersion")       val appVersion: String
)

data class PairDeviceResponse(
    @SerializedName("message")     val message: String,
    @SerializedName("deviceId")    val deviceId: String,
    @SerializedName("deviceToken") val deviceToken: String,
    @SerializedName("deviceName")  val deviceName: String,
    @SerializedName("userId")      val userId: String
)

data class DisconnectResponse(
    @SerializedName("message") val message: String
)

// ── API error wrapper ───────────────────────────────────────────────

data class ApiError(
    @SerializedName("error") val error: String? = null,
    @SerializedName("message") val message: String? = null
)

// ── Result wrapper ──────────────────────────────────────────────────

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val message: String, val code: Int = -1) : Result<Nothing>()
    object Loading : Result<Nothing>()
}
