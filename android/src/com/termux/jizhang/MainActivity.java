package com.termux.jizhang;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.HapticFeedbackConstants;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;

public class MainActivity extends Activity {

    private WebView webView;
    private File dataFile;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int REQ_FILE = 1001;
    private static final int REQ_NOTIF = 1002;
    private static final int REQ_SMS = 1003;
    private String pendingTab = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 崩溃日志写到 files/last_crash.txt（下次启动时由 JS 复制到剪贴板）
        final Thread.UncaughtExceptionHandler prevHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            public void uncaughtException(Thread t, Throwable e) {
                try {
                    java.io.PrintWriter pw = new java.io.PrintWriter(
                            new java.io.FileWriter(new File(getFilesDir(), "last_crash.txt"), false));
                    pw.println(new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US).format(new java.util.Date()));
                    e.printStackTrace(pw);
                    pw.flush(); pw.close();
                } catch (Exception ignore) { /* ignore */ }
                if (prevHandler != null) prevHandler.uncaughtException(t, e);
            }
        });

        dataFile = new File(getFilesDir(), "ledger.json");

        // ---- Status bar tint ----
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#173f3c"));
        if (Build.VERSION.SDK_INT >= 23) {
            // dark icons are hard to see on indigo -> keep light icons
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
        if (Build.VERSION.SDK_INT >= 21) {
            window.setNavigationBarColor(Color.parseColor("#ffffff"));
        }

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(Color.parseColor("#f4f7f6"));
        webView.setHapticFeedbackEnabled(true);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.addJavascriptInterface(new Bridge(), "Android");

        pendingTab = (getIntent() != null) ? getIntent().getStringExtra("tab") : null;
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                if (pendingTab != null) {
                    final String t = pendingTab;
                    pendingTab = null;
                    v.evaluateJavascript("window.__openTab && window.__openTab(" + JSONObject.quote(t) + ");", null);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("image/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "选择截图"), REQ_FILE);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getDataString() != null) {
                results = new Uri[]{ Uri.parse(data.getDataString()) };
            }
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ---------------- JS bridge ----------------
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getStringExtra("tab") != null && webView != null) {
            final String t = intent.getStringExtra("tab");
            webView.evaluateJavascript("window.__openTab && window.__openTab(" + JSONObject.quote(t) + ");", null);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_NOTIF) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (webView != null) {
                webView.evaluateJavascript("window.__onNotifPermission && window.__onNotifPermission(" + granted + ");", null);
            }
            return;
        }
        if (requestCode == REQ_SMS) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (webView != null) {
                webView.evaluateJavascript("window.__onSmsPermission && window.__onSmsPermission(" + granted + ");", null);
            }
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private String readTextFile(File f) {
        try {
            if (!f.exists()) return "";
            BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), Charset.forName("UTF-8")));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append("\n");
            r.close();
            return sb.toString();
        } catch (Exception e) { return ""; }
    }

    private class Bridge {

        @JavascriptInterface
        public void haptic(final String kind) {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (webView == null) return;
                    int feedback = HapticFeedbackConstants.CLOCK_TICK;
                    if ("success".equals(kind)) {
                        // HapticFeedbackConstants.CONFIRM 为 API 30 新增（值为 16）；
                        // 直接写数值，避开旧编译器 ecj 无法解析该字段的问题。
                        feedback = Build.VERSION.SDK_INT >= 30
                                ? 16 : HapticFeedbackConstants.LONG_PRESS;
                    }
                    webView.performHapticFeedback(feedback);
                }
            });
        }

        @JavascriptInterface
        public void setAppearance(final boolean dark) {
            runOnUiThread(new Runnable() {
                public void run() {
                    Window w = getWindow();
                    w.setStatusBarColor(Color.parseColor("#173f3c"));
                    w.setNavigationBarColor(Color.parseColor(dark ? "#101a19" : "#ffffff"));
                    webView.setBackgroundColor(Color.parseColor(dark ? "#101a19" : "#f4f7f6"));
                    if (Build.VERSION.SDK_INT >= 26) {
                        View decor = w.getDecorView();
                        int flags = decor.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        if (dark) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                        else flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                        decor.setSystemUiVisibility(flags);
                    }
                }
            });
        }

        @JavascriptInterface
        public String load() {
            try {
                if (!dataFile.exists()) return "";
                InputStream in = new FileInputStream(dataFile);
                BufferedReader r = new BufferedReader(new InputStreamReader(in, Charset.forName("UTF-8")));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                return sb.toString();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean save(final String json) {
            try {
                FileOutputStream out = new FileOutputStream(dataFile);
                OutputStreamWriter w = new OutputStreamWriter(out, Charset.forName("UTF-8"));
                w.write(json);
                w.flush();
                w.close();
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean hasData() {
            return dataFile.exists() && dataFile.length() > 0;
        }

        @JavascriptInterface
        public void copy(final String text) {
            runOnUiThread(new Runnable() {
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(ClipData.newPlainText("ledger", text));
                    Toast.makeText(MainActivity.this, "已复制到剪贴板", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_SUBJECT, "记账本备份");
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(i, "分享备份数据"));
                }
            });
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                public void run() {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public String lastCrash() {
            File cf = new File(getFilesDir(), "last_crash.txt");
            File nf = new File(getFilesDir(), "notif_error.txt");
            String c = readTextFile(cf);
            String n = readTextFile(nf);
            if (c.length() > 0) cf.delete();
            if (n.length() > 0) nf.delete();
            if (c.length() == 0 && n.length() == 0) return "";
            return (c.length() > 0 ? "CRASH:\n" + c : "") + (n.length() > 0 ? "\nNOTIF:\n" + n : "");
        }

        @JavascriptInterface
        public String appVersion() {
            return "1.3";
        }

        @JavascriptInterface
        public String peekIngest() { return Ingest.peek(MainActivity.this); }

        @JavascriptInterface
        public String takeIngest() { return Ingest.take(MainActivity.this); }

        @JavascriptInterface
        public void clearIngest() { Ingest.clear(MainActivity.this); }

        @JavascriptInterface
        public int ingestCount() { return Ingest.count(MainActivity.this); }

        @JavascriptInterface
        public boolean hasSmsPermission() {
            if (Build.VERSION.SDK_INT >= 23) {
                return checkSelfPermission("android.permission.RECEIVE_SMS") == PackageManager.PERMISSION_GRANTED;
            }
            return true;
        }

        @JavascriptInterface
        public void requestSmsPermission() {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (Build.VERSION.SDK_INT >= 23) {
                        requestPermissions(new String[]{ "android.permission.RECEIVE_SMS" }, REQ_SMS);
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean hasNotifAccess() {
            try {
                String s = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
                return s != null && s.contains(getPackageName());
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public void openNotifAccessSettings() {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                    } catch (Exception e) { /* ignore */ }
                }
            });
        }

        @JavascriptInterface
        public boolean setCourses(final String json) {
            try {
                File f = new File(getFilesDir(), "course.json");
                FileOutputStream out = new FileOutputStream(f);
                OutputStreamWriter w = new OutputStreamWriter(out, Charset.forName("UTF-8"));
                w.write(json);
                w.flush();
                w.close();
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public boolean setSchedules(final String json) {
            try {
                File f = new File(getFilesDir(), "schedule.json");
                FileOutputStream out = new FileOutputStream(f);
                OutputStreamWriter w = new OutputStreamWriter(out, Charset.forName("UTF-8"));
                w.write(json);
                w.flush();
                w.close();
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public boolean hasNotifPermission() {
            if (Build.VERSION.SDK_INT >= 33) {
                return checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
            }
            return true;
        }

        @JavascriptInterface
        public void requestNotifPermission() {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (Build.VERSION.SDK_INT >= 33) {
                        requestPermissions(new String[]{ "android.permission.POST_NOTIFICATIONS" }, REQ_NOTIF);
                    } else if (webView != null) {
                        webView.evaluateJavascript("window.__onNotifPermission && window.__onNotifPermission(true);", null);
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean startReminderService() {
            try {
                new File(getFilesDir(), "reminder_enabled").createNewFile();
                Intent i = new Intent(MainActivity.this, ReminderService.class);
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
                else startService(i);
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public void stopReminderService() {
            try {
                File f = new File(getFilesDir(), "reminder_enabled");
                if (f.exists()) f.delete();
                stopService(new Intent(MainActivity.this, ReminderService.class));
            } catch (Exception e) { /* ignore */ }
        }

        @JavascriptInterface
        public void openNotifSettings() {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                        i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                        startActivity(i);
                    } catch (Exception e) {
                        try {
                            Intent i2 = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                            i2.setData(Uri.parse("package:" + getPackageName()));
                            startActivity(i2);
                        } catch (Exception e2) { /* ignore */ }
                    }
                }
            });
        }

        /**
         * 后台线程发起 GET，完成后回调 JS：window.<callback>(status, body)
         * 走原生请求可绕开 WebView file:// 的跨域限制。
         */
        @JavascriptInterface
        public void httpGet(final String url, final String authHeader, final String callback) {
            final String cb = String.valueOf(callback).replaceAll("[^A-Za-z0-9_]", "");
            new Thread(new Runnable() {
                public void run() {
                    int code = -1;
                    String body = "";
                    HttpURLConnection conn = null;
                    try {
                        URL u = new URL(url);
                        conn = (HttpURLConnection) u.openConnection();
                        conn.setRequestMethod("GET");
                        conn.setConnectTimeout(10000);
                        conn.setReadTimeout(15000);
                        conn.setRequestProperty("Accept", "application/json");
                        if (authHeader != null && authHeader.length() > 0) {
                            conn.setRequestProperty("Authorization", authHeader);
                        }
                        code = conn.getResponseCode();
                        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                        if (is != null) {
                            BufferedReader r = new BufferedReader(new InputStreamReader(is, Charset.forName("UTF-8")));
                            StringBuilder sb = new StringBuilder();
                            String line;
                            while ((line = r.readLine()) != null) sb.append(line);
                            r.close();
                            body = sb.toString();
                        }
                    } catch (Exception e) {
                        code = -1;
                        body = "{\"error\":\"" + e.getClass().getSimpleName() + "\"}";
                    } finally {
                        if (conn != null) conn.disconnect();
                    }
                    final int fcode = code;
                    final String fbody = body;
                    final String js = "window." + cb + " && window." + cb + "(" + fcode + "," + JSONObject.quote(fbody) + ");";
                    runOnUiThread(new Runnable() {
                        public void run() {
                            if (webView != null) webView.evaluateJavascript(js, null);
                        }
                    });
                }
            }).start();
        }

        /**
         * 后台线程发起 POST(JSON)，完成后回调 JS：window.<callback>(status, body)
         */
        @JavascriptInterface
        public void httpPost(final String url, final String authHeader, final String payloadJson, final String callback) {
            final String cb = String.valueOf(callback).replaceAll("[^A-Za-z0-9_]", "");
            byte[] payload;
            try { payload = payloadJson.getBytes("UTF-8"); }
            catch (Exception e) { payload = new byte[0]; }
            final byte[] fpayload = payload;
            new Thread(new Runnable() {
                public void run() {
                    int code = -1;
                    String body = "";
                    HttpURLConnection conn = null;
                    try {
                        URL u = new URL(url);
                        conn = (HttpURLConnection) u.openConnection();
                        conn.setRequestMethod("POST");
                        conn.setConnectTimeout(15000);
                        conn.setReadTimeout(180000);
                        conn.setDoOutput(true);
                        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                        conn.setRequestProperty("Accept", "application/json");
                        if (authHeader != null && authHeader.length() > 0) {
                            conn.setRequestProperty("Authorization", authHeader);
                        }
                        conn.setFixedLengthStreamingMode(fpayload.length);
                        OutputStream os = conn.getOutputStream();
                        os.write(fpayload);
                        os.flush();
                        os.close();
                        code = conn.getResponseCode();
                        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                        if (is != null) {
                            BufferedReader r = new BufferedReader(new InputStreamReader(is, Charset.forName("UTF-8")));
                            StringBuilder sb = new StringBuilder();
                            String line;
                            while ((line = r.readLine()) != null) sb.append(line);
                            r.close();
                            body = sb.toString();
                        }
                    } catch (Exception e) {
                        code = -1;
                        body = "{\"error\":{\"message\":\"" + e.getClass().getSimpleName() + "\"}}";
                    } finally {
                        if (conn != null) conn.disconnect();
                    }
                    final int fcode = code;
                    final String fbody = body;
                    final String js = "window." + cb + " && window." + cb + "(" + fcode + "," + JSONObject.quote(fbody) + ");";
                    runOnUiThread(new Runnable() {
                        public void run() {
                            if (webView != null) webView.evaluateJavascript(js, null);
                        }
                    });
                }
            }).start();
        }

        /**
         * 后台线程 POST(JSON) 并流式回调（SSE）：每读到一行就 window.<callback>(line)；
         * 结束时回调 "\u0000END"，出错回调 "\u0000ERR <类型>"。
         */
        @JavascriptInterface
        public void httpPostStream(final String url, final String authHeader, final String payloadJson, final String callback) {
            final String cb = String.valueOf(callback).replaceAll("[^A-Za-z0-9_]", "");
            byte[] payload;
            try { payload = payloadJson.getBytes("UTF-8"); }
            catch (Exception e) { payload = new byte[0]; }
            final byte[] fpayload = payload;
            new Thread(new Runnable() {
                public void run() {
                    HttpURLConnection conn = null;
                    try {
                        URL u = new URL(url);
                        conn = (HttpURLConnection) u.openConnection();
                        conn.setRequestMethod("POST");
                        conn.setConnectTimeout(15000);
                        conn.setReadTimeout(180000);
                        conn.setDoOutput(true);
                        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                        conn.setRequestProperty("Accept", "text/event-stream");
                        if (authHeader != null && authHeader.length() > 0) {
                            conn.setRequestProperty("Authorization", authHeader);
                        }
                        conn.setFixedLengthStreamingMode(fpayload.length);
                        OutputStream os = conn.getOutputStream();
                        os.write(fpayload);
                        os.flush();
                        os.close();
                        int code = conn.getResponseCode();
                        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                        if (is == null) throw new Exception("no-stream");
                        BufferedReader r = new BufferedReader(new InputStreamReader(is, Charset.forName("UTF-8")));
                        String line;
                        while ((line = r.readLine()) != null) {
                            final String fl = line;
                            runOnUiThread(new Runnable() {
                                public void run() {
                                    if (webView != null) webView.evaluateJavascript("window." + cb + " && window." + cb + "(" + JSONObject.quote(fl) + ");", null);
                                }
                            });
                        }
                        r.close();
                        runOnUiThread(new Runnable() {
                            public void run() {
                                if (webView != null) webView.evaluateJavascript("window." + cb + " && window." + cb + "(\"\\u0000END\");", null);
                            }
                        });
                    } catch (Exception e) {
                        final String em = e.getClass().getSimpleName();
                        runOnUiThread(new Runnable() {
                            public void run() {
                                if (webView != null) webView.evaluateJavascript("window." + cb + " && window." + cb + "(\"\\u0000ERR " + em + "\");", null);
                            }
                        });
                    } finally {
                        if (conn != null) conn.disconnect();
                    }
                }
            }).start();
        }
    }
}
