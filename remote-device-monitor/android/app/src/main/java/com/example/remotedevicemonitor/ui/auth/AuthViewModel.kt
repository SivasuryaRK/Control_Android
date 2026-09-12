package com.example.remotedevicemonitor.ui.auth

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.remotedevicemonitor.data.model.AuthResponse
import com.example.remotedevicemonitor.data.model.PairDeviceResponse
import com.example.remotedevicemonitor.data.model.Result
import com.example.remotedevicemonitor.data.repository.AuthRepository
import com.example.remotedevicemonitor.data.repository.DeviceRepository
import com.example.remotedevicemonitor.util.DeviceInfoUtil
import kotlinx.coroutines.launch

class AuthViewModel(
    private val repository: AuthRepository,
    private val deviceRepository: DeviceRepository
) : ViewModel() {

    private val _authState = MutableLiveData<Result<AuthResponse>>()
    val authState: LiveData<Result<AuthResponse>> = _authState

    private val _pairState = MutableLiveData<Result<PairDeviceResponse>>()
    val pairState: LiveData<Result<PairDeviceResponse>> = _pairState

    fun login(email: String, password: String) {
        _authState.value = Result.Loading
        viewModelScope.launch {
            _authState.value = repository.login(email.trim(), password)
        }
    }

    fun register(name: String, email: String, password: String) {
        _authState.value = Result.Loading
        viewModelScope.launch {
            _authState.value = repository.register(name.trim(), email.trim(), password)
        }
    }

    fun pairWithCode(pairingCode: String) {
        _pairState.value = Result.Loading
        viewModelScope.launch {
            _pairState.value = deviceRepository.pairWithCode(
                pairingCode      = pairingCode.trim().uppercase(),
                deviceName       = DeviceInfoUtil.getDeviceName(),
                deviceIdentifier = DeviceInfoUtil.getDeviceIdentifier(),
                manufacturer     = DeviceInfoUtil.getManufacturer(),
                model            = DeviceInfoUtil.getModel(),
                androidVersion   = DeviceInfoUtil.getAndroidVersion(),
                appVersion       = DeviceInfoUtil.getAppVersion()
            )
        }
    }

    fun logout() {
        viewModelScope.launch {
            repository.logout()
        }
    }
}
