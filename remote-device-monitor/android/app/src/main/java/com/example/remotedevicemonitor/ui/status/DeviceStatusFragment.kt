package com.example.remotedevicemonitor.ui.status

import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.example.remotedevicemonitor.R
import com.example.remotedevicemonitor.databinding.FragmentDeviceStatusBinding
import com.example.remotedevicemonitor.service.DeviceMonitorService
import com.example.remotedevicemonitor.ui.ViewModelFactory

class DeviceStatusFragment : Fragment() {

    private var _binding: FragmentDeviceStatusBinding? = null
    private val binding get() = _binding!!

    private val viewModel: DeviceStatusViewModel by viewModels {
        ViewModelFactory(requireContext())
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDeviceStatusBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Auto-start monitoring service as soon as the dashboard is visible
        autoStartMonitoring()

        setupListeners()
        observeViewModel()
    }

    override fun onResume() {
        super.onResume()
        viewModel.loadDeviceStatus()
    }

    /** Start the foreground monitoring service automatically — no button needed. */
    private fun autoStartMonitoring() {
        val intent = DeviceMonitorService.startIntent(requireContext())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            requireContext().startForegroundService(intent)
        } else {
            requireContext().startService(intent)
        }
    }

    private fun setupListeners() {
        binding.btnPermissions.setOnClickListener {
            findNavController().navigate(R.id.action_status_to_permissions)
        }

        binding.btnRefresh.setOnClickListener {
            viewModel.loadDeviceStatus()
            Toast.makeText(requireContext(), R.string.status_refreshed, Toast.LENGTH_SHORT).show()
        }

        binding.btnLogout.setOnClickListener {
            showUnpairConfirmation()
        }
    }

    /** Shows a confirmation dialog before unpairing to prevent accidental disconnection. */
    private fun showUnpairConfirmation() {
        android.app.AlertDialog.Builder(requireContext())
            .setTitle("Unpair Device")
            .setMessage(
                "This will stop monitoring and disconnect this device from your DevicePulse dashboard.\n\n" +
                "Monitoring will stop immediately and won't resume until you pair again."
            )
            .setPositiveButton("Unpair") { _, _ ->
                viewModel.logout()
                findNavController().navigate(R.id.action_status_to_login)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }


    private fun observeViewModel() {
        viewModel.uiState.observe(viewLifecycleOwner) { state ->
            binding.tvDeviceName.text = state.deviceName
            binding.tvModelValue.text = "${state.manufacturer} ${state.model}"
            binding.tvOsValue.text = "Android ${state.androidVersion}"
            binding.tvAppVersionValue.text = "v${state.appVersion}"
            binding.tvHardwareIdValue.text = state.deviceIdentifier

            // Battery
            binding.tvBatteryPercent.text = "${state.batteryPercentage}%"
            binding.progressBattery.progress = state.batteryPercentage
            binding.tvBatteryStatus.text = if (state.isCharging) {
                getString(R.string.status_charging)
            } else {
                getString(R.string.status_discharging)
            }
            binding.tvBatteryDetails.text = "${state.batteryTemp}°C • ${(state.batteryVoltage / 1000f)}V"

            // Storage
            binding.tvStorageUsed.text = "${state.storageUsedFormatted} used"
            binding.tvStorageTotal.text = "of ${state.storageTotalFormatted} (${state.storageFreeFormatted} free)"
            binding.progressStorage.progress = state.storagePercentUsed

            // Cloud registration indicator
            if (state.isRegistered) {
                binding.tvRegisteredStatus.setText(R.string.device_cloud_connected)
                binding.tvRegisteredStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_online))
            } else {
                binding.tvRegisteredStatus.setText(R.string.device_cloud_registering)
                binding.tvRegisteredStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_warning))
            }
        }

        viewModel.message.observe(viewLifecycleOwner) { msg ->
            if (!msg.isNullOrBlank()) {
                Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
                viewModel.clearMessage()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
