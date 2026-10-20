package com.termux.jizhang;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * 监听通知：把疑似支付/订单的通知原文放进采集队列。
 * 只做轻量关键词过滤，不做金额解析（交给 JS / AI）。
 */
public class NotifListenerService extends NotificationListenerService {
    private static final String[] KEYS = {
            "支付", "付款", "消费", "扣款", "订单", "收款", "退款", "账单",
            "已支付", "待付款", "元", "￥", "¥"
    };

    private String lastSig = "";
    private long lastAt = 0;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null) return;
            if (getPackageName().equals(sbn.getPackageName())) return;
            Notification n = sbn.getNotification();
            if (n == null || n.extras == null) return;
            Bundle ex = n.extras;
            String title = str(ex, Notification.EXTRA_TITLE);
            String text = str(ex, Notification.EXTRA_TEXT);
            String big = str(ex, Notification.EXTRA_BIG_TEXT);
            CharSequence[] lines = ex.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);

            StringBuilder sb = new StringBuilder();
            if (big.length() > 0) sb.append(big); else sb.append(text);
            if (lines != null) {
                for (int i = 0; i < lines.length; i++) {
                    if (lines[i] != null) sb.append(" ").append(lines[i].toString());
                }
            }
            String body = sb.toString().trim();
            if (body.length() == 0) return;
            String all = (title + " " + body).trim();
            if (!looksLikePayment(all)) return;

            String sig = sbn.getPackageName() + "|" + all;
            long now = System.currentTimeMillis();
            if (sig.equals(lastSig) && now - lastAt < 60000) return;
            lastSig = sig;
            lastAt = now;

            Ingest.appendAt(this, "notif", sbn.getPackageName(), title, body, now);
        } catch (Exception e) { /* ignore */ }
    }

    private String str(Bundle b, String key) {
        CharSequence c = b.getCharSequence(key);
        return c == null ? "" : c.toString();
    }

    private boolean looksLikePayment(String s) {
        for (int i = 0; i < KEYS.length; i++) if (s.indexOf(KEYS[i]) >= 0) return true;
        return false;
    }
}
