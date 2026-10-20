package com.termux.jizhang;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * 常驻提醒：前台服务，约每 30 秒刷新一次。
 * 同时显示「课表课程」(course.json) 与「日程」(schedule.json)，按时间合并、同优先级；
 * 数据由 assets/index.html 下发（整学期/全部日程），不打开 App 也能跨天正确。
 */
public class ReminderService extends Service {

    public static final String CHANNEL_ID = "reminder";
    public static final int NOTIF_ID = 1001;
    private static final int REFRESH_MS = 30000;

    private static final int[] CHIP_IDS = {
            R.id.nt_c0, R.id.nt_c1, R.id.nt_c2, R.id.nt_c3, R.id.nt_c4, R.id.nt_c5
    };

    private Handler handler;
    private Runnable tick;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        handler = new Handler(Looper.getMainLooper());
        tick = new Runnable() {
            public void run() {
                refresh();
                handler.postDelayed(this, REFRESH_MS);
            }
        };
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = buildSafe();
        if (n != null) {
            try { startForeground(NOTIF_ID, n); }
            catch (Throwable t) { recordError("startForeground", t); }
        }
        if (handler != null) {
            handler.removeCallbacks(tick);
            handler.post(tick);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (handler != null) handler.removeCallbacks(tick);
        super.onDestroy();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "课表与日程", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                ch.setDescription("常驻显示今天的课程、日程与下一项倒计时");
                nm.createNotificationChannel(ch);
            }
        }
    }

    private void refresh() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            Notification n = buildSafe();
            if (n != null) nm.notify(NOTIF_ID, n);
        } catch (Throwable e) { /* ignore */ }
    }

    // 任何构建/下发异常都不允许把 App 带崩；记录到 files/notif_error.txt 供排查
    private Notification buildSafe() {
        try { return build(); }
        catch (Throwable t) { recordError("build", t); }
        try {
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(this, CHANNEL_ID);
            else b = new Notification.Builder(this);
            return b.setSmallIcon(R.drawable.ic_stat_agenda)
                    .setContentTitle("课表与日程")
                    .setContentText("通知渲染失败")
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setShowWhen(false)
                    .setPriority(Notification.PRIORITY_LOW)
                    .setCategory(Notification.CATEGORY_STATUS)
                    .build();
        } catch (Throwable t2) { return null; }
    }

    private void recordError(String where, Throwable t) {
        try {
            java.io.PrintWriter pw = new java.io.PrintWriter(
                    new java.io.FileWriter(new File(getFilesDir(), "notif_error.txt"), false));
            pw.println(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()) + " [" + where + "]");
            t.printStackTrace(pw);
            pw.flush(); pw.close();
        } catch (Exception e) { /* ignore */ }
    }

    private Notification build() {
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int fgTitle = Color.WHITE;
        int fgSub = Color.WHITE;

        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        Calendar cal = Calendar.getInstance();
        int nowMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);

        RemoteViews rv = new RemoteViews(getPackageName(), R.layout.notif_agenda);
        String title = "今天没有课";
        String nextText = "";
        long targetEpoch = -1;

        try {
            List<Item> items = readItems(today);
            JSONObject courseRoot = readJson("course.json");
            String termStart = (courseRoot != null) ? courseRoot.optString("start", "") : "";

            int courseCount = 0, schCount = 0;
            for (int i = 0; i < items.size(); i++) {
                if (items.get(i).kind == 0) courseCount++; else schCount++;
            }
            if (courseCount + schCount > 0) {
                StringBuilder t = new StringBuilder("今天 ");
                if (courseCount > 0) t.append(courseCount).append(" 节课");
                if (schCount > 0) {
                    if (courseCount > 0) t.append(" · ");
                    t.append(schCount).append(" 项日程");
                }
                if (termStart.length() > 0) t.append(" · 第 ").append(weekOf(termStart, today)).append(" 周");
                title = t.toString();
            } else {
                title = "今天没有课与日程";
            }

            // 横向条目块（课表 + 日程 按时间合并）
            for (int i = 0; i < CHIP_IDS.length; i++) rv.setViewVisibility(CHIP_IDS[i], View.GONE);
            if (!items.isEmpty()) {
                int n = items.size();
                boolean overflow = n > CHIP_IDS.length;
                int show = overflow ? CHIP_IDS.length - 1 : n;
                for (int i = 0; i < show; i++) {
                    Item it = items.get(i);
                    rv.setViewVisibility(CHIP_IDS[i], View.VISIBLE);
                    setChip(rv, CHIP_IDS[i], it.color, shortName(it.name), dark);
                }
                if (overflow) {
                    int id = CHIP_IDS[CHIP_IDS.length - 1];
                    rv.setViewVisibility(id, View.VISIBLE);
                    setChip(rv, id, Color.rgb(140, 150, 148), "+" + (n - (CHIP_IDS.length - 1)), dark);
                }
            }

            // 进行中 / 下一项；整行列出今日所有条目，太长时靠 marquee 横向滚动
            Item ongoing = null, next = null;
            for (int i = 0; i < items.size(); i++) {
                Item it = items.get(i);
                int s = toMin(it.start), e = toMin(it.end);
                if (ongoing == null && s >= 0 && nowMin >= s && nowMin < e) ongoing = it;
                if (next == null && s > nowMin) next = it;
            }
            if (ongoing != null) targetEpoch = epochOf(today, ongoing.end);
            else if (next != null) targetEpoch = epochOf(today, next.start);

            StringBuilder line = new StringBuilder();
            for (int i = 0; i < items.size(); i++) {
                Item it = items.get(i);
                if (i > 0) line.append("　｜　");
                int s = toMin(it.start);
                if (s < 0) line.append("全天 ");
                else if (it == ongoing) line.append("进行中 ");
                else if (it == next) line.append("下一项 ");
                else line.append(it.start).append(" ");
                line.append(it.name);
                if (it.room.length() > 0) line.append(" ").append(it.room);
            }
            nextText = line.length() > 0 ? line.toString() : "今天没有课与日程";
        } catch (Exception e) {
            title = "课表与日程数据未同步";
            nextText = "打开 App 刷新通知";
        }

        rv.setTextViewText(R.id.nt_title, title);
        rv.setTextColor(R.id.nt_title, fgTitle);
        rv.setTextViewText(R.id.nt_next, nextText);
        rv.setTextColor(R.id.nt_next, fgSub);
        if (targetEpoch > 0) {
            long base = SystemClock.elapsedRealtime() + (targetEpoch - System.currentTimeMillis());
            rv.setViewVisibility(R.id.nt_chrono, View.VISIBLE);
            rv.setChronometer(R.id.nt_chrono, base, null, true);
            rv.setChronometerCountDown(R.id.nt_chrono, true);
            rv.setTextColor(R.id.nt_chrono, fgTitle);
        } else {
            rv.setViewVisibility(R.id.nt_chrono, View.GONE);
        }

        Intent open = new Intent(this, MainActivity.class);
        open.putExtra("tab", "kb");
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, piFlags);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(this, CHANNEL_ID);
        else b = new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_agenda)
                .setContentTitle(title)
                .setContentText(nextText)
                .setContentIntent(pi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(Notification.PRIORITY_LOW)
                .setCategory(Notification.CATEGORY_STATUS);
        b.setCustomContentView(rv);
        if (Build.VERSION.SDK_INT >= 24) b.setCustomBigContentView(rv);
        return b.build();
    }

    private static class Item {
        final String name, start, end, room;
        final int color, kind;   // kind: 0=课程 1=日程
        Item(String n, String s, String e, String r, int c, int k) {
            name = n; start = s; end = e; room = r; color = c; kind = k;
        }
    }

    // 读取当天课程 + 日程，按开始时间合并排序（全天在最前）
    private List<Item> readItems(String today) {
        List<Item> out = new ArrayList<Item>();
        JSONObject course = readJson("course.json");
        JSONObject cdays = (course != null) ? course.optJSONObject("days") : null;
        JSONArray carr = (cdays != null) ? cdays.optJSONArray(today) : null;
        if (carr != null) {
            for (int i = 0; i < carr.length(); i++) {
                JSONObject c = carr.optJSONObject(i);
                if (c == null) continue;
                out.add(new Item(c.optString("n", ""), c.optString("s", ""), c.optString("e", ""),
                        c.optString("r", ""), parseColor(c.optString("c", "#888888")), 0));
            }
        }
        JSONObject sch = readJson("schedule.json");
        JSONObject sdays = (sch != null) ? sch.optJSONObject("days") : null;
        JSONArray sarr = (sdays != null) ? sdays.optJSONArray(today) : null;
        if (sarr != null) {
            for (int i = 0; i < sarr.length(); i++) {
                JSONObject c = sarr.optJSONObject(i);
                if (c == null) continue;
                out.add(new Item(c.optString("n", ""), c.optString("s", ""), c.optString("e", ""),
                        c.optString("r", ""), parseColor(c.optString("c", "#888888")), 1));
            }
        }
        Collections.sort(out, new Comparator<Item>() {
            public int compare(Item a, Item b) {
                int am = toMin(a.start), bm = toMin(b.start);
                if (am != bm) return am - bm;
                return a.name.compareTo(b.name);
            }
        });
        return out;
    }

    private JSONObject readJson(String name) {
        try {
            File f = new File(getFilesDir(), name);
            if (!f.exists()) return null;
            BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), Charset.forName("UTF-8")));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            return new JSONObject(sb.toString());
        } catch (Exception e) {
            return null;
        }
    }

    private int weekOf(String startIso, String todayIso) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Date a = f.parse(startIso);
            Date d = f.parse(todayIso);
            long days = Math.round((d.getTime() - a.getTime()) / 86400000.0);
            return (int) (days / 7) + 1;
        } catch (Exception e) {
            return 1;
        }
    }

    private int toMin(String hhmm) {
        try {
            String[] p = hhmm.split(":");
            return Integer.parseInt(p[0].trim()) * 60 + Integer.parseInt(p[1].trim());
        } catch (Exception e) {
            return -1;
        }
    }

    private long epochOf(String dateIso, String hhmm) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US);
            return f.parse(dateIso + " " + hhmm).getTime();
        } catch (Exception e) {
            return -1;
        }
    }

    private int parseColor(String hex) {
        try { return Color.parseColor(hex); } catch (Exception e) { return Color.rgb(136, 136, 136); }
    }

    // 圆角 + 半透明条目色块：直接画成 Bitmap（避开 API 31 的 backgroundTint，ecj 看不到）
    private void setChip(RemoteViews rv, int id, int hex, String text, boolean dark) {
        float d = getResources().getDisplayMetrics().density;
        int w = Math.round(44 * d), h = Math.round(26 * d);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(withAlpha(hex, dark ? 0x40 : 0x33));
        float r = 7 * d;
        cv.drawRoundRect(new RectF(0, 0, w, h), r, r, p);
        p.setColor(Color.WHITE);
        p.setTextAlign(Paint.Align.CENTER);
        String s = (text == null) ? "" : text;
        float maxW = w - 8 * d;
        float ts = 11 * d;
        p.setTextSize(ts);
        while (p.measureText(s) > maxW && ts > 7.5f * d) { ts -= 0.5f * d; p.setTextSize(ts); }
        while (p.measureText(s) > maxW && s.length() > 1) { s = s.substring(0, s.length() - 1); }
        Paint.FontMetrics fm = p.getFontMetrics();
        float ty = h / 2f - (fm.ascent + fm.descent) / 2f;
        cv.drawText(s, w / 2f, ty, p);
        rv.setImageViewBitmap(id, bmp);
    }

    private int withAlpha(int color, int a) {
        return (a << 24) | (color & 0x00FFFFFF);
    }

    private String shortName(String n) {
        String s = String.valueOf(n).replaceAll("[（(].*$", "").trim();
        if (s.length() > 6) s = s.substring(0, 6);
        return s;
    }
}
