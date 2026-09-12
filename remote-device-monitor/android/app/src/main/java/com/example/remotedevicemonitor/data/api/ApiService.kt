package com.example.remotedevicemonitor.data.api

import com.example.remotedevicemonitor.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    // ── Auth ─────────────────────────────────────────────────────────

    @POST("api/auth/register")
    suspend fun register(@Body body: RegisterRequest): Response<AuthResponse>

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @POST("api/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): Response<RefreshResponse>

    @POST("api/auth/logout")
    suspend fun logout(): Response<Unit>

    @GET("api/auth/me")
    suspend fun me(): Response<MeResponse>

    // ── Device ───────────────────────────────────────────────────────

    @POST("api/devices/register")
    suspend fun registerDevice(@Body body: DeviceRegisterRequest): Response<DeviceRegisterResponse>

    @POST("api/devices/pair")
    suspend fun pairDevice(@Body body: PairDeviceRequest): Response<PairDeviceResponse>

    @POST("api/devices/{deviceId}/disconnect")
    suspend fun disconnectDevice(@Path("deviceId") deviceId: String): Response<DisconnectResponse>
}
