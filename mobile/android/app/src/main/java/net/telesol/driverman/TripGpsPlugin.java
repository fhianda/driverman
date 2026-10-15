package net.telesol.driverman;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "TripGps", permissions = {
    @Permission(alias = "location", strings = {Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION})
})
public class TripGpsPlugin extends Plugin {
    private ActivityResultLauncher<IntentSenderRequest> locationResolution;
    private PluginCall locationCall;

    @Override
    public void load() {
        locationResolution = bridge.registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall pending = locationCall;
            locationCall = null;
            if (pending != null) status(pending);
        });
    }
    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void status(PluginCall call) {
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        boolean enabled = manager != null && (Build.VERSION.SDK_INT >= 28
            ? manager.isLocationEnabled()
            : manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
        JSObject result = new JSObject();
        result.put("locationEnabled", enabled);
        result.put("precise", granted(Manifest.permission.ACCESS_FINE_LOCATION));
        call.resolve(result);
    }

    @PluginMethod
    public void requestForeground(PluginCall call) {
        requestPermissionForAlias("location", call, "permissionResult");
    }

    @PluginMethod
    public void ensureLocationEnabled(PluginCall call) {
        if (locationCall != null) { call.reject("Activation GPS déjà en cours."); return; }
        locationCall = call;
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 15000).build();
        LocationSettingsRequest settings = new LocationSettingsRequest.Builder()
            .addLocationRequest(request).setAlwaysShow(true).build();
        LocationServices.getSettingsClient(getActivity()).checkLocationSettings(settings)
            .addOnSuccessListener(result -> { locationCall = null; status(call); })
            .addOnFailureListener(error -> {
                if (error instanceof ResolvableApiException) {
                    getActivity().runOnUiThread(() -> {
                        try {
                            locationResolution.launch(new IntentSenderRequest.Builder(
                                ((ResolvableApiException) error).getResolution()).build());
                        } catch (Exception exception) {
                            locationCall = null;
                            call.reject("Impossible de proposer l’activation GPS.", exception);
                        }
                    });
                } else { locationCall = null; status(call); }
            });
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) { status(call); }

}
