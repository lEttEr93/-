package com.termux.jizhang;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/** 收到短信时把原文放进本地采集队列（不做解析）。 */
public class IngestReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        try {
            SmsMessage[] msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (msgs == null || msgs.length == 0) return;
            String from = msgs[0] == null ? "" : msgs[0].getDisplayOriginatingAddress();
            StringBuilder body = new StringBuilder();
            long t = 0;
            for (int i = 0; i < msgs.length; i++) {
                SmsMessage m = msgs[i];
                if (m == null) continue;
                if (t == 0) t = m.getTimestampMillis();
                if (m.getMessageBody() != null) body.append(m.getMessageBody());
            }
            Ingest.appendAt(context, "sms", from, "", body.toString(), t);
        } catch (Exception e) { /* ignore */ }
    }
}
