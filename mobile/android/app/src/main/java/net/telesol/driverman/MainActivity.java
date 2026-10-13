package net.telesol.driverman;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.provider.Settings;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            String[][] modes = {{"sound", "Son"}, {"vibrate", "Vibreur"}, {"both", "Son et vibration"}, {"silent", "Silencieuses"}};
            for (String[] mode : modes) {
                boolean sound = mode[0].equals("sound") || mode[0].equals("both");
                boolean vibrate = mode[0].equals("vibrate") || mode[0].equals("both");
                NotificationChannel channel = new NotificationChannel("driverman_" + mode[0] + "_v1", "DriverMan · " + mode[1], mode[0].equals("silent") ? NotificationManager.IMPORTANCE_LOW : NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("Alertes de départ et d’achat de carburant sélectionnées dans DriverMan.");
                channel.setSound(sound ? Settings.System.DEFAULT_NOTIFICATION_URI : null, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
                channel.enableVibration(vibrate);
                if (vibrate) channel.setVibrationPattern(new long[]{0, 200, 100, 200});
                channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
                manager.createNotificationChannel(channel);
            }
        }
    }
}
