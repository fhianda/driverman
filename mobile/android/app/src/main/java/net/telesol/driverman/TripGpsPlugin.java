package net.telesol.driverman;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "TripGps", permissions = {
    @Permission(alias = "location", strings = {Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}),
    @Permission(alias = "background", strings = {Manifest.permission.ACCESS_BACKGROUND_LOCATION})
})
public class TripGpsPlugin extends Plugin {
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
        result.put("background", Build.VERSION.SDK_INT < 29 || granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION));
        call.resolve(result);
    }

    @PluginMethod
    public void requestForeground(PluginCall call) {
        requestPermissionForAlias("location", call, "permissionResult");
    }

    @PluginMethod
    public void requestBackground(PluginCall call) {
        if (Build.VERSION.SDK_INT == 29) {
            requestPermissionForAlias("background", call, "permissionResult");
        } else if (Build.VERSION.SDK_INT >= 30) {
            openAppSettings(call);
        } else {
            status(call);
        }
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) { status(call); }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", getContext().getPackageName(), null)));
        call.resolve();
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        getActivity().startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
        call.resolve();
    }
}
