package com.termux.jizhang;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.io.File;

/** 开机后若用户开启过常驻提醒，则重启前台服务 */
public class ReminderBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        File flag = new File(context.getFilesDir(), "reminder_enabled");
        if (!flag.exists()) return;
        try {
            Intent svc = new Intent(context, ReminderService.class);
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(svc);
            else context.startService(svc);
        } catch (Exception e) { /* ignore */ }
    }
}
