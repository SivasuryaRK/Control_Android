package com.example.remotedevicemonitor.ui.screenshare

import android.content.Context
import androidx.lifecycle.LiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.asLiveData
import androidx.lifecycle.viewModelScope
import com.example.remotedevicemonitor.data.local.KeystoreManager
import com.example.remotedevicemonitor.service.ScreenCaptureService
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn

class ScreenShareViewModel(
    private val appContext: Context,
    private val keystoreManager: KeystoreManager
) : ViewModel() {

    val isSharing: LiveData<Boolean> = ScreenCaptureService.isSharingRunning.asLiveData()

    fun checkSharingStatus() {
        // Automatically reflects ScreenCaptureService.isSharingRunning
    }

    fun stopSharing() {
        appContext.startService(ScreenCaptureService.stopIntent(appContext))
    }
}

