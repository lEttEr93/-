package com.termux.jizhang;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;

/**
 * 采集队列：把收到的短信/通知原文追加到 files/ingest.jsonl。
 * 只做采集，不做解析；解析交给 JS / AI。
 */
public final class Ingest {
    private static final String FILE = "ingest.jsonl";
    private static final int MAX_BYTES = 256 * 1024;
    private static final int KEEP_LINES = 200;

    public static synchronized void appendAt(Context c, String src, String from, String title, String text, long t) {
        if (text == null) text = "";
        text = text.trim();
        if (text.length() == 0) return;
        try {
            JSONObject o = new JSONObject();
            o.put("t", t > 0 ? t : System.currentTimeMillis());
            o.put("src", src == null ? "" : src);
            o.put("from", from == null ? "" : from);
            o.put("title", title == null ? "" : title);
            o.put("text", text.length() > 2000 ? text.substring(0, 2000) : text);

            File f = new File(c.getFilesDir(), FILE);
            if (f.exists() && f.length() > MAX_BYTES) trim(f);
            FileOutputStream out = new FileOutputStream(f, true);
            out.write((o.toString() + "\n").getBytes("UTF-8"));
            out.flush();
            out.close();
        } catch (Exception e) { /* ignore */ }
    }

    private static void trim(File f) {
        try {
            BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), Charset.forName("UTF-8")));
            List<String> lines = new ArrayList<String>();
            String line;
            while ((line = r.readLine()) != null) {
                lines.add(line);
                if (lines.size() > KEEP_LINES * 2) lines.remove(0);
            }
            r.close();
            int from = Math.max(0, lines.size() - KEEP_LINES);
            FileOutputStream out = new FileOutputStream(f, false);
            for (int i = from; i < lines.size(); i++) out.write((lines.get(i) + "\n").getBytes("UTF-8"));
            out.flush();
            out.close();
        } catch (Exception e) { /* ignore */ }
    }

    public static synchronized String peek(Context c) {
        return readAll(new File(c.getFilesDir(), FILE));
    }

    public static synchronized String take(Context c) {
        File f = new File(c.getFilesDir(), FILE);
        String s = readAll(f);
        try { f.delete(); } catch (Exception e) { /* ignore */ }
        return s;
    }

    public static synchronized void clear(Context c) {
        try { new File(c.getFilesDir(), FILE).delete(); } catch (Exception e) { /* ignore */ }
    }

    public static synchronized int count(Context c) {
        try {
            File f = new File(c.getFilesDir(), FILE);
            if (!f.exists()) return 0;
            BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), Charset.forName("UTF-8")));
            int n = 0;
            while (r.readLine() != null) n++;
            r.close();
            return n;
        } catch (Exception e) { return 0; }
    }

    private static String readAll(File f) {
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
}
